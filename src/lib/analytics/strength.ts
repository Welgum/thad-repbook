import type { SessionExercise, SessionRecord } from '../domain/types';

export interface StrengthSet {
	load: number;
	reps: number;
	strength: number;
}

// Epley-style comparison score, not a measured maximum. Use full completed reps
// consistently, including singles; failure markers never increase the estimate.
export function strengthSet(record: SessionRecord): StrengthSet | null {
	if (
		record.kind !== 'strength' ||
		record.status !== 'logged' ||
		record.deletedAt != null ||
		!Number.isInteger(record.reps) ||
		(record.reps ?? 0) <= 0 ||
		!Number.isFinite(record.weightKg) ||
		(record.weightKg ?? 0) <= 0
	)
		return null;
	const strength = record.weightKg! * (1 + record.reps! / 30);
	return Number.isFinite(strength)
		? { load: record.weightKg!, reps: record.reps!, strength }
		: null;
}

// Deterministic ties keep the same real weight–rep pair regardless of record order.
export function compareStrengthSets(a: StrengthSet, b: StrengthSet): number {
	return b.strength - a.strength || b.load - a.load || b.reps - a.reps;
}

export function bestStrengthSet(
	entries: { item: SessionExercise; record: SessionRecord }[],
	convention: SessionExercise['exerciseSnapshot']['weightConvention']
): StrengthSet | null {
	return (
		entries
			.flatMap(({ item, record }) => {
				if (
					item.exerciseSnapshot.kind !== 'strength' ||
					item.exerciseSnapshot.loadMode !== 'external' ||
					item.exerciseSnapshot.weightConvention !== convention
				)
					return [];
				const set = strengthSet(record);
				return set ? [set] : [];
			})
			.sort(compareStrengthSets)[0] ?? null
	);
}

export const strengthSetLabel = (set: StrengthSet): string => `${set.load} kg × ${set.reps} reps`;

// Remove floating-point noise at the ±1% steady threshold.
export const strengthChange = (current: number, previous: number): number =>
	Number(((current / previous - 1) * 100).toFixed(10));
