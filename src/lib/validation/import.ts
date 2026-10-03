import Ajv from 'ajv';
import schema from './workouts.schema.json';
import type { Bundle, ExerciseDefinition } from '../domain/types';
const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
export { schema };
export const compatible = (a: ExerciseDefinition, b: ExerciseDefinition) =>
	a.kind === b.kind && a.loadMode === b.loadMode && a.weightConvention === b.weightConvention;
export function validateImport(text: string): { bundle?: Bundle; errors: string[] } {
	const errors: string[] = [];
	if (new TextEncoder().encode(text).length > 1048576)
		return { errors: ['file: maximum size is 1 MiB. Split this file into smaller bundles.'] };
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return {
			errors: ['file: invalid JSON. Remove comments, trailing commas and check quotation marks.']
		};
	}
	// Normalize only strings intended as identities/display names. Never coerce numeric fields.
	const trim = (value: unknown): void => {
		if (Array.isArray(value)) value.forEach(trim);
		else if (value && typeof value === 'object')
			for (const [k, v] of Object.entries(value)) {
				if (typeof v === 'string' && ['key', 'name', 'itemKey', 'exerciseKey'].includes(k))
					(value as Record<string, unknown>)[k] = v.trim();
				else if (k === 'directions' && Array.isArray(v))
					(value as Record<string, unknown>)[k] = v.map((s) =>
						typeof s === 'string' ? s.trim() : s
					);
				else trim(v);
			}
	};
	trim(raw);
	if (!validate(raw))
		return {
			errors: (validate.errors || []).map(
				(e) =>
					`${
						e.instancePath
							.replace(/\/(\d+)/g, '[$1]')
							.replace(/\//g, '.')
							.replace(/^\./, '') || 'root'
					}${e.keyword === 'additionalProperties' ? '.' + e.params.additionalProperty : ''}: ${e.message}`
			)
		};
	const b = raw as unknown as Bundle;
	const unique = (values: string[], path: string) => {
		const seen = new Set<string>();
		values.forEach((v, i) => {
			if (seen.has(v)) errors.push(`${path}[${i}]: duplicate key "${v}".`);
			seen.add(v);
		});
	};
	unique(
		b.exercises.map((e) => e.key),
		'exercises'
	);
	unique(
		b.workouts.map((w) => w.key),
		'workouts'
	);
	b.exercises.forEach((e, i) => {
		const valid =
			e.kind !== 'strength'
				? e.loadMode === 'none' && e.weightConvention === 'none'
				: e.loadMode === 'external'
					? ['total', 'per_dumbbell', 'machine_stack', 'as_logged'].includes(e.weightConvention)
					: e.loadMode === 'bodyweight'
						? e.weightConvention === 'bodyweight_adjustment'
						: e.weightConvention === 'none';
		if (!valid) errors.push(`exercises[${i}].weightConvention: incompatible with kind/loadMode.`);
	});
	b.workouts.forEach((w, i) => {
		unique(
			w.items.map((t) => t.itemKey),
			`workouts[${i}].items`
		);
		if (new TextEncoder().encode(JSON.stringify(w)).length > 65536)
			errors.push(`workouts[${i}]: template exceeds 64 KiB. Split this workout.`);
		w.items.forEach((item, j) => {
			const p = `workouts[${i}].items[${j}]`;
			const e = b.exercises.find((e) => e.key === item.exerciseKey);
			if (!e) {
				errors.push(`${p}.exerciseKey: unknown exercise "${item.exerciseKey}".`);
				return;
			}
			const t = item.target;
			if (
				e.kind === 'strength'
					? !('sets' in t)
					: e.kind === 'isometric'
						? !('rounds' in t)
						: !('durationSeconds' in t)
			)
				errors.push(`${p}.target: must match exercise kind ${e.kind}.`);
			if ('repsMin' in t && t.repsMin > t.repsMax)
				errors.push(`${p}.target.repsMin: must be at most repsMax.`);
			if ('holdSecondsMin' in t && t.holdSecondsMin > t.holdSecondsMax)
				errors.push(`${p}.target.holdSecondsMin: must be at most holdSecondsMax.`);
			if (
				item.defaultWeightKg !== undefined &&
				(e.kind !== 'strength' ||
					e.loadMode === 'none' ||
					(e.loadMode === 'external' && item.defaultWeightKg < 0))
			)
				errors.push(`${p}.defaultWeightKg: not allowed for this exercise/load mode.`);
		});
	});
	return errors.length ? { errors } : { bundle: b, errors: [] };
}
