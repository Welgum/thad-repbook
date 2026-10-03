import { describe, expect, it } from 'vitest';
import { progressionReport, shiftMonth, trendLabel } from '../src/lib/analytics/progression';
import { clone, id, makeSession } from '../src/lib/domain/session';
import { materialize } from '../src/lib/seed/initialize';
import seed from '../src/lib/seed/bundle.json';
import type { Bundle, Session, SessionRecord } from '../src/lib/domain/types';

const catalog = materialize(seed as Bundle, 'seed-v1');
const options = { from: '2026-09-01', to: '2026-09-30' };
function session(date: string, weightKg: number, reps = 8, itemIndex = 0): Session {
	const s = makeSession(catalog.workouts[0], catalog.exercises, 'Europe/Warsaw', 'test', date);
	s.status = 'completed';
	s.records = [
		{
			id: id(),
			sessionExerciseId: s.exercises[itemIndex].id,
			sessionExerciseOrder: itemIndex,
			kind: 'strength',
			plannedUnitIndex: 0,
			isExtra: false,
			status: 'logged',
			reps,
			weightKg,
			loggedAtClient: 1,
			revision: 1,
			operationId: id(),
			deletedAt: null
		}
	];
	return s;
}
function history(before = 50, after = 55, reps = 8, itemIndex = 0) {
	return [
		'2026-08-03',
		'2026-08-10',
		'2026-08-17',
		'2026-08-24',
		'2026-09-03',
		'2026-09-10',
		'2026-09-17',
		'2026-09-24'
	].map((date) => session(date, date.includes('-08-') ? before : after, reps, itemIndex));
}
const score = (sessions: Session[]) => progressionReport(sessions, catalog, options).months[0];

