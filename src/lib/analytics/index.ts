import type { Exercise, Session, SessionExercise, SessionRecord, Workout } from '../domain/types';
import { successful, units } from '../domain/session';
import { weekOf } from '../domain/time';
export interface Catalog {
	workouts: Workout[];
	exercises: Exercise[];
}
export function exclusionReasons(s: Session, catalog: Catalog, item?: SessionExercise): string[] {
	const reasons: string[] = [];
	if (s.deletedAt != null) reasons.push('Deleted session');
	if (s.status !== 'completed')
		reasons.push(s.status === 'abandoned' ? 'Abandoned workout' : 'Workout in progress');
	if (s.excludedFromStats)
		reasons.push(`Session excluded${s.exclusionReason ? ': ' + s.exclusionReason : ''}`);
	if (catalog.workouts.find((w) => w.id === s.templateId)?.excludedFromStats)
		reasons.push('Workout template excluded');
	if (item?.excludedFromStats)
		reasons.push(
			`This exercise occurrence excluded${item.exclusionReason ? ': ' + item.exclusionReason : ''}`
		);
	if (item && catalog.exercises.find((e) => e.id === item.exerciseId)?.excludedFromStats)
		reasons.push('Exercise globally excluded');
	return reasons;
}
export const sessionIncluded = (s: Session, c: Catalog) => exclusionReasons(s, c).length === 0;
export const itemIncluded = (s: Session, item: SessionExercise, c: Catalog) =>
	exclusionReasons(s, c, item).length === 0;
export const recordIncluded = (
	s: Session,
	item: SessionExercise,
	record: SessionRecord,
	c: Catalog
) => itemIncluded(s, item, c) && record.deletedAt == null && record.status !== 'skipped';
export function sessionMetrics(s: Session, c?: Catalog) {
	const items = c ? s.exercises.filter((item) => itemIncluded(s, item, c)) : s.exercises;
	let planned = 0,
		completed = 0,
		extra = 0,
		sets = 0,
		reps = 0,
		rounds = 0,
		holdSeconds = 0,
		activitySeconds = 0;
	for (const item of items) {
		planned += units(item.targetSnapshot);
		const good = s.records.filter((r) => r.sessionExerciseId === item.id && successful(r, item));
		completed += new Set(
			good.filter((r) => !r.isExtra && r.plannedUnitIndex !== null).map((r) => r.plannedUnitIndex)
		).size;
		extra += good.filter((r) => r.isExtra).length;
		sets += good.filter((r) => r.kind === 'strength').length;
		reps += good.reduce((sum, r) => sum + (r.reps || 0), 0);
		rounds += good.filter((r) => r.kind === 'isometric').length;
		holdSeconds += s.records
			.filter(
				(r) => r.sessionExerciseId === item.id && r.deletedAt == null && r.status === 'logged'
			)
			.reduce((sum, r) => sum + Object.values(r.holds || {}).reduce((a, b) => a + b, 0), 0);
		activitySeconds += good.reduce((sum, r) => sum + (r.durationSeconds || 0), 0);
	}
	return {
		planned,
		completed,
		extra,
		sets,
		reps,
		rounds,
		holdSeconds,
		activitySeconds,
		completion: planned ? Math.min(1, completed / planned) : null
	};
}
export function overview(sessions: Session[], c: Catalog) {
	const included = sessions.filter((s) => sessionIncluded(s, c));
	const durations = included.map((s) => s.durationSeconds).filter((d): d is number => d !== null);
	const weeks: Record<string, number> = {};
	included.forEach((s) => {
		const week = weekOf(s.workoutDate);
		weeks[week] = (weeks[week] || 0) + 1;
	});
	return {
		count: included.length,
		sets: included.reduce((n, s) => n + sessionMetrics(s, c).sets, 0),
		duration: durations.length ? durations.reduce((a, b) => a + b, 0) : null,
		averageDuration: durations.length
			? durations.reduce((a, b) => a + b, 0) / durations.length
			: null,
		weeks
	};
}
export function exerciseMetrics(
	s: Session,
	exerciseId: string,
	c: Catalog,
	selectedLoad?: number,
	mode: 'all' | 'bodyweight' | 'added' | 'assistance' = 'all'
) {
	const items = s.exercises.filter((e) => e.exerciseId === exerciseId);
	const entries = items.flatMap((item) =>
		s.records
			.filter((r) => r.sessionExerciseId === item.id && recordIncluded(s, item, r, c))
			.map((record) => ({ item, record }))
	);
	const filtered = entries.filter(
		({ record: r }) =>
			mode === 'all' ||
			(mode === 'bodyweight'
				? r.weightKg === 0
				: mode === 'added'
					? (r.weightKg || 0) > 0
					: (r.weightKg || 0) < 0)
	);
	const good = filtered.filter(({ item, record }) => successful(record, item));
	const external = good.filter(({ item }) => item.exerciseSnapshot.loadMode === 'external');
	const loads = external
		.map(({ record }) => record.weightKg)
		.filter((w): w is number => w !== undefined);
	const atLoad = good.filter(
		({ record }) => selectedLoad === undefined || record.weightKg === selectedLoad
	);
	return {
		entries: filtered,
		sets: good.filter(({ record }) => record.kind === 'strength').length,
		reps: good.reduce((n, { record }) => n + (record.reps || 0), 0),
		maxLoad: loads.length ? Math.max(...loads) : null,
		bestReps: atLoad.length ? Math.max(...atLoad.map(({ record }) => record.reps || 0)) : null,
		volume: external.length
			? external.reduce((n, { record }) => n + (record.weightKg || 0) * (record.reps || 0), 0)
			: null,
		rounds: good.filter(({ record }) => record.kind === 'isometric').length,
		holdSeconds: filtered.reduce(
			(n, { record }) => n + Object.values(record.holds || {}).reduce((a, b) => a + b, 0),
			0
		),
		durationSeconds: good.reduce((n, { record }) => n + (record.durationSeconds || 0), 0),
		distanceKm: good.some(({ record }) => record.distanceKm !== undefined)
			? good.reduce((n, { record }) => n + (record.distanceKm || 0), 0)
			: null
	};
}
export function previousResult(
	sessions: Session[],
	item: SessionExercise,
	c: Catalog
): { record: SessionRecord; date: string } | undefined {
	for (const s of [...sessions].sort(
		(a, b) => b.workoutDate.localeCompare(a.workoutDate) || b.startedAt - a.startedAt
	)) {
		const matching = s.exercises.filter(
			(e) =>
				e.exerciseId === item.exerciseId &&
				e.exerciseSnapshot.kind === item.exerciseSnapshot.kind &&
				e.exerciseSnapshot.loadMode === item.exerciseSnapshot.loadMode &&
				e.exerciseSnapshot.weightConvention === item.exerciseSnapshot.weightConvention
		);
		for (const e of matching) {
			const record = [...s.records]
				.reverse()
				.find(
					(r) => r.sessionExerciseId === e.id && recordIncluded(s, e, r, c) && successful(r, e)
				);
			if (record) return { record, date: s.workoutDate };
		}
	}
}
