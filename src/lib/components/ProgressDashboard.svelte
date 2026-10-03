<script lang="ts">
	import { signedPercent, trendLabel, type ProgressionReport } from '$lib/analytics/progression';
	import { strengthSetLabel } from '$lib/analytics/strength';
	import { loadLabel } from '$lib/domain/session';
	import { displayDate, shiftDate, weekOf } from '$lib/domain/time';
	import TrendChart from './TrendChart.svelte';
	import { chartTrend } from './chart-trend';
	import Icon from './Icon.svelte';
	let {
		report,
		through,
		compact = false
	}: { report: ProgressionReport; through: string; compact?: boolean } = $props();
	let week = $state('');
	let showMethod = $state(false);
	const selected = $derived(
		report.weeks.find((m) => m.week === week) ??
			[...report.weeks].reverse().find((m) => m.compared > 0) ??
			report.weeks.at(-1)
	);
	const selectedTrend = $derived(chartTrend(selected?.change));
	const rows = $derived(
		selected
			? report.exercises
					.map((exercise) => ({
						exercise,
						point: exercise.points.find((p) => p.week === selected.week)!
					}))
					.filter(({ point }) => point.strength !== null)
					.sort((a, b) => {
						// Highest weekly gain first; unknown trends follow every measured result.
						if (a.point.change === null && b.point.change !== null) return 1;
						if (b.point.change === null && a.point.change !== null) return -1;
						return (
							(b.point.change ?? 0) - (a.point.change ?? 0) ||
							a.exercise.name.localeCompare(b.exercise.name)
						);
					})
			: []
	);
	const number = (n: number | null | undefined) =>
		n == null ? '—' : Number(n.toFixed(1)).toString();
</script>

<section class="progress-dashboard" aria-label="Strength progression dashboard">
	<div class="section-heading dashboard-heading">
		<div>
			<span class="eyebrow">EVERY REP COUNTS</span>
			<h2>Your strength, over time.</h2>
		</div>
		{#if selected}<label class="week-picker"
				>Progress week
				<select value={selected.week} onchange={(event) => (week = event.currentTarget.value)}>
					{#each [...report.weeks].reverse() as point (point.week)}<option value={point.week}
							>Week of {displayDate(point.week)}{point.week === weekOf(through) &&
							through < shiftDate(point.week, 6)
								? ' · through ' + displayDate(through)
								: ''}</option
						>{/each}
				</select>
			</label>{/if}
	</div>
	<p class="field-help period-note">
		Weeks run Monday–Sunday, through {displayDate(through)}. The first week uses its full history;
		activity totals below follow the exact date range.
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
					{signedPercent(selected?.change ?? null)}<small>vs. previous week</small></span
				>
			</div>
			<p class="muted">
				100 = previous week · {selected?.compared ?? 0} comparable {selected?.compared === 1
					? 'exercise'
					: 'exercises'}
			</p>
			<TrendChart
				points={report.weeks.map((m) => ({ date: m.week, value: m.change }))}
				label="Weekly strength change"
				baseline={0}
			/>
			<p class="field-help">
				Weight and completed reps both count. Dashed line = no change. Each exercise counts equally.
			</p>
		</div>
		<div class="insight-stack">
			<div class="card fastest-card" data-testid="fastest-exercise">
				<span class="eyebrow"
					>FASTEST PROGRESSION · {selected
						? 'WEEK OF ' + displayDate(selected.week).toUpperCase()
						: 'THIS WEEK'}</span
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
					<p>Largest estimated strength increase this week, accounting for weight and reps.</p>
				{:else}
					<h3>{selected?.compared ? 'No clear increase yet.' : 'A little more history.'}</h3>
					<p>
						{selected?.compared
							? 'No exercise is up more than 1% against the previous week.'
							: 'Log this exercise in two consecutive weeks to compare weight and reps.'}
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
				Each set gets a strength estimate: weight × (1 + completed reps ÷ 30). More reps at the same
				weight raise it. A heavier set with fewer reps can score higher, lower, or about the same:
				50 kg × 10 and 55 kg × 6 are within 1%; 55 kg × 8 is about 4.5% higher than 50 kg × 10. We
				take each day's best estimate, then the weekly median, and combine weekly ratios with equal
				weight per exercise. Sets, workout totals, and volume do not add points. Both adjacent weeks
				need a result using the same exercise and weight convention. Missing weeks stay blank. Full
				completed reps count; failed half-rep markers do not. Bodyweight, assistance, holds, and
				cardio keep their own charts. This Epley-style score is an estimate, not a measured maximum;
				high-rep sets and changes in effort or technique make comparisons less certain. The index
				uses 100 for the previous week, so changes are weekly, not cumulative. The exercise mix can
				vary; the comparison count shows coverage.
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
					? `Week of ${displayDate(selected.week)} vs. ${displayDate(shiftDate(selected.week, -7))}`
					: 'Weekly comparison'} · largest weekly gains first
			</p>
			{#if rows.length}
				<div class="scroll-table">
					<table>
						<thead
							><tr
								><th>Exercise</th><th>Strength trend</th><th>Typical strength</th><th
									aria-sort="descending">Weekly change <span aria-hidden="true">↓</span></th
								><th>Weight × reps</th></tr
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
											points={exercise.points.map((p) => ({
												date: p.week,
												value: p.strength,
												change: p.change,
												detail: p.referenceSets
													.map((set) => `${strengthSetLabel(set)} on ${displayDate(set.date)}`)
													.join('; ')
											}))}
											label={`${exercise.name}: weekly strength estimate from weight and reps (${loadLabel(exercise)})`}
											unit="est. kg"
										/></td
									>
									<td>{number(point.strength)}<small>estimated kg</small></td>
									<td
										><span class={`badge trend-badge trend-${trend.tone}`}
											><span aria-hidden="true">{trend.symbol}</span>{signedPercent(
												point.change
											)}</span
										><small>{trendLabel(point.change)}</small></td
									>
									<td class="reference-sets">
										{#each point.referenceSets as set (set.date)}
											<div>{strengthSetLabel(set)}<small>{displayDate(set.date)}</small></div>
										{/each}
									</td></tr
								>
							{/each}</tbody
						>
					</table>
				</div>
				<div class="trend-legend" aria-label="Strength trend color legend">
					<span class="trend-value trend-increase">↗ Stronger</span>
					<span class="trend-value trend-steady">→ Steady (±1%)</span>
					<span class="trend-value trend-decrease">↘ Weaker</span>
				</div>
				<p class="field-help">
					Strength trends account for both weight and reps. Weight × reps shows the real set(s) at
					the middle of each week's daily best estimates; with two middle sets, their estimates are
					averaged. Positive external loads only. Estimates are less certain with high reps.
				</p>
			{:else}<p class="muted">
					No included external-weight sets in this week. Choose another week or log a weighted
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
	.week-picker {
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
	.reference-sets {
		white-space: nowrap;
	}
	.reference-sets div + div {
		margin-top: 8px;
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
		.week-picker {
			width: 100%;
		}
	}
</style>
