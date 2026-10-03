import type { Exercise, Session, SessionExercise, SessionRecord, Target, Workout } from './types';
import { dateInZone } from './time';
export const id = () => crypto.randomUUID();
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function units(target: Target): number {
	return 'sets' in target ? target.sets : 'rounds' in target ? target.rounds : 1;
}
export function plan(target: Target): string {
	return 'sets' in target
		? `${target.sets} × ${target.repsMin}–${target.repsMax} reps`
		: 'rounds' in target
			? `${target.rounds} rounds · ${target.holdSecondsMin}–${target.holdSecondsMax}s × ${target.directions.length} directions`
			: `${Math.round((target.durationSeconds / 60) * 10) / 10} min`;
}
export function loadLabel(exercise: { weightConvention: string }): string {
	return (
		{
			total: 'kg total',
			per_dumbbell: 'kg per dumbbell',
			machine_stack: 'kg on stack',
			as_logged: 'kg as logged',
			bodyweight_adjustment: 'kg adjustment',
			none: 'No load'
		}[exercise.weightConvention] || 'kg'
	);
}
export function makeSession(
	workout: Workout,
	exercises: Exercise[],
	timeZone: string,
	editorId: string,
	pastDate?: string
): Session {
	const now = Date.now();
	return {
		id: id(),
		templateId: workout.id,
		templateVersion: workout.version,
		nameSnapshot: workout.name,
		workoutDate: pastDate || dateInZone(now, timeZone),
		timeZoneAtStart: timeZone,
		status: 'in_progress',
		entryMode: pastDate ? 'retrospective' : 'live',
		startedAt: now,
		finishedAt: null,
		durationSeconds: null,
		notes: '',
		timerState: null,
		revision: 0,
		deletedAt: null,
		editorId,
		lastOperationId: '',
		excludedFromStats: false,
		records: [],
		exercises: workout.items.map((item, order) => {
			const definition = exercises.find((e) => e.id === item.exerciseId);
			if (!definition)
				throw new Error('An exercise is missing from your catalog. Edit the workout first.');
			const { key, name, kind, loadMode, weightConvention, notes } = definition;
			return {
				id: item.itemId,
				itemId: item.itemId,
				exerciseId: item.exerciseId,
				order,
				exerciseSnapshot: {
					key,
					name,
					kind,
					loadMode,
					weightConvention,
					...(notes ? { notes } : {})
				},
				targetSnapshot: clone(item.target),
				restSeconds: item.restSeconds,
				...(item.defaultWeightKg === undefined ? {} : { defaultWeightKg: item.defaultWeightKg }),
				notes: item.notes || '',
				excludedFromStats: false
			};
		})
	};
}
export function parseNumber(value: string, min: number, max: number, integer = false): number {
	if (!value.trim() || !/^-?\d+(?:[.,]\d+)?$/.test(value.trim()))
		throw new Error('Enter a number. Empty fields are not zero.');
	const n = Number(value.replace(',', '.'));
	if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n)))
		throw new Error(`Enter ${integer ? 'a whole number' : 'a number'} from ${min} to ${max}.`);
	return n;
}
// Reps remain whole completed repetitions in storage. A final failed attempt is an explicit marker.
export function countedReps(record: SessionRecord): number {
	return record.kind === 'strength'
		? (record.reps ?? 0) + (record.lastRepFailed === true ? 0.5 : 0)
		: 0;
}
export function successful(record: SessionRecord, item: SessionExercise): boolean {
	if (record.deletedAt != null || record.status !== 'logged') return false;
	if (record.kind === 'strength') return countedReps(record) > 0;
	if (record.kind === 'duration') return (record.durationSeconds ?? 0) > 0;
	return (
		'directions' in item.targetSnapshot &&
		item.targetSnapshot.directions.every((d) => (record.holds?.[d] ?? 0) > 0)
	);
}
export function nextUnit(session: Session, item: SessionExercise): number | null {
	const used = new Set(
		session.records
			.filter((r) => r.sessionExerciseId === item.id && r.deletedAt == null)
			.map((r) => r.plannedUnitIndex)
	);
	for (let n = 0; n < units(item.targetSnapshot); n++) if (!used.has(n)) return n;
	return null;
}
export function recordLabel(r: SessionRecord, item: SessionExercise): string {
	if (r.status === 'skipped') return 'Skipped';
	if (r.kind === 'strength') {
		const weight =
			r.weightKg === undefined
				? ''
				: ` · ${r.weightKg > 0 && item.exerciseSnapshot.loadMode === 'bodyweight' ? '+' : ''}${r.weightKg} ${loadLabel(item.exerciseSnapshot)}`;
		return `${countedReps(r)} reps${weight}${r.lastRepFailed ? ` · ${r.reps} full + 0.5 final failed rep` : r.status === 'failed' ? ' · Failed' : ''}`;
	}
	if (r.kind === 'isometric')
		return Object.entries(r.holds || {})
			.map(([d, s]) => `${d} ${s}s`)
			.join(' · ');
	return `${r.durationSeconds}s${r.distanceKm === undefined ? '' : ` · ${r.distanceKm} km`}`;
}

// Keep immutable exercise snapshots separate from the small editable per-occurrence state.
// Firestore can then enforce snapshot equality without an unbounded rules loop.
export function serializeSession(session: Session): Record<string, unknown> {
	const { records: _records, ...header } = clone(session);
	const clean = header as unknown as Record<string, unknown>;
	delete clean.createdAt;
	delete clean.updatedAt;
	clean.exercises = session.exercises.map(
		({ notes: _notes, excludedFromStats: _excluded, exclusionReason: _reason, ...snapshot }) =>
			clone(snapshot)
	);
	clean.exerciseStates = Object.fromEntries(
		session.exercises.map((item) => [
			item.id,
			{
				notes: item.notes,
				excludedFromStats: item.excludedFromStats,
				...(item.exclusionReason ? { exclusionReason: item.exclusionReason } : {})
			}
		])
	);
	return clean;
}
export function hydrateSession(
	data: Record<string, unknown>,
	records: SessionRecord[],
	sessionId: string
): Session {
	const states = (data.exerciseStates || {}) as Record<
		string,
		{ notes: string; excludedFromStats: boolean; exclusionReason?: string }
	>;
	return {
		...data,
		id: sessionId,
		exercises: (data.exercises as SessionExercise[]).map((item) => ({
			...item,
			...(states[item.id] || { notes: '', excludedFromStats: false })
		})),
		records: records.sort((a, b) => a.loggedAtClient - b.loggedAtClient || a.id.localeCompare(b.id))
	} as Session;
}