describe('stable monthly load progression', () => {
	it('compares matching full reps and uses 100 as the previous-month baseline', () => {
		const report = progressionReport(history(), catalog, options);
		expect(report.months[0].index).toBeCloseTo(110);
		expect(report.months[0].change).toBeCloseTo(10);
		expect(report.months[0].improving).toBe(1);
		expect(report.exercises[0].points[0].matchedReps).toEqual([8]);
	});
	it('does not reward more sets, same-day sessions, or repeated constant-load training days', () => {
		const original = history();
		const extraSets = clone(original).map((s) => ({
			...s,
			records: Array.from({ length: 12 }, () => ({
				...s.records[0],
				id: id(),
				isExtra: true,
				plannedUnitIndex: null
			}))
		}));
		const moreDays = ['2026-09-04', '2026-09-05', '2026-09-06', '2026-09-11'].map((date) =>
			session(date, 55)
		);
		expect(score([...original, ...extraSets, ...moreDays]).index).toBeCloseTo(
			score(original).index!
		);
	});
	it('weights each exercise equally regardless of frequency, absolute weight or number of rep ranges', () => {
		const a = history(50, 55),
			b = history(200, 180, 8, 1);
		const moreA = history(50, 55, 10);
		const result = score([...a, ...b, ...moreA, ...clone(a), ...clone(a)]);
		expect(result.index).toBeCloseTo(100 * Math.sqrt(1.1 * 0.9));
		expect(result.compared).toBe(2);
		expect(result.fastest?.exercise.exerciseId).toBe(a[0].exercises[0].exerciseId);
		expect(result.declining).toBe(1);
	});
	it('smooths isolated high and low load outliers rather than retaining a lifetime PR', () => {
		const data = history();
		data[4].records[0].weightKg = 500;
		data[5].records[0].weightKg = 5;
		expect(score(data).index).toBeCloseTo(110);
		expect(score(history(60, 50)).index).toBeCloseTo((100 * 50) / 60);
		expect(score(history(60, 50)).fastest).toBeNull();
	});
	it('does not infer improvement from heavier sets performed for fewer reps', () => {
		const data = history();
		data.filter((s) => s.workoutDate.includes('-09-')).forEach((s) => (s.records[0].reps = 3));
		expect(score(data).index).toBeNull();
	});
	it('requires history spanning at least seven days in each month, not merely crossing Monday', () => {
		expect(
			score([
				session('2026-08-30', 50),
				session('2026-08-31', 50),
				session('2026-09-06', 55),
				session('2026-09-07', 55)
			]).index
		).toBeNull();
		expect(
			score([
				session('2026-08-03', 50),
				session('2026-08-10', 50),
				session('2026-09-03', 55),
				session('2026-09-10', 55)
			]).index
		).toBeCloseTo(110);
	});
	it('keeps missing months and new exercises unscored, and ignores future sessions', () => {
		const data = [...history(), session('2026-09-04', 900, 8, 1), session('2026-10-01', 999)];
		expect(score(data).compared).toBe(1);
		const report = progressionReport(history(), catalog, { from: '2026-07-01', to: '2026-11-30' });
		expect(report.months.map((m) => m.index === null)).toEqual([true, true, false, true, true]);
		expect(report.exercises[0].points.at(-1)?.load).toBeNull();
	});
	it.each(['session', 'occurrence', 'workout', 'exercise', 'deleted', 'abandoned', 'in_progress'])(
		'respects %s exclusion',
		(scope) => {
			const data = history(),
				c = clone(catalog);
			for (const s of data) {
				if (scope === 'session') s.excludedFromStats = true;
				if (scope === 'occurrence') s.exercises[0].excludedFromStats = true;
				if (scope === 'deleted') s.deletedAt = 1;
				if (scope === 'abandoned' || scope === 'in_progress') s.status = scope;
			}
			if (scope === 'workout') c.workouts[0].excludedFromStats = true;
			if (scope === 'exercise')
				c.exercises.find((e) => e.id === data[0].exercises[0].exerciseId)!.excludedFromStats = true;
			expect(progressionReport(data, c, options).months[0].index).toBeNull();
		}
	);
	it.each([
		{ status: 'skipped' },
		{ status: 'failed' },
		{ deletedAt: 1 },
		{ weightKg: 0 },
		{ weightKg: -20 },
		{ weightKg: NaN },
		{ weightKg: Infinity },
		{ weightKg: undefined },
		{ reps: 0, lastRepFailed: true }
	])('ignores invalid or incomplete sets %o', (patch) => {
		const data = history();
		data.forEach((s) => Object.assign(s.records[0], patch as Partial<SessionRecord>));
		expect(score(data).index).toBeNull();
	});
	it('does not award extra strength for half-rep failure markers', () => {
		const data = history();
		data
			.filter((s) => s.workoutDate.includes('-09-'))
			.forEach((s) => (s.records[0].lastRepFailed = true));
		expect(score(data).index).toBeCloseTo(110);
	});
	it('keeps snapshot weight conventions separate and excludes bodyweight, holds and cardio', () => {
		for (const mode of ['convention', 'bodyweight', 'isometric', 'duration']) {
			const data = history();
			data
				.filter((s) => s.workoutDate.includes('-09-'))
				.forEach((s) => {
					if (mode === 'convention')
						s.exercises[0].exerciseSnapshot.weightConvention = 'per_dumbbell';
					if (mode === 'bodyweight') s.exercises[0].exerciseSnapshot.loadMode = 'bodyweight';
					if (mode === 'isometric' || mode === 'duration')
						s.exercises[0].exerciseSnapshot.kind = mode;
				});
			expect(score(data).index).toBeNull();
		}
	});
	it('keeps archived history and applies workout / exercise filters to both comparison months', () => {
		const a = history(),
			b = history(200, 180, 8, 1);
		b.forEach((s) => (s.templateId = 'another-workout'));
		const c = clone(catalog);
		c.workouts[0].archivedAt = 1;
		c.exercises[0].archivedAt = 1;
		expect(
			progressionReport([...a, ...b], c, { ...options, workoutId: a[0].templateId }).months[0].index
		).toBeCloseTo(110);
		expect(
			progressionReport([...a, ...b], c, { ...options, exerciseId: b[0].exercises[1].exerciseId })
				.months[0].index
		).toBeCloseTo(90);
	});
	it('handles empty histories, invalid ranges and year / leap-month boundaries', () => {
		expect(score([]).index).toBeNull();
		expect(progressionReport(history(), catalog, { from: '', to: '2026-09-30' }).months).toEqual(
			[]
		);
		expect(shiftMonth('2026-01', -1)).toBe('2025-12');
		expect(shiftMonth('2024-02', 1)).toBe('2024-03');
		expect(trendLabel(0.5)).toBe('Steady');
	});
});
