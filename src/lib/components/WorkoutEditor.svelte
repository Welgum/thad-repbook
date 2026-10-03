<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { app } from '$lib/repositories/app';
	import { saveEntity } from '$lib/repositories/data';
	import { clone, id, loadLabel } from '$lib/domain/session';
	import { validateImport } from '$lib/validation/import';
	import type { Workout, Exercise, Bundle } from '$lib/domain/types';
	import ExerciseCatalog from './ExerciseCatalog.svelte';
	import Icon from './Icon.svelte';
	import Dialog from './Dialog.svelte';
	let { workout, onSaved }: { workout?: Workout; onSaved?: () => void } = $props();
	let draft = $state<Workout>(
		clone(
			untrack(() => workout) || {
				id: id(),
				key: `custom-${id().slice(0, 8)}`,
				name: '',
				notes: '',
				version: 1,
				items: [],
				archivedAt: null,
				excludedFromStats: false
			}
		)
	);
	let add = $state(false),
		error = $state(''),
		busy = $state(false);
	function addExercise(e: Exercise) {
		draft.items.push({
			itemId: id(),
			exerciseId: e.id,
			target:
				e.kind === 'strength'
					? { sets: 3, repsMin: 6, repsMax: 10 }
					: e.kind === 'isometric'
						? {
								rounds: 2,
								directions: ['Front', 'Back', 'Left', 'Right'],
								holdSecondsMin: 5,
								holdSecondsMax: 10
							}
						: { durationSeconds: 600 },
			restSeconds: e.kind === 'duration' ? 0 : 60
		});
		add = false;
	}
	function move(index: number, delta: number) {
		const list = [...draft.items];
		[list[index], list[index + delta]] = [list[index + delta], list[index]];
		draft.items = list;
	}
	async function save() {
		busy = true;
		error = '';
		try {
			const exercises = [...new Set(draft.items.map((i) => i.exerciseId))].map((eid) =>
				$app.exercises.find((e) => e.id === eid)!
			);
			const keys = Object.fromEntries(exercises.map((e, i) => [e.id, `exercise-${i}`]));
			const bundle: Bundle = {
				schemaVersion: 1,
				units: 'kg',
				exercises: exercises.map((e) => ({
					key: keys[e.id],
					name: e.name,
					kind: e.kind,
					loadMode: e.loadMode,
					weightConvention: e.weightConvention,
					...(e.notes ? { notes: e.notes } : {})
				})),
				workouts: [
					{
						key: draft.key,
						name: draft.name,
						notes: draft.notes,
						items: draft.items.map((i, n) => ({
							itemKey: `item-${n}`,
							exerciseKey: keys[i.exerciseId],
							target: i.target,
							restSeconds: i.restSeconds,
							...(i.defaultWeightKg === undefined ? {} : { defaultWeightKg: i.defaultWeightKg }),
							...(i.notes ? { notes: i.notes } : {})
						}))
					}
				]
			};
			const validation = validateImport(JSON.stringify(bundle));
			if (!validation.bundle) throw new Error(validation.errors.join('\n'));
			if (new TextEncoder().encode(JSON.stringify(draft)).length > 65536)
				throw new Error('This program exceeds 64 KiB. Split it into smaller programs.');
			draft.name = draft.name.trim();
			await saveEntity($app.user!.uid, 'workouts', clone(draft));
			onSaved?.();
			await goto(`/workouts/${draft.id}`);
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<div class="form-stack">
	<div class="card form-stack">
		<label
			>Workout name<input
				placeholder="Give your next routine a name"
				maxlength="120"
				bind:value={draft.name}
			/></label
		><label
			>Program notes<textarea
				placeholder="Your focus, equipment, or reminders…"
				maxlength="2000"
				bind:value={draft.notes}></textarea></label
		>
	</div>
	<div class="section-heading">
		<h2>The game plan.</h2>
		<span class="badge">{draft.items.length} / 40 EXERCISES</span>
	</div>
	{#each draft.items as item, i (item.itemId)}{@const e = $app.exercises.find(
			(e) => e.id === item.exerciseId
		)!}
		<section class="exercise-editor">
			<div class="exercise-editor-head">
				<strong>{String(i + 1).padStart(2, '0')} · {e?.name || 'Missing exercise'}</strong><button
					class="icon-button flat"
					disabled={i === 0}
					aria-label={`Move ${e?.name} up`}
					onclick={() => move(i, -1)}><Icon name="up" /></button
				><button
					class="icon-button flat"
					disabled={i === draft.items.length - 1}
					aria-label={`Move ${e?.name} down`}
					onclick={() => move(i, 1)}><Icon name="down" /></button
				><button
					class="icon-button flat"
					aria-label={`Remove ${e?.name}`}
					onclick={() => draft.items.splice(i, 1)}><Icon name="delete" /></button
				>
			</div>
			<div class="target-fields">
				{#if 'sets' in item.target}<label
						>Sets<input type="number" min="1" max="30" bind:value={item.target.sets} /></label
					><label
						>Min reps<input
							type="number"
							min="1"
							max="1000"
							bind:value={item.target.repsMin}
						/></label
					><label
						>Max reps<input
							type="number"
							min="1"
							max="1000"
							bind:value={item.target.repsMax}
						/></label
					>{:else if 'rounds' in item.target}<label
						>Rounds<input type="number" min="1" max="30" bind:value={item.target.rounds} /></label
					><label
						>Min hold (s)<input
							type="number"
							min="1"
							max="600"
							bind:value={item.target.holdSecondsMin}
						/></label
					><label
						>Max hold (s)<input
							type="number"
							min="1"
							max="600"
							bind:value={item.target.holdSecondsMax}
						/></label
					><label class="form-wide"
						>Directions (comma separated)<input
							value={item.target.directions.join(', ')}
							onchange={(event) => {
								if ('directions' in item.target)
									item.target.directions = event.currentTarget.value
										.split(',')
										.map((s) => s.trim());
							}}
						/></label
					>{:else}<label
						>Target seconds<input
							type="number"
							min="1"
							max="86400"
							bind:value={item.target.durationSeconds}
						/></label
					>{/if}<label
					>Rest (seconds)<input
						type="number"
						min="0"
						max="3600"
						bind:value={item.restSeconds}
					/></label
				>{#if e?.loadMode !== 'none'}<label
						>Starting {loadLabel(e)}<input
							type="number"
							inputmode="decimal"
							step="0.5"
							min={e?.loadMode === 'external' ? 0 : -2000}
							max="2000"
							placeholder="Optional"
							bind:value={item.defaultWeightKg}
						/></label
					>{/if}<label class="form-wide"
					>Exercise notes<input
						maxlength="2000"
						placeholder="Optional"
						bind:value={item.notes}
					/></label
				>
			</div>
		</section>{/each}<button
		class="button"
		disabled={draft.items.length >= 40}
		onclick={() => (add = true)}><Icon name="plus" /> Add exercise</button
	>{#if error}<div class="notice error" role="alert" style="white-space:pre-line">{error}</div>{/if}
	<div class="actions">
		<button class="button lime" disabled={busy} onclick={save}
			><Icon name="check" /> {busy ? 'Saving…' : 'Save workout'}</button
		><a class="button" href={workout ? `/workouts/${workout.id}` : '/workouts'}>Cancel</a>
	</div>
</div>
<Dialog bind:open={add} title="Add from your catalog"
	><ExerciseCatalog onselect={addExercise} /></Dialog
>
