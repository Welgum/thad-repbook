<script lang="ts">
	import { app } from '$lib/repositories/app';
	import { saveEntity } from '$lib/repositories/data';
	import { clone, id, loadLabel } from '$lib/domain/session';
	import { validateImport, compatible } from '$lib/validation/import';
	import type { Exercise, Target } from '$lib/domain/types';
	import Dialog from './Dialog.svelte';
	import Icon from './Icon.svelte';
	let { onselect }: { onselect?: (e: Exercise) => void } = $props();
	let open = $state(false),
		editing = $state<Exercise | null>(null),
		search = $state(''),
		error = $state(''),
		busy = $state(false);
	let original = $state<Exercise | null>(null);
	function edit(e?: Exercise) {
		original = e ? clone(e) : null;
		editing = e
			? clone(e)
			: {
					id: id(),
					key: '',
					name: '',
					kind: 'strength',
					loadMode: 'external',
					weightConvention: 'total',
					notes: '',
					archivedAt: null,
					excludedFromStats: false
				};
		error = '';
		open = true;
	}
	async function save() {
		if (!editing) return;
		busy = true;
		error = '';
		try {
			const e = clone(editing);
			e.name = e.name.trim();
			e.key = e.key || `exercise-${id().slice(0, 8)}`;
			const target: Target =
				e.kind === 'strength'
					? { sets: 3, repsMin: 6, repsMax: 10 }
					: e.kind === 'isometric'
						? {
								rounds: 2,
								directions: ['Front', 'Back', 'Left', 'Right'],
								holdSecondsMin: 5,
								holdSecondsMax: 10
							}
						: { durationSeconds: 600 };
			const {
				id: _id,
				archivedAt: _archive,
				excludedFromStats: _ex,
				exclusionReason: _reason,
				...definition
			} = e;
			const validation = validateImport(
				JSON.stringify({
					schemaVersion: 1,
					units: 'kg',
					exercises: [definition],
					workouts: [
						{
							key: 'validation',
							name: 'Validation',
							items: [{ itemKey: 'item', exerciseKey: e.key, target, restSeconds: 60 }]
						}
					]
				})
			);
			if (!validation.bundle) throw new Error(validation.errors.join('\n'));
			// Always fork changed measurement semantics, even before history exists, to preserve program identity.
			if (original && !compatible(original, e)) {
				e.id = id();
				e.key = `variant-${id().slice(0, 8)}`;
				e.name = e.name === original.name ? `${e.name} (variant)` : e.name;
				e.archivedAt = null;
			}
			await saveEntity($app.user!.uid, 'exercises', e);
			open = false;
			onselect?.(e);
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	async function archive(e: Exercise) {
		try {
			await saveEntity($app.user!.uid, 'exercises', {
				...e,
				archivedAt: e.archivedAt ? null : Date.now()
			});
		} catch (e) {
			error = (e as Error).message;
		}
	}
</script>

<div class="section-heading">
	<h2>Exercise catalog</h2>
	<button class="button small lime" onclick={() => edit()}
		><Icon name="plus" size={16} /> New exercise</button
	>
</div>
<input
	aria-label="Search exercises"
	placeholder="Search exercises…"
	bind:value={search}
/>{#if error && !open}<p class="notice error" role="alert">{error}</p>{/if}
<div class="stack" style="margin-top:20px">
	{#each $app.exercises.filter((e) => e.name
				.toLowerCase()
				.includes(search.toLowerCase()) && (!onselect || !e.archivedAt)) as e (e.id)}<div
			class="choice-row"
		>
			<Icon name="workouts" /><span
				><strong>{e.name}</strong><small
					>{e.kind} · {loadLabel(e)}{e.archivedAt ? ' · Archived' : ''}</small
				></span
			>{#if onselect}<button
					class="icon-button"
					aria-label={`Add ${e.name}`}
					onclick={() => onselect(e)}><Icon name="plus" /></button
				>{:else}<button
					class="icon-button flat"
					aria-label={`Edit ${e.name}`}
					onclick={() => edit(e)}><Icon name="edit" /></button
				><button
					class="icon-button flat"
					aria-label={`${e.archivedAt ? 'Restore' : 'Archive'} ${e.name}`}
					onclick={() => archive(e)}><Icon name={e.archivedAt ? 'undo' : 'archive'} /></button
				>{/if}
		</div>{/each}
</div>
<Dialog bind:open title={original ? 'Edit exercise' : 'Create exercise'}
	>{#if editing}<div class="form-stack">
			<label>Name<input maxlength="120" bind:value={editing.name} /></label>
			<div class="form-grid">
				<label
					>Type<select
						bind:value={editing.kind}
						onchange={() => {
							if (editing && editing.kind !== 'strength') {
								editing.loadMode = 'none';
								editing.weightConvention = 'none';
							}
						}}
						><option value="strength">Strength</option><option value="isometric">Isometric</option
						><option value="duration">Duration</option></select
					></label
				><label
					>Load mode<select
						disabled={editing.kind !== 'strength'}
						bind:value={editing.loadMode}
						onchange={() => {
							if (editing)
								editing.weightConvention =
									editing.loadMode === 'none'
										? 'none'
										: editing.loadMode === 'bodyweight'
											? 'bodyweight_adjustment'
											: 'total';
						}}
						><option value="external">External load</option><option value="bodyweight"
							>Bodyweight</option
						><option value="none">No load</option></select
					></label
				>
			</div>
			<label
				>Weight convention<select
					bind:value={editing.weightConvention}
					disabled={editing.loadMode !== 'external'}
					>{#if editing.loadMode === 'external'}<option value="total">kg total</option><option
							value="per_dumbbell">kg per dumbbell</option
						><option value="machine_stack">kg on machine stack</option><option value="as_logged"
							>kg as logged</option
						>{:else}<option
							value={editing.loadMode === 'bodyweight' ? 'bodyweight_adjustment' : 'none'}
							>{editing.loadMode === 'bodyweight' ? 'Bodyweight adjustment' : 'No weight'}</option
						>{/if}</select
				></label
			><label
				>Equipment / notes<textarea maxlength="2000" bind:value={editing.notes}></textarea></label
			>{#if original}<p class="field-help">
					Renaming preserves identity. Changing the type or load convention creates a separate
					variant, keeping existing programs and history consistent.
				</p>{/if}{#if error}<p class="notice error" role="alert">{error}</p>{/if}<button
				class="button lime"
				disabled={busy}
				onclick={save}>{busy ? 'Saving…' : 'Save exercise'}</button
			>
		</div>{/if}</Dialog
>
