<script lang="ts">
	import { onMount } from 'svelte';
	import { app } from '$lib/repositories/app';
	import { sessionsInRange } from '$lib/repositories/data';
	import { overview } from '$lib/analytics';
	import { progressionReport, shiftMonth, monthOf } from '$lib/analytics/progression';
	import ProgressDashboard from '$lib/components/ProgressDashboard.svelte';
	import { dateInZone, shiftDate } from '$lib/domain/time';
	import type { Session, Workout } from '$lib/domain/types';
	import Icon from '$lib/components/Icon.svelte';
	import WorkoutCard from '$lib/components/WorkoutCard.svelte';
	import SessionCard from '$lib/components/SessionCard.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import StartWorkout from '$lib/components/StartWorkout.svelte';
	let sessions = $state<Session[]>([]),
		loading = $state(true),
		error = $state(''),
		start = $state(false),
		selected = $state<Workout | undefined>();
	const today = dateInZone(Date.now(), $app.profile!.timeZone);
	const recentSessions = $derived(sessions.filter((s) => s.workoutDate >= shiftDate(today, -27)));
	const stats = $derived(overview(recentSessions, $app));
	const progression = $derived(
		progressionReport(sessions, $app, { from: `${shiftMonth(monthOf(today), -2)}-01`, to: today })
	);
	const workouts = $derived($app.workouts.filter((w) => !w.archivedAt));
	onMount(async () => {
		try {
			sessions = await sessionsInRange(
				$app.user!.uid,
				`${shiftMonth(monthOf(today), -3)}-01`,
				today
			);
		} catch (e) {
			error = (e as Error).message;
		} finally {
			loading = false;
		}
	});
	function choose(w?: Workout) {
		selected = w;
		start = true;
	}
</script>

<svelte:head><title>Home · Repbook</title></svelte:head>
<div class="page-heading">
	<div>
		<span class="eyebrow">YOUR TRAINING, ALL IN ONE PLACE</span>
		<h1>
			Hey, {$app.profile?.displayName.split(' ')[0] || 'athlete'}
			<span style="font-size:.75em">✳</span>
		</h1>
		<p class="muted">Ready to put a little work in?</p>
	</div>
	<div class="heading-actions">
		<button class="button lime" onclick={() => choose()}
			><Icon name="plus" size={19} /> Start workout</button
		>
	</div>
</div>
{#if error}<p class="notice error" role="alert">{error}</p>{:else if loading}<p
		class="muted"
		role="status"
	>
		Loading your progression…
	</p>{:else}<ProgressDashboard report={progression} through={today} compact />{/if}
<section class="hero">
	<div>
		<span class="badge">A STRONGER YOU STARTS HERE</span>
		<h2>Make every<br />rep count.</h2>
		<p>Your plan. Your pace. A little stronger each time you show up.</p>
		{#if $app.profile?.activeSessionId}<a
				class="button dark"
				href={`/session/${$app.profile.activeSessionId}`}
				><Icon name="play" size={17} /> Resume workout <Icon name="arrow" size={17} /></a
			>{:else}<button class="button dark" onclick={() => choose()}
				><Icon name="play" size={17} /> Let’s train <Icon name="arrow" size={17} /></button
			>{/if}
	</div>
	<div class="hero-art" aria-hidden="true">
		<span class="star">✳</span>
		<div class="hero-weight"><Icon name="workouts" size={103} /></div>
		<span class="hero-sticker">YOU VS. YESTERDAY ↗</span>
	</div>
</section>
<div class="stats-grid">
	<div class="stat-card">
		<div class="stat-top">Workouts <Icon name="workouts" size={17} /></div>
		<div class="stat-value">{loading ? '—' : stats.count}</div>
		<div class="stat-bottom">Last 4 weeks</div>
	</div>
	<div class="stat-card">
		<div class="stat-top">Working sets <Icon name="zap" size={17} /></div>
		<div class="stat-value">{loading ? '—' : stats.sets}</div>
		<div class="stat-bottom">Successful strength sets</div>
	</div>
	<div class="stat-card">
		<div class="stat-top">Time invested <Icon name="timer" size={17} /></div>
		<div class="stat-value">
			{loading || stats.duration === null ? '—' : Math.round(stats.duration / 60)}<span
				style="font-size:13px;font-weight:400"
			>
				{stats.duration !== null ? 'min' : ''}</span
			>
		</div>
		<div class="stat-bottom">Every minute matters</div>
	</div>
	<div class="stat-card">
		<div class="stat-top">Your programs <Icon name="book" size={17} /></div>
		<div class="stat-value">{workouts.length}</div>
		<div class="stat-bottom">Pick any one, any day</div>
	</div>
</div>
<div class="section-heading">
	<h2>Your next good session.</h2>
	<a class="text-link" href="/workouts">All workouts <Icon name="arrow" size={15} /></a>
</div>
{#if workouts.length}<div class="workout-grid">
		{#each workouts.slice(0, 3) as w, i (w.id)}<WorkoutCard
				workout={w}
				index={i}
				onstart={choose}
			/>{/each}
	</div>{:else}<EmptyState
		title="Your program starts here."
		description="Create a workout or import your own plan."
	/>{/if}
<div class="section-heading">
	<h2>Recently in the books.</h2>
	<a class="text-link" href="/history">View history <Icon name="arrow" size={15} /></a>
</div>
{#if loading}<p class="muted">Loading your recent training…</p>{:else if recentSessions.length}<div
		class="stack"
	>
		{#each recentSessions.slice(0, 3) as s (s.id)}<SessionCard session={s} />{/each}
	</div>{:else}<EmptyState
		icon="history"
		title="The first page is yours."
		description="Your logged workouts will appear here. Start a session and give your progress a place to grow."
	/>{/if}
<StartWorkout bind:open={start} {selected} />
