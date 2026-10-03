import { recordIncluded, type Catalog } from './index';
import { shiftDate, weekOf, validDate } from '../domain/time';
import type { Convention, Session } from '../domain/types';

export const monthOf = (date: string) => date.slice(0, 7);
export function shiftMonth(month: string, amount: number): string {
	const date = new Date(`${month}-01T12:00:00Z`);
	date.setUTCMonth(date.getUTCMonth() + amount);
	return date.toISOString().slice(0, 7);
}
export function monthLabel(month: string): string {
	return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
		new Date(`${month}-01T12:00:00Z`)
	);
}
export function signedPercent(value: number | null): string {
	if (value === null) return '—';
	const rounded = Math.round(value * 10) / 10;
	return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}%`;
}
export function trendLabel(value: number | null): string {
	return value === null
		? 'Building a baseline'
		: value > 1
			? 'Stronger'
			: value < -1
				? 'Weaker'
				: 'Steady';
}
const median = (values: number[]): number => {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
interface Observation {
	date: string;
	reps: number;
	load: number;
}
interface Level {
	value: number;
	ready: boolean;
}
export interface ExerciseProgressPoint {
	month: string;
	load: number | null;
	change: number | null;
	matchedReps: number[];
}
export interface ExerciseProgress {
	key: string;
	exerciseId: string;
	name: string;
	weightConvention: Convention;
	points: ExerciseProgressPoint[];
}
export interface MonthlyProgress {
	month: string;
	index: number | null;
	change: number | null;
	compared: number;
	improving: number;
	declining: number;
	steady: number;
	fastest: { exercise: ExerciseProgress; change: number } | null;
}
export interface ProgressionReport {
	exercises: ExerciseProgress[];
	months: MonthlyProgress[];
}

// One top load per calendar day, then one median per week. More sets or
// sessions never become extra votes; every observed week has equal weight.
function typicalLoad(observations: Observation[]): Level | null {
	if (!observations.length) return null;
	const days = new Map<string, number>();
	for (const { date, load } of observations) days.set(date, Math.max(days.get(date) ?? 0, load));
	const weeks = new Map<string, number[]>();
	for (const [date, load] of days) {
		const week = weekOf(date);
		weeks.set(week, [...(weeks.get(week) ?? []), load]);
	}
	const dates = [...days.keys()].sort();
	return {
		value: median([...weeks.values()].map(median)),
		ready: weeks.size >= 2 && dates.at(-1)! >= shiftDate(dates[0], 7)
	};
}

/**
 * Monthly load index, rebased to 100 for the preceding calendar month.
 * Compare only identical exercise identities, weight conventions and full rep counts.
 * Each matched rep count needs observations spanning >= 7 days in both months.
 * Take the median log ratio across rep counts, then the equal-exercise geometric mean.
 * Missing observations stay missing; signed bodyweight and time never enter this index.
 */
export function progressionReport(
	sessions: Session[],
	catalog: Catalog,
	options: { from?: string; to: string; workoutId?: string; exerciseId?: string }
): ProgressionReport {
	if (
		!validDate(options.to) ||
		(options.from !== undefined && (!validDate(options.from) || options.from > options.to))
	)
		return { exercises: [], months: [] };
	const groups = new Map<
		string,
		{ exercise: Omit<ExerciseProgress, 'points'>; observations: Observation[] }
	>();
	for (const session of sessions) {
		if (
			session.workoutDate > options.to ||
			(options.workoutId && session.templateId !== options.workoutId)
		)
			continue;
		for (const item of session.exercises) {
			const definition = item.exerciseSnapshot;
			if (
				(options.exerciseId && item.exerciseId !== options.exerciseId) ||
				definition.kind !== 'strength' ||
				definition.loadMode !== 'external'
			)
				continue;
			const key = JSON.stringify([item.exerciseId, definition.weightConvention]);
			for (const record of session.records) {
				if (
					record.sessionExerciseId !== item.id ||
					!recordIncluded(session, item, record, catalog) ||
					record.status !== 'logged' ||
					record.kind !== 'strength' ||
					!Number.isInteger(record.reps) ||
					(record.reps ?? 0) <= 0 ||
					!Number.isFinite(record.weightKg) ||
					(record.weightKg ?? 0) <= 0
				)
					continue;
				let group = groups.get(key);
				if (!group) {
					group = {
						exercise: {
							key,
							exerciseId: item.exerciseId,
							name:
								catalog.exercises.find((e) => e.id === item.exerciseId)?.name ?? definition.name,
							weightConvention: definition.weightConvention
						},
						observations: []
					};
					groups.set(key, group);
				}
				// Failed half-rep markers do not turn an incomplete rep into a heavier comparable set.
				group.observations.push({
					date: session.workoutDate,
					reps: record.reps!,
					load: record.weightKg!
				});
			}
		}
	}
	const first =
		options.from ??
		[...groups.values()].flatMap((g) => g.observations.map((o) => o.date)).sort()[0] ??
		options.to;
	const months: string[] = [];
	for (let month = monthOf(first); month <= monthOf(options.to); month = shiftMonth(month, 1))
		months.push(month);
	const exercises = [...groups.values()]
		.map(({ exercise, observations }) => {
			const byMonth = new Map<string, Observation[]>();
			for (const observation of observations) {
				const month = monthOf(observation.date);
				byMonth.set(month, [...(byMonth.get(month) ?? []), observation]);
			}
			const points = months.map((month): ExerciseProgressPoint => {
				const current = byMonth.get(month) ?? [];
				const previous = byMonth.get(shiftMonth(month, -1)) ?? [];
				const matchedReps: number[] = [],
					ratios: number[] = [];
				for (const reps of [...new Set(current.map((o) => o.reps))].sort((a, b) => a - b)) {
					const now = typicalLoad(current.filter((o) => o.reps === reps));
					const before = typicalLoad(previous.filter((o) => o.reps === reps));
					if (now?.ready && before?.ready) {
						matchedReps.push(reps);
						ratios.push(Math.log(now.value / before.value));
					}
				}
				return {
					month,
					load: typicalLoad(current)?.value ?? null,
					change: ratios.length ? (Math.exp(median(ratios)) - 1) * 100 : null,
					matchedReps
				};
			});
			return { ...exercise, points };
		})
		.filter((exercise) => exercise.points.some((point) => point.load !== null))
		.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
	return {
		exercises,
		months: months.map((month, i) => {
			const compared = exercises
				.flatMap((exercise) => {
					const change = exercise.points[i].change;
					return change === null ? [] : [{ exercise, change }];
				})
				.sort((a, b) => b.change - a.change || a.exercise.name.localeCompare(b.exercise.name));
			const index = compared.length
				? 100 *
					Math.exp(
						compared.reduce((sum, row) => sum + Math.log1p(row.change / 100), 0) / compared.length
					)
				: null;
			return {
				month,
				index,
				change: index === null ? null : index - 100,
				compared: compared.length,
				improving: compared.filter((r) => r.change > 1).length,
				declining: compared.filter((r) => r.change < -1).length,
				steady: compared.filter((r) => Math.abs(r.change) <= 1).length,
				fastest: compared.find((r) => r.change > 1) ?? null
			};
		})
	};
}
