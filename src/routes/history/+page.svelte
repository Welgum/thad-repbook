<script lang="ts">
	import { app } from '$lib/repositories/app';
	import { sessionPage, type SessionFilter } from '$lib/repositories/data';
	import { exclusionReasons } from '$lib/analytics';
	import { dateInZone } from '$lib/domain/time';
	import type { Session } from '$lib/domain/types';
	import SessionCard from '$lib/components/SessionCard.svelte';
	import StartWorkout from '$lib/components/StartWorkout.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	let list = $state<Session[]>([]),
		from = $state(''),
		to = $state(''),
		templateId = $state(''),
		status = $state(''),
		showExcluded = $state(true),
		loading = $state(false),
		more = $state(false),
		error = $state(''),
		add = $state(false);
	let cursor: SessionFilter['cursor'];
	let generation = 0;
	async function load(reset = false) {
		const token = ++generation;
		loading = true;
		error = '';
		try {
			const result = await sessionPage($app.user!.uid, {
				from,
				to,
				templateId,
				status,
				cursor: reset ? undefined : cursor
			});
			if (token !== generation) return;
			list = reset ? result.sessions : [...list, ...result.sessions];
			cursor = result.cursor;
			more = result.hasMore;
		} catch (e) {
			if (token === generation) error = (e as Error).message;
		} finally {
			if (token === generation) loading = false;
		}
	}
	$effect(() => {
		void load(true);
	});
	const visible = $derived(
		list.filter(
			(s) =>
				showExcluded || !exclusionReasons(s, $app).some((r) => r.toLowerCase().includes('excluded'))
		)
	);
</script>

<svelte:head><title>History · Repbook</title></svelte:head>
<div class="page-heading">
	<div>
		<span class="eyebrow">THE WORK YOU PUT IN</span>
		<h1>Your training story.</h1>
		<p class="muted">Every session, exactly as you logged it.</p>
	</div>
	<button class="button lime" onclick={() => (add = true)}
		><Icon name="plus" />Add past workout</button
	>
</div>
<div class="card">
	<div class="form-grid">
		<label>From<input type="date" bind:value={from} /></label><label
			>Through<input type="date" bind:value={to} /></label
		><label
			>Program<select bind:value={templateId}
				><option value="">All workouts</option>{#each $app.workouts as w (w.id)}<option value={w.id}
						>{w.name}</option
					>{/each}</select
			></label
		><label
			>Status<select bind:value={status}
				><option value="">All statuses</option><option value="completed">Completed</option><option
					value="in_progress">In progress</option
				><option value="abandoned">Abandoned</option></select
			></label
		>
	</div>
	<label class="check-label" style="margin-top:14px"
		><input type="checkbox" bind:checked={showExcluded} />Show excluded</label
	>
</div>
{#if error}<p class="notice error" role="alert">
		{error}<button class="flat" onclick={() => load(true)}>Retry</button>
	</p>{/if}
<div class="stack" style="margin-top:24px">
	{#each visible as s (s.id)}<SessionCard session={s} />{/each}
</div>
{#if loading}<p class="muted" role="status">
		Loading history…
	</p>{:else if !visible.length}<EmptyState
		icon="history"
		title="A clean page, full of potential."
		description="Log a workout, add a past session, or adjust your filters."
	/>{/if}{#if more}<button
		class="button"
		style="margin-top:20px"
		disabled={loading}
		onclick={() => load()}>Load more workouts</button
	>{/if}<StartWorkout bind:open={add} pastDate={dateInZone(Date.now(), $app.profile!.timeZone)} />
