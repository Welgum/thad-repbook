<script lang="ts">
	import { app } from '$lib/repositories/app';
	import { sessionsInRange } from '$lib/repositories/data';
	import { calendarDays, dateInZone, displayDate } from '$lib/domain/time';
	import type { Session } from '$lib/domain/types';
	import SessionCard from '$lib/components/SessionCard.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import StartWorkout from '$lib/components/StartWorkout.svelte';
	import Icon from '$lib/components/Icon.svelte';
	const today = dateInZone(Date.now(), $app.profile!.timeZone);
	let month = $state(today.slice(0, 7)),
		selected = $state(today),
		sessions = $state<Session[]>([]),
		loading = $state(false),
		error = $state(''),
		start = $state(false),
		pastDate = $state('');
	const days = $derived(calendarDays(month));
	const monthName = $derived(
		new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
			new Date(`${month}-01T12:00:00Z`)
		)
	);
	let generation = 0;
	$effect(() => {
		const range = days;
		const token = ++generation;
		loading = true;
		error = '';
		sessionsInRange($app.user!.uid, range[0], range[41])
			.then((result) => {
				if (token === generation) sessions = result;
			})
			.catch((e) => {
				if (token === generation) error = e.message;
			})
			.finally(() => {
				if (token === generation) loading = false;
			});
	});
	function move(delta: number) {
		const d = new Date(`${month}-01T12:00:00Z`);
		d.setUTCMonth(d.getUTCMonth() + delta);
		month = d.toISOString().slice(0, 7);
		selected = `${month}-01`;
	}
</script>

<svelte:head><title>Calendar · Repbook</title></svelte:head>
<div class="page-heading">
	<div>
		<span class="eyebrow">CONSISTENCY HAS A GOOD LOOK</span>
		<h1>Show up. Mark it down.</h1>
		<p class="muted">Your training, one day at a time.</p>
	</div>
	<a class="button" href="/history"><Icon name="history" /> View history</a>
</div>
<div class="card">
	<div class="calendar-nav">
		<h2>{monthName}</h2>
		<button
			class="button small"
			onclick={() => {
				month = today.slice(0, 7);
				selected = today;
			}}>Today</button
		><button class="icon-button" aria-label="Previous month" onclick={() => move(-1)}
			><Icon name="left" /></button
		><button class="icon-button" aria-label="Next month" onclick={() => move(1)}
			><Icon name="right" /></button
		>
	</div>
	<div class="calendar-grid" aria-label={monthName}>
		{#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as day (day)}<div
				class="calendar-label"
			>
				{day}
			</div>{/each}{#each days as day (day)}{@const events = sessions.filter(
				(s) => s.workoutDate === day
			)}<button
				class="calendar-day"
				class:outside={!day.startsWith(month)}
				class:today={day === today}
				class:selected={day === selected}
				aria-pressed={day === selected}
				aria-label={`${displayDate(day)}, ${events.length} workouts${day === today ? ', today' : ''}`}
				onclick={() => (selected = day)}
				><span>{Number(day.slice(-2))}</span><span class="calendar-dots"
					>{#each events.slice(0, 4) as event (event.id)}<i
							style:background={event.status === 'completed'
								? '#638336'
								: event.status === 'in_progress'
									? '#7760ad'
									: '#a67442'}
						></i>{/each}{#if events.length}<small
							>{events.length} {events.length === 1 ? 'session' : 'sessions'}</small
						>{/if}</span
				></button
			>{/each}
	</div>
	<div class="toolbar" style="margin-bottom:0">
		<span class="badge green">Completed</span><span class="badge purple">In progress</span><span
			class="badge yellow">Abandoned</span
		>
	</div>
</div>
{#if error}<p class="notice error" role="alert">{error}</p>{/if}{#if loading}<p
		class="muted"
		role="status"
	>
		Loading this month…
	</p>{/if}
<div class="section-heading">
	<h2>{displayDate(selected)}</h2>
	{#if selected <= today}<button
			class="button small lime"
			onclick={() => {
				pastDate = selected === today ? '' : selected;
				start = true;
			}}
			><Icon name="plus" size={16} />{selected === today
				? $app.profile?.activeSessionId
					? 'Resume workout'
					: 'Start workout'
				: 'Add past workout'}</button
		>{/if}
</div>
<div class="stack">
	{#each sessions.filter((s) => s.workoutDate === selected) as s (s.id)}<SessionCard
			session={s}
		/>{/each}
</div>
{#if !loading && !sessions.some((s) => s.workoutDate === selected)}<EmptyState
		icon="calendar"
		title={selected > today ? 'A little room for what’s next.' : 'Nothing logged on this day.'}
		description={selected > today
			? 'Future days are here for perspective. Completed workouts can only be logged for today or earlier.'
			: 'A rest day counts, too. Add a past session if you trained.'}
	/>{/if}<StartWorkout bind:open={start} {pastDate} />
