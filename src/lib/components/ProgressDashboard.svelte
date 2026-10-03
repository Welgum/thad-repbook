<script lang="ts">
	import {
		monthLabel,
		monthOf,
		shiftMonth,
		signedPercent,
		trendLabel,
		type ProgressionReport
	} from '$lib/analytics/progression';
	import { loadLabel } from '$lib/domain/session';
	import { displayDate } from '$lib/domain/time';
	import TrendChart from './TrendChart.svelte';
	import { chartTrend } from './chart-trend';
	import Icon from './Icon.svelte';
	let {
		report,
		through,
		compact = false
	}: { report: ProgressionReport; through: string; compact?: boolean } = $props();
	let month = $state('');
	let showMethod = $state(false);
	const selected = $derived(
		report.months.find((m) => m.month === month) ??
			[...report.months].reverse().find((m) => m.compared > 0) ??
			report.months.at(-1)
	);
	const selectedTrend = $derived(chartTrend(selected?.change));
	const rows = $derived(
		selected
			? report.exercises
					.map((exercise) => ({
						exercise,
						point: exercise.points.find((p) => p.month === selected.month)!
					}))
					.filter(({ point }) => point.load !== null)
					.sort(
						(a, b) =>
							(b.point.change ?? -Infinity) - (a.point.change ?? -Infinity) ||
							a.exercise.name.localeCompare(b.exercise.name)
					)
			: []
	);
	const number = (n: number | null | undefined) =>
		n == null ? '—' : Number(n.toFixed(1)).toString();
</script>

