<script lang="ts">
	import { goto } from '$app/navigation';
	import { app } from '$lib/repositories/app';
	import { startSession } from '$lib/repositories/data';
	import { editorId } from '$lib/repositories/sessions';
	import type { Workout } from '$lib/domain/types';
	import Dialog from './Dialog.svelte';
	import Icon from './Icon.svelte';
	import { dateInZone } from '$lib/domain/time';
	let {
		open = $bindable(false),
		pastDate = '',
		selected
	}: { open?: boolean; pastDate?: string; selected?: Workout } = $props();
	let busy = $state(false),
		error = $state(''),
		date = $state('');
	$effect(() => {
		if (open) {
			date = pastDate;
			error = '';
		}
	});
	async function start(w: Workout) {
		if (!$app.user || !$app.profile) return;
		busy = true;
		error = '';
		try {
			if (pastDate && !date) throw new Error('Choose a date for this past workout.');
			const s = await startSession(
				$app.user.uid,
				w,
				$app.exercises,
				$app.profile,
				editorId(),
				date || undefined
			);
			open = false;
			await goto(`/session/${s.id}`);
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<Dialog bind:open title={pastDate ? 'Add past workout' : 'Make time for a good set.'}>
	{#if error}<p class="notice error" role="alert">{error}</p>{/if}
	{#if $app.profile?.activeSessionId}<div class="notice">
			<h3>A workout is already in progress.</h3>
			<p>Resume it, or open it and choose Abandon before starting a new one.</p>
			<a
				class="button lime"
				href={`/session/${$app.profile.activeSessionId}`}
				onclick={() => (open = false)}>Resume workout <Icon name="arrow" /></a
			>
		</div>{:else}
		{#if pastDate}<label
				>Workout date<input
					type="date"
					bind:value={date}
					max={$app.profile ? dateInZone(Date.now(), $app.profile.timeZone) : undefined}
				/></label
			>
			<p class="muted">Log results from this day. The rest timer will be off.</p>{:else}<p
				class="muted"
			>
				Pick any program, any day. Every rep starts somewhere.
			</p>{/if}
		<div class="stack">
			{#each selected ? [selected] : $app.workouts.filter((w) => !w.archivedAt) as w (w.id)}<button
					class="choice-row"
					disabled={busy}
					onclick={() => start(w)}
					><Icon name="workouts" /><span
						><strong>{w.name}</strong><small>{w.items.length} exercises</small></span
					><Icon name="arrow" /></button
				>{/each}
		</div>{/if}
</Dialog>
