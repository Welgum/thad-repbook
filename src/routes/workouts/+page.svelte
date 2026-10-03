<script lang="ts">
	import { app } from '$lib/repositories/app';
	import type { Workout } from '$lib/domain/types';
	import WorkoutCard from '$lib/components/WorkoutCard.svelte';
	import StartWorkout from '$lib/components/StartWorkout.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import ExerciseCatalog from '$lib/components/ExerciseCatalog.svelte';
	let search = $state(''),
		tab = $state('active'),
		start = $state(false),
		selected = $state<Workout | undefined>();
	const filtered = $derived(
		$app.workouts.filter(
			(w) =>
				Boolean(w.archivedAt) === (tab === 'archived') &&
				w.name.toLowerCase().includes(search.toLowerCase())
		)
	);
</script>

<svelte:head><title>Workouts · Repbook</title></svelte:head>
<div class="page-heading">
	<div>
		<span class="eyebrow">A PLAN FOR YOUR NEXT PERSONAL BEST</span>
		<h1>Your workouts.</h1>
		<p class="muted">Good programs. Great possibilities. Choose any day.</p>
	</div>
	<div class="heading-actions">
		<a href="/import" class="button"><Icon name="import" /> Import</a><a
			href="/workouts/new"
			class="button lime"><Icon name="plus" /> Create workout</a
		>
	</div>
</div>
<div class="toolbar">
	<input aria-label="Search workouts" placeholder="Search your workouts…" bind:value={search} />
	<div class="tabs">
		<button class:active={tab === 'active'} onclick={() => (tab = 'active')}>Active programs</button
		><button class:active={tab === 'archived'} onclick={() => (tab = 'archived')}>Archived</button
		><button class:active={tab === 'exercises'} onclick={() => (tab = 'exercises')}
			>Exercise catalog</button
		>
	</div>
</div>
{#if tab === 'exercises'}<ExerciseCatalog />{:else if filtered.length}<div class="workout-grid">
		{#each filtered as w, i (w.id)}<WorkoutCard
				workout={w}
				index={i}
				onstart={(w) => {
					selected = w;
					start = true;
				}}
			/>{/each}
	</div>{:else}<EmptyState
		title={search
			? 'No matches. Keep looking.'
			: tab === 'archived'
				? 'Nothing in the archive.'
				: 'Room for your next routine.'}
		description={tab === 'archived'
			? 'Archived programs stay connected to your history.'
			: 'Create a workout from scratch or import a JSON program.'}
	/>{/if}
<StartWorkout bind:open={start} {selected} />
