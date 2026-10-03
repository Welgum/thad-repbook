import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateImport } from '../src/lib/validation/import';
import { materialize } from '../src/lib/seed/initialize';
import seed from '../src/lib/seed/bundle.json';
import { clone, makeSession, id, successful, parseNumber } from '../src/lib/domain/session';
import { dateInZone, calendarDays, weekOf, validDate } from '../src/lib/domain/time';
import { remaining, startRest, extendRest } from '../src/lib/domain/timer';
import {
	sessionMetrics,
	overview,
	exerciseMetrics,
	previousResult,
	sessionIncluded
} from '../src/lib/analytics';
import type { Bundle, SessionRecord } from '../src/lib/domain/types';
const catalog = materialize(seed as Bundle, 'seed-v1');
function session() {
	const s = makeSession(catalog.workouts[0], catalog.exercises, 'Europe/Warsaw', 'editor');
	s.status = 'completed';
	return s;
}
function record(itemId: string, options: Partial<SessionRecord> = {}): SessionRecord {
	return {
		id: id(),
		sessionExerciseId: itemId,
		sessionExerciseOrder: 0,
		kind: 'strength',
		plannedUnitIndex: 0,
		isExtra: false,
		status: 'logged',
		reps: 6,
		weightKg: 50,
		loggedAtClient: Date.now(),
		revision: 1,
		operationId: id(),
		deletedAt: null,
		...options
	};
}
describe('import contract and exact starter content', () => {
	it('validates the same 15-exercise, 5-program seed and downloadable example', () => {
		const result = validateImport(JSON.stringify(seed));
		expect(result.errors).toEqual([]);
		expect(result.bundle?.exercises).toHaveLength(15);
		expect(result.bundle?.workouts).toHaveLength(5);
		expect(JSON.parse(readFileSync('static/workouts.example.json', 'utf8'))).toEqual(seed);
		expect(seed.workouts.map((w) => w.name.split(' ')[0])).toEqual([
			'Monday',
			'Tuesday',
			'Wednesday',
			'Friday',
			'Saturday'
		]);
		expect(seed.workouts.flatMap((w) => w.items).every((i) => !('defaultWeightKg' in i))).toBe(
			true
		);
	});
	it.each([
		'unknown',
		'numericString',
		'duplicate',
		'reference',
		'kind',
		'range',
		'load',
		'direction',
		'null',
		'size'
	])('rejects %s errors before writes', (issue) => {
		const b = clone(seed) as unknown as Record<string, unknown>;
		const input = clone(seed) as Bundle;
		let value: unknown = input;
		if (issue === 'unknown') {
			b.extra = true;
			value = b;
		}
		if (issue === 'numericString')
			(input.workouts[0].items[0] as unknown as Record<string, unknown>).restSeconds = '60';
		if (issue === 'duplicate') input.exercises[1].key = input.exercises[0].key;
		if (issue === 'reference') input.workouts[0].items[0].exerciseKey = 'missing';
		if (issue === 'kind') input.workouts[0].items[0].target = { durationSeconds: 2 };
		if (issue === 'range')
			input.workouts[0].items[0].target = { sets: 3, repsMin: 20, repsMax: 10 };
		if (issue === 'load') input.workouts[0].items[0].defaultWeightKg = -10;
		if (issue === 'direction')
			input.workouts[0].items[4].target = {
				rounds: 2,
				directions: ['Front', ' Front '],
				holdSecondsMin: 5,
				holdSecondsMax: 10
			};
		if (issue === 'null')
			(input.workouts[0].items[0] as unknown as Record<string, unknown>).defaultWeightKg = null;
		if (issue === 'size') input.workouts[0].notes = 'a'.repeat(1048576);
		expect(validateImport(JSON.stringify(value)).errors.length).toBeGreaterThan(0);
	});
	it('trims identifiers and names without coercing numbers', () => {
		const input = clone(seed);
		input.exercises[0].name = ' Deadlift ';
		input.exercises[0].key = ' deadlift ';
		expect(validateImport(JSON.stringify(input)).bundle?.exercises[0].name).toBe('Deadlift');
	});
	it('shares Pull-up identity across Wednesday and Friday', () => {
		const wed = catalog.workouts[2].items[0].exerciseId;
		expect(catalog.workouts[3].items[0].exerciseId).toBe(wed);
	});
});
describe('one analytics inclusion pipeline', () => {
	it('uses successful planned units, excludes failed/skipped/deleted, caps completion and keeps extras separate', () => {
		const s = session();
		const item = s.exercises[0];
		s.records = [
			record(item.id),
			record(item.id, { id: id(), plannedUnitIndex: 1, status: 'failed', reps: 0 }),
			record(item.id, {
				id: id(),
				plannedUnitIndex: 2,
				status: 'skipped',
				reps: undefined,
				weightKg: undefined
			}),
			record(item.id, { id: id(), plannedUnitIndex: null, isExtra: true, reps: 10 }),
			record(item.id, { id: id(), deletedAt: Date.now() })
		];
		const m = sessionMetrics(s, catalog);
		expect(m.completed).toBe(1);
		expect(m.extra).toBe(1);
		expect(m.reps).toBe(16);
		expect(m.completion).toBeLessThanOrEqual(1);
	});
	it('keeps private exclusions when global exclusions are restored', () => {
		const c = clone(catalog);
		const s = session();
		s.records = [record(s.exercises[0].id)];
		s.exercises[0].excludedFromStats = true;
		c.workouts[0].excludedFromStats = true;
		expect(overview([s], c).count).toBe(0);
		c.workouts[0].excludedFromStats = false;
		expect(overview([s], c).count).toBe(1);
		expect(sessionMetrics(s, c).sets).toBe(0);
		s.exercises[0].excludedFromStats = false;
		expect(sessionMetrics(s, c).sets).toBe(1);
	});
	it('counts a session with all exercises excluded; empty plan is N/A; unknown duration is not zero', () => {
		const s = session();
		s.exercises.forEach((e) => (e.excludedFromStats = true));
		expect(sessionMetrics(s, catalog).completion).toBeNull();
		expect(overview([s], catalog)).toMatchObject({
			count: 1,
			duration: null,
			averageDuration: null
		});
	});
	it('does not double dumbbell volume and preserves signed bodyweight modes', () => {
		const s = session();
		const db = s.exercises[2];
		s.records = [record(db.id, { weightKg: 12.5, reps: 10 })];
		expect(exerciseMetrics(s, db.exerciseId, catalog).volume).toBe(125);
		const pull = makeSession(catalog.workouts[2], catalog.exercises, 'UTC', 'editor');
		pull.status = 'completed';
		const p = pull.exercises[0];
		pull.records = [
			record(p.id, { weightKg: 0 }),
			record(p.id, { weightKg: 10, plannedUnitIndex: 1 }),
			record(p.id, { weightKg: -20, plannedUnitIndex: 2 })
		];
		expect(exerciseMetrics(pull, p.exerciseId, catalog).volume).toBeNull();
		expect(
			exerciseMetrics(pull, p.exerciseId, catalog, undefined, 'assistance').entries
		).toHaveLength(1);
	});
	it('counts only full isometric rounds, but preserves partial holds', () => {
		const s = session();
		const item = s.exercises[4];
		const r = record(item.id, {
			kind: 'isometric',
			reps: undefined,
			weightKg: undefined,
			holds: { Front: 10, Back: 5, Left: 0, Right: 10 }
		});
		s.records = [r];
		expect(successful(r, item)).toBe(false);
		expect(sessionMetrics(s, catalog).holdSeconds).toBe(25);
		r.holds!.Left = 20;
		expect(sessionMetrics(s, catalog).rounds).toBe(1);
	});
	it('removes archived neither from stats nor suggestions, but global exclusions do remove them', () => {
		const c = clone(catalog),
			s = session();
		s.records = [record(s.exercises[0].id)];
		c.workouts[0].archivedAt = Date.now();
		expect(sessionIncluded(s, c)).toBe(true);
		expect(previousResult([s], s.exercises[0], c)?.record.weightKg).toBe(50);
		c.exercises[0].excludedFromStats = true;
		expect(previousResult([s], s.exercises[0], c)).toBeUndefined();
	});
	it('keeps immutable snapshot values after catalog and template edits', () => {
		const c = clone(catalog);
		const s = makeSession(c.workouts[0], c.exercises, 'UTC', 'editor');
		c.workouts[0].name = 'Different';
		c.exercises[0].name = 'Renamed';
		expect(s.nameSnapshot).toContain('Monday');
		expect(s.exercises[0].exerciseSnapshot.name).toBe('Deadlift');
	});
});
describe('deadlines, decimal input and stable calendar dates', () => {
	it('reconstructs rest after background/refresh without counting ticks', () => {
		const t = startRest(60, 'record', 'Deadlift', 1000)!;
		expect(remaining(JSON.parse(JSON.stringify(t)), 41000)).toBe(20);
		expect(remaining(t, 80000)).toBe(0);
		expect(remaining(extendRest(t, 80000), 80000)).toBe(30);
		expect(startRest(0, 'record', 'activity')).toBeNull();
	});
	it('supports comma decimals and rejects missing/negative external values', () => {
		expect(parseNumber('12,5', 0, 2000)).toBe(12.5);
		expect(parseNumber('0', 0, 2000)).toBe(0);
		expect(() => parseNumber('', 0, 2000)).toThrow();
		expect(() => parseNumber('-1', 0, 2000)).toThrow();
		expect(() => parseNumber('1e2', 0, 2000)).toThrow();
	});
	it('groups by explicit date through DST, midnight and month/year boundaries', () => {
		expect(dateInZone(Date.parse('2026-03-29T01:30:00Z'), 'Europe/Warsaw')).toBe('2026-03-29');
		expect(dateInZone(Date.parse('2026-12-31T23:30:00Z'), 'Europe/Warsaw')).toBe('2027-01-01');
		expect(dateInZone(Date.parse('2026-12-31T23:30:00Z'), 'America/New_York')).toBe('2026-12-31');
		expect(calendarDays('2027-01')).toHaveLength(42);
		expect(calendarDays('2027-01')[0]).toBe('2026-12-28');
		expect(weekOf('2027-01-03')).toBe('2026-12-28');
		expect(validDate('2026-02-30')).toBe(false);
	});
});

it('treats every non-null deletion timestamp as excluded, including epoch zero', () => {
	const s = session();
	s.deletedAt = 0;
	expect(sessionIncluded(s, catalog)).toBe(false);
	const r = record(s.exercises[0].id, { deletedAt: 0 });
	expect(successful(r, s.exercises[0])).toBe(false);
});
