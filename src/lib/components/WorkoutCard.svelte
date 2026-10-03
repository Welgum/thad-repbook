<script lang="ts">
	import type { Workout } from '$lib/domain/types';
	import { units } from '$lib/domain/session';
	import Icon from './Icon.svelte';
	let {
		workout,
		index = 0,
		onstart
	}: { workout: Workout; index?: number; onstart?: (w: Workout) => void } = $props();
	const colors = ['lime', 'pink', 'blue', 'yellow', 'purple'];
</script>

<article class="workout-card">
	<a href={`/workouts/${workout.id}`} class={`workout-art ${colors[index % 5]}`}
		><span class="workout-number">{String(index + 1).padStart(2, '0')}</span><Icon
			name="workouts"
			size={68}
		/><span class="art-star" aria-hidden="true">✳</span><span class="badge">YOUR PROGRAM</span></a
	>
	<div class="workout-card-body">
		<h3><a href={`/workouts/${workout.id}`}>{workout.name}</a></h3>
		<p class="muted">
			{workout.items.length} exercises <span class="dot">·</span>
			{workout.items.reduce((n, i) => n + units(i.target), 0)} planned units
		</p>
		{#if workout.archivedAt}<span class="badge">Archived</span>{:else if onstart}<button
				class="button small full"
				onclick={() => onstart(workout)}
				><Icon name="play" size={17} /> Start workout <Icon name="arrow" size={17} /></button
			>{:else}<a class="button small full" href={`/workouts/${workout.id}`}
				>View workout <Icon name="arrow" size={17} /></a
			>{/if}
	</div>
</article>