<section class="progress-dashboard" aria-label="Strength progression dashboard">
	<div class="section-heading dashboard-heading">
		<div>
			<span class="eyebrow">WEIGHTS TELL THE STORY</span>
			<h2>Your strength, over time.</h2>
		</div>
		{#if selected}<label class="month-picker"
				>Progress month
				<select value={selected.month} onchange={(event) => (month = event.currentTarget.value)}>
					{#each [...report.months].reverse() as point (point.month)}<option value={point.month}
							>{monthLabel(point.month)}{point.month === monthOf(through)
								? ' · through ' + through.slice(8)
								: ''}</option
						>{/each}
				</select>
			</label>{/if}
	</div>
	<p class="field-help period-note">
		Calendar-month comparisons through {displayDate(through)}. The first month uses its full
		history; activity totals below follow the exact date range.
	</p>
	<div class="progress-grid">
		<div class="card strength-card" data-testid="strength-index">
			<div class="score-heading">
				<h3>Strength index</h3>
				<span class={`badge trend-badge trend-${selectedTrend.tone}`}
					><span aria-hidden="true">{selectedTrend.symbol}</span>{trendLabel(
						selected?.change ?? null
					)}</span
				>
			</div>
			<div class="score-line">
				<strong class={`index-value trend-value trend-${selectedTrend.tone}`}
					>{number(selected?.index)}</strong
				><span class={`index-change trend-value trend-${selectedTrend.tone}`}
					><span aria-hidden="true">{selectedTrend.symbol}</span>
					{signedPercent(selected?.change ?? null)}<small>vs. previous month</small></span
				>
			</div>
			<p class="muted">
				100 = previous month · {selected?.compared ?? 0} comparable {selected?.compared === 1
					? 'exercise'
					: 'exercises'}
			</p>
			<TrendChart
				points={report.months.map((m) => ({ date: m.month, value: m.change }))}
				label="Monthly strength change"
				baseline={0}
			/>
			<p class="field-help">
				Monthly change in comparable lifting weights. Dashed line = no change. Each exercise counts
				equally.
			</p>
		</div>
		<div class="insight-stack">
			<div class="card fastest-card" data-testid="fastest-exercise">
				<span class="eyebrow"
					>FASTEST PROGRESSION · {selected
						? monthLabel(selected.month).toUpperCase()
						: 'THIS MONTH'}</span
				>
				{#if selected?.fastest}
					<h3>
						<a
							class="text-link"
							href={`/progress/exercises/${selected.fastest.exercise.exerciseId}`}
							>{selected.fastest.exercise.name}<Icon name="arrow" size={17} /></a
						>
					</h3>
					<div class="gain-value trend-value trend-increase">
						{signedPercent(selected.fastest.change)}
					</div>
					<p>Largest comparable weight increase this month.</p>
				{:else}
					<h3>{selected?.compared ? 'No clear increase yet.' : 'A little more history.'}</h3>
					<p>
						{selected?.compared
							? 'No exercise is up more than 1% against the previous month.'
							: 'Log matching rep counts across at least two weeks in each month to compare your lifts.'}
					</p>
				{/if}
			</div>
			<div class="card" data-testid="progress-balance">
				<h3>The direction of your lifts.</h3>
				<div class="direction-counts">
					<div class="trend-value trend-increase">
						<strong>{selected?.improving ?? 0}</strong><span>Stronger ↗</span>
					</div>
					<div class="trend-value trend-steady">
						<strong>{selected?.steady ?? 0}</strong><span>Steady →</span>
					</div>
					<div class="trend-value trend-decrease">
						<strong>{selected?.declining ?? 0}</strong><span>Weaker ↘</span>
					</div>
				</div>
				<p class="field-help">
					Within ±1% counts as steady. New or unmatched exercises wait for a baseline.
				</p>
			</div>
		</div>
	</div>
	<div class="method-note">
		<button
			class="method-toggle"
			aria-expanded={showMethod}
			onclick={() => (showMethod = !showMethod)}>How is this kept stable?</button
		>
		{#if showMethod}<p class="field-help">
				For each exercise and completed rep count, we take the best positive external load per day,
				then the median for each calendar week and the median of those weeks. A comparison needs
				logs at least seven days apart in both months. We combine matched rep-count changes using
				their median log ratio, then give each exercise equal weight in the overall index. Sets,
				workout totals, and volume do not add points. Full completed reps are used; failed half-rep
				markers do not raise the score. Bodyweight, assistance, holds, and cardio keep their own
				performance charts. Missing months stay blank. The index resets its reference to 100 each
				month, so read the chart as monthly change, not cumulative gain. The exercise mix can vary;
				the comparison count shows coverage.
			</p>{/if}
	</div>
	{#if compact}
		<a class="text-link" href="/progress"
			>Explore exercise progression <Icon name="arrow" size={16} /></a
		>
	{:else}
		<div class="card exercise-progression">
			<h3>Progression by exercise</h3>
			<p class="muted">
				{selected
					? `${monthLabel(selected.month)} vs. ${monthLabel(shiftMonth(selected.month, -1))}`
					: 'Monthly comparison'} · ranked by comparable weight change
			</p>
			{#if rows.length}
				<div class="scroll-table">
					<table>
						<thead
							><tr
								><th>Exercise</th><th>Load trend</th><th>Typical top load</th><th>Monthly change</th
								><th>Compared reps</th></tr
							></thead
						>
						<tbody
							>{#each rows as { exercise, point } (exercise.key)}
								{@const trend = chartTrend(point.change)}
								<tr
									><td
										><a class="text-link" href={`/progress/exercises/${exercise.exerciseId}`}
											>{exercise.name}</a
										><small>{loadLabel(exercise)}</small></td
									>
									<td
										><TrendChart
											compact
											points={exercise.points.map((p) => ({ date: p.month, value: p.load }))}
											label={`${exercise.name}: monthly typical top load in ${loadLabel(exercise)}`}
											unit="kg"
										/></td
									>
									<td>{number(point.load)} kg</td>
									<td
										><span class={`badge trend-badge trend-${trend.tone}`}
											><span aria-hidden="true">{trend.symbol}</span>{signedPercent(
												point.change
											)}</span
										><small>{trendLabel(point.change)}</small></td
									>
									<td
										>{point.matchedReps.length
											? point.matchedReps.join(', ')
											: 'Not enough matching history'}</td
									></tr
								>
							{/each}</tbody
						>
					</table>
				</div>
				<div class="trend-legend" aria-label="Load trend color legend">
					<span class="trend-value trend-increase">↗ Higher load</span>
					<span class="trend-value trend-steady">→ Same load</span>
					<span class="trend-value trend-decrease">↘ Lower load</span>
				</div>
				<p class="field-help">
					Load trend colors compare adjacent months. Load trends show weekly-smoothed top weights
					across all rep counts. Monthly changes compare only matching rep counts and weight
					conventions. Positive external loads only.
				</p>
			{:else}<p class="muted">
					No included external-weight sets in this month. Choose another month or log a weighted
					exercise.
				</p>{/if}
		</div>
	{/if}
</section>

<style>
	.progress-dashboard {
		margin: 24px 0 32px;
	}
	.dashboard-heading {
		align-items: end;
		gap: 18px;
		flex-wrap: wrap;
	}
	.dashboard-heading h2 {
		margin-top: 8px;
	}
	.month-picker {
		min-width: 190px;
	}
	.period-note {
		margin: -6px 0 18px;
	}
	.progress-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
		gap: 20px;
	}
	.strength-card {
		background: var(--white);
		min-width: 0;
	}
	.score-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.score-heading h3 {
		margin: 0;
	}
	.score-line {
		display: flex;
		align-items: center;
		gap: 20px;
		margin-top: 12px;
	}
	.index-value,
	.gain-value {
		font-family: 'Space Grotesk Variable', sans-serif;
		font-weight: 650;
		letter-spacing: -2px;
	}
	.index-value {
		font-size: 58px;
	}
	.index-change {
		font-size: 21px;
		font-weight: 650;
	}
	small {
		display: block;
		color: var(--muted);
		font-weight: 400;
		font-size: 11px;
		margin-top: 5px;
	}
	.insight-stack {
		display: grid;
		gap: 20px;
	}
	.fastest-card {
		background: var(--yellow);
	}
	.fastest-card h3 {
		margin-top: 16px;
	}
	.gain-value {
		font-size: 40px;
		margin-bottom: 8px;
	}
	.fastest-card p {
		font-size: 13px;
		margin-bottom: 0;
	}
	.direction-counts {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
		margin: 18px 0;
	}
	.direction-counts strong {
		display: block;
		font-family: 'Space Grotesk Variable', sans-serif;
		font-size: 28px;
	}
	.direction-counts span {
		font-size: 11px;
	}
	.field-help {
		margin-bottom: 0;
	}
	.method-note {
		margin: 10px 0 20px;
	}
	.method-toggle {
		border: 0;
		background: none;
		padding: 8px 0;
		min-height: 44px;
		font-size: 12px;
		text-decoration: underline;
	}
	.exercise-progression {
		min-width: 0;
	}
	@media (max-width: 850px) {
		.progress-grid {
			grid-template-columns: 1fr;
		}
		.insight-stack {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 550px) {
		.insight-stack {
			grid-template-columns: 1fr;
		}
		.index-value {
			font-size: 48px;
		}
		.month-picker {
			width: 100%;
		}
	}
</style>
