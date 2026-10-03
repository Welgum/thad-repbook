import { recordIncluded, type Catalog } from './index';
import { shiftDate, weekOf, validDate } from '../domain/time';
import type { Convention, Session } from '../domain/types';
import { compareStrengthSets, strengthChange, strengthSet, type StrengthSet } from './strength';

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
interface Observation extends StrengthSet {
	date: string;
}
export interface ExerciseProgressPoint {
	week: string;
	strength: number | null;
	change: number | null;
	referenceSets: Observation[];
}
export interface ExerciseProgress {
	key: string;
	exerciseId: string;
	name: string;
	weightConvention: Convention;
	points: ExerciseProgressPoint[];
}
export interface WeeklyProgress {
	week: string;
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
	weeks: WeeklyProgress[];
}

// One best weight–rep result per calendar day, then the median of those scores.
// Repeated sets and same-day sessions never become extra votes.
function typicalStrength(observations: Observation[]) {
	const days = new Map<string, Observation>();
	for (const observation of observations) {
		const best = days.get(observation.date);
		if (!best || compareStrengthSets(observation, best) < 0)
			days.set(observation.date, observation);
	}
	const sorted = [...days.values()].sort(
		(a, b) => compareStrengthSets(a, b) || a.date.localeCompare(b.date)
	);
	const middle = Math.floor(sorted.length / 2);
	return {
		strength: sorted.length ? median(sorted.map((set) => set.strength)) : null,
		// Preserve both central real sets when the median falls between two days.
		referenceSets: sorted.slice(sorted.length % 2 ? middle : Math.max(0, middle - 1), middle + 1)
	};
}

/**
 * Weekly rep-adjusted strength index, rebased to 100 for the preceding week.
 * Compare identical exercise identities and weight conventions using full reps.
 * Each exercise needs at least one valid observation in each adjacent week.
 * Compare median daily-best scores, then take the equal-exercise geometric mean.
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
		return { exercises: [], weeks: [] };
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
				const set = strengthSet(record);
				if (
					record.sessionExerciseId !== item.id ||
					!recordIncluded(session, item, record, catalog) ||
					!set
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
				group.observations.push({
					date: session.workoutDate,
					...set
				});
			}
		}
	}
	const first =
		options.from ??
		[...groups.values()].flatMap((g) => g.observations.map((o) => o.date)).sort()[0] ??
		options.to;
	const weeks: string[] = [];
	for (let week = weekOf(first); week <= weekOf(options.to); week = shiftDate(week, 7))
		weeks.push(week);
	const exercises = [...groups.values()]
		.map(({ exercise, observations }) => {
			const byWeek = new Map<string, Observation[]>();
			for (const observation of observations) {
				const week = weekOf(observation.date);
				byWeek.set(week, [...(byWeek.get(week) ?? []), observation]);
			}
			const points = weeks.map((week): ExerciseProgressPoint => {
				const current = typicalStrength(byWeek.get(week) ?? []);
				const previous = typicalStrength(byWeek.get(shiftDate(week, -7)) ?? []);
				return {
					week,
					...current,
					change:
						current.strength !== null && previous.strength !== null
							? strengthChange(current.strength, previous.strength)
							: null
				};
			});
			return { ...exercise, points };
		})
		.filter((exercise) => exercise.points.some((point) => point.strength !== null))
		.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
	return {
		exercises,
		weeks: weeks.map((week, i) => {
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
				week,
				index,
				change: index === null ? null : strengthChange(index, 100),
				compared: compared.length,
				improving: compared.filter((r) => r.change > 1).length,
				declining: compared.filter((r) => r.change < -1).length,
				steady: compared.filter((r) => Math.abs(r.change) <= 1).length,
				fastest: compared.find((r) => r.change > 1) ?? null
			};
		})
	};
}
