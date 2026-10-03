import { describe, expect, it } from 'vitest';
import { materialize } from '../src/lib/seed/initialize';
import seed from '../src/lib/seed/bundle.json';
import {
	clone,
	countedReps,
	id,
	makeSession,
	recordLabel,
	successful
} from '../src/lib/domain/session';
import { exerciseMetrics, overview, previousResult, sessionMetrics } from '../src/lib/analytics';
import type { Bundle, SessionRecord } from '../src/lib/domain/types';

function fixture() {
	const catalog = materialize(seed as Bundle, 'seed-v1');
	const session = makeSession(catalog.workouts[0], catalog.exercises, 'UTC', 'editor');
	session.status = 'completed';
	const item = session.exercises[0];
	const record = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
		id: id(),
		sessionExerciseId: item.id,
		sessionExerciseOrder: item.order,
		kind: 'strength',
		plannedUnitIndex: 0,
		isExtra: false,
		status: 'logged',
		reps: 8,
		weightKg: 50,
		loggedAtClient: Date.now(),
		revision: 1,
		operationId: id(),
		deletedAt: null,
		...overrides
	});
	return { catalog, session, item, record };
}

describe('final-rep failure accounting', () => {
	it('keeps legacy reps unchanged and stores full reps separately from the half-rep marker', () => {
		const { session, item, record } = fixture();
		const legacy = record();
		const failure = record({ lastRepFailed: true });
		expect(countedReps(legacy)).toBe(8);
		expect(countedReps(failure)).toBe(8.5);
		expect(failure.reps).toBe(8);
		expect(recordLabel(failure, item)).toContain('8.5 reps');
		expect(recordLabel(failure, item)).toContain('8 full + 0.5 final failed rep');
		session.records = [failure];
		expect(sessionMetrics(session)).toMatchObject({
			completed: 1,
			sets: 1,
			failureSets: 1,
			reps: 8.5
		});
	});

	it('includes marked extras in reps and volume but not planned completion, and omits failed/deleted/skipped records', () => {
		const { session, catalog, item, record } = fixture();
		session.records = [
			record({ lastRepFailed: true }),
			record({ reps: 6, plannedUnitIndex: 1 }),
			record({ reps: 0, status: 'failed', plannedUnitIndex: 2 }),
			record({ reps: 2, lastRepFailed: true, plannedUnitIndex: null, isExtra: true }),
			record({ lastRepFailed: true, deletedAt: Date.now() }),
			record({ status: 'skipped', reps: undefined, weightKg: undefined })
		];
		expect(sessionMetrics(session, catalog)).toMatchObject({
			completed: 2,
			sets: 3,
			extra: 1,
			reps: 17,
			failureSets: 2
		});
		expect(exerciseMetrics(session, item.exerciseId, catalog, 50)).toMatchObject({
			reps: 17,
			bestReps: 8.5,
			volume: 850,
			failureSets: 2
		});
		expect(exerciseMetrics(session, item.exerciseId, catalog, 60).bestReps).toBeNull();
		expect(overview([session], catalog)).toMatchObject({ sets: 3, failureSets: 2 });
	});

	it.each(['session', 'workout', 'exercise', 'occurrence', 'deleted', 'abandoned'] as const)(
		'respects %s exclusions for failure statistics',
		(scope) => {
			const { session, catalog, item, record } = fixture();
			session.records = [record({ lastRepFailed: true })];
			if (scope === 'session') session.excludedFromStats = true;
			if (scope === 'workout') catalog.workouts[0].excludedFromStats = true;
			if (scope === 'exercise')
				catalog.exercises.find((e) => e.id === item.exerciseId)!.excludedFromStats = true;
			if (scope === 'occurrence') item.excludedFromStats = true;
			if (scope === 'deleted') session.deletedAt = Date.now();
			if (scope === 'abandoned') session.status = 'abandoned';
			expect(exerciseMetrics(session, item.exerciseId, catalog)).toMatchObject({
				reps: 0,
				failureSets: 0,
				volume: null
			});
			expect(overview([session], catalog).failureSets).toBe(0);
		}
	);

	it('distinguishes a half-rep attempt from a zero-rep failed set', () => {
		const { item, record } = fixture();
		const half = record({ reps: 0, lastRepFailed: true });
		const failed = record({ reps: 0, status: 'failed' });
		expect(countedReps(half)).toBe(0.5);
		expect(successful(half, item)).toBe(true);
		expect(successful(failed, item)).toBe(false);
	});

	it('recalculates corrected history and preserves full-rep suggestions', () => {
		const { session, catalog, item, record } = fixture();
		session.records = [record({ lastRepFailed: true })];
		const suggestion = previousResult([session], item, catalog)!;
		expect(suggestion.record.reps).toBe(8);
		expect(suggestion.record.lastRepFailed).toBe(true);
		const corrected = clone(session);
		delete corrected.records[0].lastRepFailed;
		expect(exerciseMetrics(corrected, item.exerciseId, catalog)).toMatchObject({
			reps: 8,
			failureSets: 0,
			volume: 400,
			bestReps: 8
		});
	});

	it('keeps signed bodyweight modes separate and does not compute their volume', () => {
		const { catalog } = fixture();
		const session = makeSession(catalog.workouts[2], catalog.exercises, 'UTC', 'editor');
		session.status = 'completed';
		const item = session.exercises[0];
		const { record } = fixture();
		session.records = [
			record({ sessionExerciseId: item.id, lastRepFailed: true, weightKg: -10 }),
			record({ sessionExerciseId: item.id, lastRepFailed: true, weightKg: 10, plannedUnitIndex: 1 })
		];
		expect(
			exerciseMetrics(session, item.exerciseId, catalog, undefined, 'assistance')
		).toMatchObject({ reps: 8.5, failureSets: 1, volume: null });
	});
});
