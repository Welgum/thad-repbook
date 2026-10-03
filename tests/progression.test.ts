import { describe, expect, it } from 'vitest';
import { progressionReport, trendLabel } from '../src/lib/analytics/progression';
import { bestStrengthSet, strengthSet } from '../src/lib/analytics/strength';
import { shiftDate, weekOf } from '../src/lib/domain/time';
import { clone, id, makeSession } from '../src/lib/domain/session';
import { materialize } from '../src/lib/seed/initialize';
import seed from '../src/lib/seed/bundle.json';
import type { Bundle, Session, SessionRecord } from '../src/lib/domain/types';

const catalog = materialize(seed as Bundle, 'seed-v1');
const options = { from: '2026-09-07', to: '2026-09-13' };
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
		'2026-08-31',
		'2026-09-02',
		'2026-09-04',
		'2026-09-06',
		'2026-09-07',
		'2026-09-09',
		'2026-09-11',
		'2026-09-13'
	].map((date) => session(date, date < options.from ? before : after, reps, itemIndex));
}
const score = (sessions: Session[]) => progressionReport(sessions, catalog, options).weeks[0];

describe('stable weekly weight and rep progression', () => {
	it('compares matching full reps and uses 100 as the previous-week baseline', () => {
		const report = progressionReport(history(), catalog, options);
		expect(report.weeks[0].index).toBeCloseTo(110);
		expect(report.weeks[0].change).toBeCloseTo(10);
		expect(report.weeks[0].improving).toBe(1);
		expect(report.exercises[0].points[0].strength).toBeCloseTo(55 * (1 + 8 / 30));
		expect(report.exercises[0].points[0].referenceSets).toHaveLength(2);
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
		const moreDays = ['2026-09-08', '2026-09-10', '2026-09-12'].map((date) => session(date, 55));
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
	it('counts more completed reps at the same weight as progress', () => {
		const result = score([session('2026-09-06', 50, 8), session('2026-09-07', 50, 10)]);
		expect(result.change).toBeCloseTo(5.2631579);
		expect(result.improving).toBe(1);
	});
	it.each([
		[55, 8, 4.5, 'Stronger'],
		[55, 6, -1, 'Steady'],
		[55, 3, -9.25, 'Weaker'],
		[48, 12, 0.8, 'Steady'],
		[50, 8, -5, 'Weaker']
	])('balances 50 kg × 10 against %s kg × %s reps', (weight, reps, change, direction) => {
		const result = score([session('2026-09-06', 50, 10), session('2026-09-07', weight, reps)]);
		expect(result.change).toBeCloseTo(change);
		expect(trendLabel(result.change)).toBe(direction);
	});
	it('preserves actual set pairs and both middle sets instead of inventing a median pair', () => {
		const data = [session('2026-09-07', 50, 10), session('2026-09-08', 55, 8)];
		// The heaviest set and the most reps are not necessarily the strongest result.
		data[0].records.push({ ...data[0].records[0], id: id(), weightKg: 60, reps: 1 });
		data[0].records.push({ ...data[0].records[0], id: id(), weightKg: 20, reps: 20 });
		const report = progressionReport(data, catalog, options);
		const point = report.exercises[0].points[0];
		expect(point.strength).toBeCloseTo((50 * (1 + 10 / 30) + 55 * (1 + 8 / 30)) / 2);
		expect(point.referenceSets.map(({ load, reps }) => [load, reps])).toEqual([
			[55, 8],
			[50, 10]
		]);
		const entries = data[0].records.map((record) => ({ item: data[0].exercises[0], record }));
		expect(bestStrengthSet(entries, 'total')).toMatchObject({ load: 50, reps: 10 });
		expect(bestStrengthSet(entries.reverse(), 'total')).toMatchObject({ load: 50, reps: 10 });
		expect(bestStrengthSet(entries, 'per_dumbbell')).toBeNull();
	});
	it('retains rep progress for singles and higher-rep sets without a silent rep cap', () => {
		for (const reps of [1, 10, 15, 20]) {
			const result = score([session('2026-09-06', 50, reps), session('2026-09-07', 50, reps + 1)]);
			expect(result.index).toBeGreaterThan(100);
		}
		expect(strengthSet(session('2026-09-07', Number.MAX_VALUE, 30).records[0])).toBeNull();
	});
	it('supports one matching log per week, including Sunday to Monday, without needing a month of history', () => {
		expect(score([session('2026-09-06', 50), session('2026-09-07', 55)]).index).toBeCloseTo(110);
		expect(score([session('2026-09-07', 50), session('2026-09-13', 55)]).index).toBeNull();
	});
	it('keeps missing weeks and new exercises unscored, and ignores future sessions', () => {
		const data = [...history(), session('2026-09-08', 900, 8, 1), session('2026-09-14', 999)];
		expect(score(data).compared).toBe(1);
		const report = progressionReport(history(), catalog, { from: '2026-08-24', to: '2026-09-27' });
		expect(report.weeks.map((w) => w.index === null)).toEqual([true, true, false, true, true]);
		expect(report.exercises[0].points.at(-1)?.strength).toBeNull();
		// Returning after a missing week does not compare against stale results.
		expect(
			progressionReport([...history(), session('2026-09-21', 80)], catalog, {
				from: '2026-09-21',
				to: '2026-09-27'
			}).weeks[0].index
		).toBeNull();
	});
	it('uses only results through the cutoff for an unfinished week', () => {
		const data = history();
		data[5].records[0].weightKg = 999;
		const report = progressionReport(data, catalog, { from: '2026-09-07', to: '2026-09-08' });
		expect(report.weeks[0].index).toBeCloseTo(110);
		expect(report.exercises[0].points[0].referenceSets[0]).toMatchObject({ load: 55, reps: 8 });
	});
	it('includes the complete starting week when a custom range starts midweek', () => {
		const data = [session('2026-09-06', 50), session('2026-09-07', 55)];
		const report = progressionReport(data, catalog, { from: '2026-09-10', to: '2026-09-13' });
		expect(report.weeks[0].week).toBe('2026-09-07');
		expect(report.weeks[0].index).toBeCloseTo(110);
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
			expect(progressionReport(data, c, options).weeks[0].index).toBeNull();
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
		{ reps: -1 },
		{ reps: 8.5 },
		{ reps: NaN },
		{ reps: Infinity },
		{ reps: undefined },
		{ reps: 0, lastRepFailed: true }
	])('ignores invalid or incomplete sets %o', (patch) => {
		const data = history();
		data.forEach((s) => Object.assign(s.records[0], patch as Partial<SessionRecord>));
		expect(score(data).index).toBeNull();
	});
	it('does not award extra strength for half-rep failure markers', () => {
		const data = history();
		data
			.filter((s) => s.workoutDate >= options.from)
			.forEach((s) => (s.records[0].lastRepFailed = true));
		expect(score(data).index).toBeCloseTo(110);
	});
	it('keeps snapshot weight conventions separate and excludes bodyweight, holds and cardio', () => {
		for (const mode of ['convention', 'bodyweight', 'isometric', 'duration']) {
			const data = history();
			data
				.filter((s) => s.workoutDate >= options.from)
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
	it('keeps archived history and applies workout / exercise filters to both comparison weeks', () => {
		const a = history(),
			b = history(200, 180, 8, 1);
		b.forEach((s) => (s.templateId = 'another-workout'));
		const c = clone(catalog);
		c.workouts[0].archivedAt = 1;
		c.exercises[0].archivedAt = 1;
		expect(
			progressionReport([...a, ...b], c, { ...options, workoutId: a[0].templateId }).weeks[0].index
		).toBeCloseTo(110);
		expect(
			progressionReport([...a, ...b], c, { ...options, exerciseId: b[0].exercises[1].exerciseId })
				.weeks[0].index
		).toBeCloseTo(90);
	});
	it('handles empty histories and invalid ranges', () => {
		expect(score([]).index).toBeNull();
		expect(progressionReport(history(), catalog, { from: '', to: options.to }).weeks).toEqual([]);
		expect(trendLabel(0.5)).toBe('Steady');
	});
	it.each([
		['2026-01-02', '2026-01-05', '2025-12-29'],
		['2024-02-29', '2024-03-04', '2024-02-26'],
		['2026-03-29', '2026-03-30', '2026-03-23']
	])(
		'keeps calendar weeks intact across year, leap-month and DST boundaries: %s',
		(before, after, baseline) => {
			const report = progressionReport([session(before, 50), session(after, 55)], catalog, {
				from: before,
				to: shiftDate(after, 6)
			});
			expect(report.weeks.map((w) => w.week)).toEqual([baseline, weekOf(after)]);
			expect(report.weeks[0].index).toBeNull();
			expect(report.weeks[1].index).toBeCloseTo(110);
		}
	);
});
