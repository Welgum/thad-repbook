<script lang="ts">
	import { untrack } from 'svelte';
	import { app } from '$lib/repositories/app';
	import { sessionsInRange } from '$lib/repositories/data';
	import {
		overview,
		sessionMetrics,
		exerciseMetrics,
		sessionIncluded,
		itemIncluded
	} from '$lib/analytics';
	import {
		dateInZone,
		shiftDate,
		durationLabel,
		displayDate,
		validDate,
		weekOf
	} from '$lib/domain/time';
	import { recordLabel, loadLabel } from '$lib/domain/session';
	import type { Session } from '$lib/domain/types';
	import EmptyState from './EmptyState.svelte';
	import ProgressDashboard from './ProgressDashboard.svelte';
	import { progressionReport } from '$lib/analytics/progression';
	import {
		bestStrengthSet,
		strengthChange,
		strengthSetLabel,
		type StrengthSet
	} from '$lib/analytics/strength';
	import Icon from './Icon.svelte';
	import { chartTrend } from './chart-trend';
	let { workoutId = '', exerciseId = '' }: { workoutId?: string; exerciseId?: string } = $props();
	const today = dateInZone(Date.now(), $app.profile!.timeZone);
	let range = $state('12'),
		from = $state(shiftDate(today, -83)),
		to = $state(today),
		sessions = $state<Session[]>([]),
		loading = $state(true),
		error = $state(''),
		count = $state(0),
		mode = $state<'all' | 'bodyweight' | 'added' | 'assistance'>('all'),
		load = $state(''),
		filterWorkout = $state(untrack(() => workoutId)),
		filterExercise = $state(untrack(() => exerciseId));
	let generation = 0;
	let chartMetric = $state<'strength' | 'load' | 'reps'>('strength');
	const workout = $derived($app.workouts.find((w) => w.id === workoutId));
	const exercise = $derived($app.exercises.find((e) => e.id === (exerciseId || filterExercise)));
	const rangeStart = $derived(
		range === 'all'
			? undefined
			: range === 'custom'
				? from
				: shiftDate(today, -Number(range) * 7 + 1)
	);
	const rangeEnd = $derived(range === 'custom' ? to : today);
	const progression = $derived(
		progressionReport(sessions, $app, {
			from: rangeStart,
			to: rangeEnd,
			workoutId: filterWorkout,
			exerciseId: filterExercise
		})
	);
	const selection = $derived(
		sessions.filter(
			(s) =>
				(!rangeStart || s.workoutDate >= rangeStart) &&
				s.workoutDate <= rangeEnd &&
				(!filterWorkout || s.templateId === filterWorkout) &&
				(!filterExercise ||
					s.exercises.some((i) => i.exerciseId === filterExercise && itemIncluded(s, i, $app)))
		)
	);
	const stats = $derived(overview(selection, $app));
	const ordered = $derived(
		[...selection]
			.filter((s) => sessionIncluded(s, $app))
			.sort((a, b) => a.workoutDate.localeCompare(b.workoutDate) || a.startedAt - b.startedAt)
	);
	const exerciseRows = $derived(
		exercise
			? ordered
					.map((s) => ({
						s,
						m: exerciseMetrics(
							s,
							exercise.id,
							$app,
							load === '' ? undefined : Number(load.replace(',', '.')),
							mode
						)
					}))
					.filter((row) => row.m.entries.length)
			: []
	);
	const weightedStrength = $derived(
		exercise?.kind === 'strength' && exercise.loadMode === 'external'
	);
	const chart = $derived(
		exercise
			? exerciseRows.map(({ s, m }) => {
					const set = weightedStrength
						? bestStrengthSet(m.entries, exercise.weightConvention)
						: null;
					return {
						date: s.workoutDate,
						label: s.nameSnapshot,
						set,
						value:
							exercise.kind === 'isometric'
								? m.holdSeconds
								: exercise.kind === 'duration'
									? m.durationSeconds
									: exercise.loadMode === 'external'
										? (set?.[chartMetric] ?? null)
										: m.reps
					};
				})
			: Object.entries(stats.weeks)
					.sort(([a], [b]) => a.localeCompare(b))
					.map(([date, value]) => ({
						date,
						label: 'Week starting',
						value,
						set: null as StrengthSet | null
					}))
	);
	const chartUnit = $derived(
		exercise
			? exercise.kind === 'strength'
				? exercise.loadMode === 'external'
					? chartMetric === 'strength'
						? 'estimated kg'
						: chartMetric === 'reps'
							? 'reps'
							: loadLabel(exercise)
					: 'reps'
				: 'seconds'
			: 'workouts / week'
	);
	const chartTrends = $derived(
		chart.map((point, i) => {
			const previous = chart[i - 1]?.set;
			return chartTrend(
				point.set && previous ? strengthChange(point.set.strength, previous.strength) : null
			);
		})
	);
	const max = $derived(Math.max(1, ...chart.map((p) => p.value || 0)));
	const number = (value: number | null) => (value === null ? '—' : Number(value.toFixed(1)));
	$effect(() => {
		// Read the whole first week plus its comparison week. Activity totals still use exact dates.
		const end = rangeEnd;
		const token = ++generation;
		loading = true;
		error = '';
		count = 0;
		if (
			!validDate(end) ||
			(rangeStart !== undefined && (!validDate(rangeStart) || rangeStart > end)) ||
			end > today
		) {
			error = 'Choose a valid date range ending today or earlier.';
			sessions = [];
			loading = false;
			return;
		}
		const start = rangeStart ? shiftDate(weekOf(rangeStart), -7) : undefined;
		sessionsInRange($app.user!.uid, start, end, (n) => {
			if (token === generation) count = n;
		})
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
</script>

<svelte:head><title>{exercise?.name || workout?.name || 'Progress'} · Repbook</title></svelte:head>
{#if workoutId || exerciseId}<a class="back-link" href="/progress"
		><Icon name="left" size={16} />All progress</a
	>{/if}
<div class="page-heading">
	<div>
		<span class="eyebrow">THE BIGGER PICTURE</span>
		<h1>{exercise?.name || workout?.name || 'Look how far you’ve come.'}</h1>
		<p class="muted">Honest numbers. Your progress, at your pace.</p>
	</div>
	<a class="button" href="/settings">Manage exclusions</a>
</div>
<div class="card">
	<div class="toolbar" style="margin-top:0">
		<div class="tabs">
			{#each [['4', 'Last 4 weeks'], ['12', 'Last 12 weeks'], ['all', 'All time'], ['custom', 'Custom']] as [value, label] (value)}<button
					class:active={range === value}
					onclick={() => (range = value)}>{label}</button
				>{/each}
		</div>
	</div>
	<div class="form-grid">
		{#if range === 'custom'}<label
				>From<input type="date" bind:value={from} max={to || today} /></label
			><label>Through<input type="date" bind:value={to} min={from} max={today} /></label>{/if}<label
			>Workout<select bind:value={filterWorkout} disabled={Boolean(workoutId)}
				><option value="">All workouts</option>{#each $app.workouts as w (w.id)}<option value={w.id}
						>{w.name}</option
					>{/each}</select
			></label
		><label
			>Exercise<select bind:value={filterExercise} disabled={Boolean(exerciseId)}
				><option value="">All exercises</option>{#each $app.exercises as e (e.id)}<option
						value={e.id}>{e.name}</option
					>{/each}</select
			></label
		>
	</div>
</div>
{#if error}<p class="notice error" role="alert">{error}</p>{/if}{#if loading}<p
		class="notice"
		role="status"
	>
		Loading {range === 'all' ? 'all history in pages' : 'your training'}… {count} sessions read.
	</p>{:else if !error}
	{#if !exercise || (exercise.kind === 'strength' && exercise.loadMode === 'external')}
		<ProgressDashboard report={progression} through={rangeEnd} />
	{/if}
	{#if exercise?.loadMode === 'bodyweight'}<div class="tabs">
			{#each [['all', 'All modes'], ['bodyweight', 'Bodyweight'], ['added', 'Added weight'], ['assistance', 'Assistance']] as [value, label] (value)}<button
					class:active={mode === value}
					onclick={() => (mode = value as typeof mode)}>{label}</button
				>{/each}
		</div>
		<p class="field-help">
			0 = bodyweight · +kg = added load · −kg = assistance. No bodyweight volume or estimated 1RM is
			calculated.
		</p>{/if}
	{#if exercise?.kind === 'strength' && exercise.loadMode !== 'none'}<label
			style="max-width:290px;margin:20px 0"
			>Best reps at selected {loadLabel(exercise)}<input
				inputmode="decimal"
				bind:value={load}
				placeholder="Choose a load (signed for bodyweight)"
			/></label
		>{/if}
	{#if chart.length}<section class="card" data-testid="session-chart">
			<h2>
				{exercise
					? exercise.kind === 'strength' && exercise.loadMode === 'external'
						? 'Your weight & reps'
						: 'Your logged performance'
					: 'A habit in the making.'}
			</h2>
			{#if weightedStrength}
				<div class="tabs" role="group" aria-label="Chart measure">
					{#each [['strength', 'Strength estimate'], ['load', 'Weight'], ['reps', 'Reps']] as [value, label] (value)}
						<button
							class:active={chartMetric === value}
							aria-pressed={chartMetric === value}
							onclick={() => (chartMetric = value as typeof chartMetric)}>{label}</button
						>
					{/each}
				</div>
			{/if}
			<p class="muted">
				{chartUnit} · {exercise
					? 'One bar per session'
					: 'Dates mark the start of each training week'}
			</p>
			{#if weightedStrength}
				<div class="trend-legend" aria-label="Strength change color legend">
					<span class="trend-value trend-increase">↗ Stronger</span>
					<span class="trend-value trend-steady">→ Steady (±1%)</span>
					<span class="trend-value trend-decrease">↘ Weaker</span>
				</div>
				<p class="field-help">
					Each bar uses the set with the highest strength estimate that session ({loadLabel(
						exercise!
					)}). Weight and reps always come from that same set. Colors compare the combined estimate
					with the previous session, whichever measure you view. Full completed reps only. Estimate
					= weight × (1 + reps ÷ 30); high-rep sets and changes in effort or technique make it less
					certain.
				</p>
			{/if}
			<div
				class="chart-bars"
				role="img"
				aria-label={`Training chart in ${chartUnit}. Full data table below.`}
			>
				{#each chart as point, i (point)}<div
						class={`chart-column trend-${chartTrends[i].tone}`}
						title={`${displayDate(point.date)} · ${point.label} · ${number(point.value)} ${chartUnit}${point.set ? ' · ' + strengthSetLabel(point.set) + ' · ' + chartTrends[i].label + ' strength estimate vs. previous session' : ''}`}
					>
						<span class="trend-value"
							><span aria-hidden="true">{chartTrends[i].symbol}</span> {number(point.value)}</span
						>
						{#if point.set}<span class="set-pair"
								>{point.set.load} kg<br />× {point.set.reps} reps</span
							>{/if}
						<div
							class="chart-bar"
							style:height={`${Math.max(3, ((point.value || 0) / max) * 140)}px`}
						></div>
						<time class="chart-date" datetime={point.date}>
							<span>{displayDate(point.date).split(', ')[0]}</span>
							<span>{point.date.slice(0, 4)}</span>
						</time>
					</div>{/each}
			</div>
			<div class="scroll-table" style="margin-top:20px">
				<table>
					<caption class="field-help">Accessible chart data · {chartUnit}</caption><thead
						><tr
							><th>Date</th><th>Session / period</th>
							{#if weightedStrength}<th>{loadLabel(exercise!)}</th><th>Completed reps</th><th
									>Strength estimate (kg)</th
								><th>Strength trend</th>
							{:else}<th>{chartUnit}</th>{/if}</tr
						></thead
					><tbody
						>{#each chart as point, i (point)}<tr
								><td>{displayDate(point.date)}</td><td>{point.label}</td>
								{#if weightedStrength}<td>{point.set?.load ?? 'N/A'}</td><td
										>{point.set?.reps ?? 'N/A'}</td
									><td>{number(point.set?.strength ?? null)}</td>
									<td>{chartTrends[i].symbol} {chartTrends[i].label}</td>
								{:else}<td>{point.value ?? 'N/A'}</td>{/if}</tr
							>{/each}</tbody
					>
				</table>
			</div>
		</section>{:else}<EmptyState
			icon="progress"
			title="Progress starts with your first entry."
			description="Complete a workout in this date range to see your numbers. Excluded sessions stay in history."
		/>{/if}
	<div class="stats-grid">
		<div class="stat-card">
			<div class="stat-top">Included workouts</div>
			<div class="stat-value">{stats.count}</div>
			<div class="stat-bottom">Completed sessions</div>
		</div>
		<div class="stat-card">
			<div class="stat-top">Working sets</div>
			<div class="stat-value">{stats.sets}</div>
			<div class="stat-bottom">Successful strength sets</div>
		</div>
		<div class="stat-card">
			<div class="stat-top">Time invested</div>
			<div class="stat-value">
				{stats.duration === null ? '—' : Math.round(stats.duration / 60)}
			</div>
			<div class="stat-bottom">
				Minutes · average {stats.averageDuration === null
					? '—'
					: Math.round(stats.averageDuration / 60)} per session
			</div>
		</div>
		<div class="stat-card">
			<div class="stat-top">Final-rep failures</div>
			<div class="stat-value">
				{exercise
					? exerciseRows.reduce((total, row) => total + row.m.failureSets, 0)
					: stats.failureSets}
			</div>
			<div class="stat-bottom">Marked attempts · 0.5 rep each</div>
		</div>
	</div>
	<p class="field-help">
		A marked final failed attempt adds 0.5 to counted reps, best reps, and exercise volume.
	</p>
	{#if exercise}<div class="section-heading"><h2>The numbers behind the chart.</h2></div>
		{#each exerciseRows as { s, m } (s.id)}<details class="card" style="margin-bottom:16px">
				<summary><strong>{displayDate(s.workoutDate)} · {s.nameSnapshot}</strong></summary>
				<p class="muted" style="margin-top:15px">
					{#if exercise.kind === 'strength'}{m.sets} sets · {m.reps} total reps · {m.failureSets} final-rep
						failures{#if load !== ''}
							· Best reps at {load}
							{loadLabel(exercise)}: {m.bestReps ?? 'N/A'}{/if}{#if m.volume !== null}
							· Logged load × reps: {m.volume} kg·reps{/if}{:else if exercise.kind === 'isometric'}{m.rounds}
						completed rounds · {m.holdSeconds} total hold seconds{:else}{m.durationSeconds} seconds ·
						{m.distanceKm === null ? 'Distance not recorded' : `${m.distanceKm} km`}{/if}
				</p>
				{#if m.volume !== null}<p class="field-help">
						Volume uses the recorded convention ({loadLabel(exercise)}). Dumbbell loads are never
						doubled, and volumes are never added across exercises.
					</p>{/if}
				<div class="scroll-table">
					<table>
						<thead><tr><th>Unit</th><th>Actual result</th><th>Notes</th></tr></thead><tbody
							>{#each m.entries as { item, record } (record.id)}<tr
									><td>{record.isExtra ? 'Extra' : (record.plannedUnitIndex ?? 0) + 1}</td><td
										>{recordLabel(record, item)}</td
									><td>{record.notes || '—'}</td></tr
								>{/each}</tbody
						>
					</table>
				</div>
				<a class="text-link" href={`/history/${s.id}`}>View / correct source workout</a>
			</details>{/each}{:else if ordered.length}<div class="section-heading">
			<h2>Session by session.</h2>
		</div>
		<div class="card scroll-table">
			<table>
				<thead
					><tr
						><th>Date</th><th>Workout</th><th>Plan</th><th>Completion</th><th>Extra</th><th
							>Sets / reps</th
						><th>Final-rep failures</th><th>Duration</th></tr
					></thead
				><tbody
					>{#each ordered as s (s.id)}{@const m = sessionMetrics(s, $app)}<tr
							><td>{displayDate(s.workoutDate)}</td><td
								><a class="text-link" href={`/history/${s.id}`}>{s.nameSnapshot}</a></td
							><td
								>v{s.templateVersion}{#if ordered.some((other) => other.templateId === s.templateId && other.templateVersion !== s.templateVersion)}
									· Plan changed{/if}</td
							><td
								>{m.completed}/{m.planned} · {m.completion === null
									? 'N/A'
									: `${Math.round(m.completion * 100)}%`}</td
							><td>{m.extra}</td><td>{m.sets} / {m.reps}</td><td>{m.failureSets}</td><td
								>{durationLabel(s.durationSeconds)}</td
							></tr
						>{/each}</tbody
				>
			</table>
		</div>{/if}

	<style>
		.set-pair {
			font-size: 11px;
			line-height: 1.4;
			color: var(--muted);
			white-space: nowrap;
		}
	</style>
{/if}
{#if !exercise}<div class="section-heading"><h2>Take a closer look.</h2></div>
	<div class="two-col">
		<div class="card">
			<h3>By workout</h3>
			<div class="stack">
				{#each $app.workouts as w (w.id)}<a class="text-link" href={`/progress/workouts/${w.id}`}
						>{w.name}<Icon name="arrow" size={15} /></a
					>{/each}
			</div>
		</div>
		<div class="card">
			<h3>By exercise</h3>
			<div class="stack">
				{#each $app.exercises.filter((e) => !workout || workout.items.some((i) => i.exerciseId === e.id)) as e (e.id)}<a
						class="text-link"
						href={`/progress/exercises/${e.id}`}>{e.name}<Icon name="arrow" size={15} /></a
					>{/each}
			</div>
		</div>
	</div>{/if}
