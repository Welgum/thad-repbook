<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { app } from '$lib/repositories/app';
	import { saveEntity } from '$lib/repositories/data';
	import { clone, id, plan, loadLabel } from '$lib/domain/session';
	import WorkoutEditor from '$lib/components/WorkoutEditor.svelte';
	import StartWorkout from '$lib/components/StartWorkout.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	const w = $derived($app.workouts.find((w) => w.id === page.params.id));
	let edit = $state(false),
		start = $state(false),
		error = $state('');
	async function action(kind: 'duplicate' | 'archive' | 'exclude') {
		if (!w) return;
		try {
			const copy = clone(w);
			if (kind === 'duplicate') {
				copy.id = id();
				copy.key = `copy-${id().slice(0, 8)}`;
				copy.name = `${copy.name.slice(0, 113)} (copy)`;
				copy.version = 1;
				copy.archivedAt = null;
				copy.items = copy.items.map((i) => ({ ...i, itemId: id() }));
			}
			if (kind === 'archive') copy.archivedAt = copy.archivedAt ? null : Date.now();
			if (kind === 'exclude') copy.excludedFromStats = !copy.excludedFromStats;
			await saveEntity($app.user!.uid, 'workouts', copy);
			if (kind === 'duplicate') await goto(`/workouts/${copy.id}`);
		} catch (e) {
			error = (e as Error).message;
		}
	}
</script>

<svelte:head><title>{w?.name || 'Workout'} · Repbook</title></svelte:head>
<a class="back-link" href="/workouts"><Icon name="left" size={16} /> All workouts</a>
{#if w}<div class="page-heading">
		<div>
			<span class="eyebrow">YOUR PROGRAM · VERSION {w.version}</span>
			<h1>{w.name}</h1>
			<p class="muted">{w.items.length} exercises · Ready whenever you are.</p>
		</div>
		<div class="heading-actions">
			<button class="button" onclick={() => (edit = !edit)}
				><Icon name={edit ? 'close' : 'edit'} />{edit ? 'Close editor' : 'Edit workout'}</button
			>{#if !w.archivedAt}<button class="button lime" onclick={() => (start = true)}
					><Icon name="play" />Start workout</button
				>{/if}
		</div>
	</div>
	{#if error}<p class="notice error" role="alert">
			{error}
		</p>{/if}{#if edit}{#key w.id}<WorkoutEditor
				workout={w}
				onSaved={() => (edit = false)}
			/>{/key}{:else}<div class="card">
			<p>{w.notes || 'Your next session is waiting.'}</p>
			<div class="stack">
				{#each w.items as item, i (item.itemId)}{@const e = $app.exercises.find(
						(e) => e.id === item.exerciseId
					)}
					<div class="choice-row">
						<span class="badge lime">{i + 1}</span><span
							><strong>{e?.name || 'Archived exercise'}</strong><small
								>{plan(item.target)} · Rest {item.restSeconds}s · {e ? loadLabel(e) : ''}</small
							>{#if item.notes || e?.notes}<small>{item.notes || e?.notes}</small>{/if}</span
						><a
							class="icon-button"
							aria-label={`Progress for ${e?.name}`}
							href={`/progress/exercises/${item.exerciseId}`}><Icon name="progress" /></a
						>
					</div>{/each}
			</div>
		</div>
		<div class="toolbar">
			<button class="button" onclick={() => action('duplicate')}
				><Icon name="copy" />Duplicate</button
			><button class="button" onclick={() => action('archive')}
				><Icon name="archive" />{w.archivedAt ? 'Restore program' : 'Archive program'}</button
			><button class="button" onclick={() => action('exclude')}
				>{w.excludedFromStats ? 'Include in statistics' : 'Exclude workout from statistics'}</button
			><a class="button" href={`/progress/workouts/${w.id}`}
				><Icon name="progress" />View progress</a
			>
		</div>
		{#if w.excludedFromStats}<p class="notice">
				This template and all its sessions are excluded from statistics. Individual exclusions
				remain when you restore it.
			</p>{/if}
		<p class="field-help">
			Edits apply to future sessions. Archiving keeps your history and statistics.
		</p>{/if}<StartWorkout bind:open={start} selected={w} />{:else}<EmptyState
		title="Workout not found."
		description="Return to your workout library to choose another program."
	/>{/if}
