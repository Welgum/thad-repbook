<script lang="ts">
	import { monthLabel } from '$lib/analytics/progression';
	import { chartTrend } from './chart-trend';
	let {
		points,
		label,
		unit = '%',
		baseline,
		compact = false
	}: {
		points: { date: string; value: number | null }[];
		label: string;
		unit?: string;
		baseline?: number;
		compact?: boolean;
	} = $props();
	let showData = $state(false);
	const values = $derived(points.flatMap((p) => (p.value === null ? [] : [p.value])));
	const low = $derived(Math.min(...values, baseline ?? Infinity));
	const high = $derived(Math.max(...values, baseline ?? -Infinity));
	const padding = $derived(Math.max((high - low) * 0.15, unit === '%' ? 1 : 2));
	const x = (i: number) => (points.length === 1 ? 320 : 55 + (i / (points.length - 1)) * 545);
	const y = (value: number) => 155 - ((value - low + padding) / (high - low + padding * 2)) * 125;
	// Percentage charts encode change from their baseline, not change in the rate of growth.
	// Load charts encode direction against the adjacent month and never bridge missing data.
	const pointTrends = $derived(
		points.map((point, i) => {
			const previous = points[i - 1]?.value;
			const reference = baseline ?? previous;
			return chartTrend(
				point.value === null || reference == null ? null : point.value - reference,
				baseline === undefined ? 0 : 1
			);
		})
	);
	const format = (value: number) => `${Number(value.toFixed(1))}${unit === '%' ? '%' : ` ${unit}`}`;
</script>

{#if values.length}
	<svg
		class:compact
		viewBox={compact ? '40 15 575 155' : '0 0 640 195'}
		role="img"
		aria-label={label}
	>
		<title>{label}</title>
		{#if !compact}
			{#each [low, high] as tick, i (i)}
				{#if i === 0 || high !== low}
					<line x1="55" x2="610" y1={y(tick)} y2={y(tick)} class="grid-line" />
					<text x="48" y={y(tick) + 4} text-anchor="end">{Number(tick.toFixed(1))}</text>
				{/if}
			{/each}
		{/if}
		{#if baseline !== undefined}
			<line x1="55" x2="610" y1={y(baseline)} y2={y(baseline)} class="baseline" />
		{/if}
		{#each points as point, i (point.date)}
			{@const trend = pointTrends[i]}
			{@const previous = points[i - 1]}
			{#if point.value !== null}
				{#if previous?.value != null}
					<line
						class={`trend-segment trend-${trend.tone}`}
						x1={x(i - 1)}
						y1={y(previous.value)}
						x2={x(i)}
						y2={y(point.value)}
						stroke-width={compact ? 8 : 3}
					/>
				{/if}
				<circle
					class={`trend-point trend-${trend.tone}`}
					cx={x(i)}
					cy={y(point.value)}
					r={compact ? 7 : 6}
				>
					<title
						>{monthLabel(point.date)}: {format(point.value)} · {trend.symbol}
						{trend.label}{baseline !== undefined
							? ' vs. previous month'
							: ' load vs. previous month'}</title
					>
				</circle>
			{/if}
			{#if !compact && (i === 0 || i === points.length - 1 || i % Math.max(1, Math.ceil(points.length / 4)) === 0)}
				<text x={x(i)} y="185" text-anchor="middle">{monthLabel(point.date)}</text>
			{/if}
		{/each}
	</svg>
	{#if compact}
		<div class="compact-dates" class:single={points.length === 1}>
			<time datetime={`${points[0].date}-01`}>{monthLabel(points[0].date)}</time>
			{#if points.length > 1}
				<time datetime={`${points[points.length - 1].date}-01`}
					>{monthLabel(points[points.length - 1].date)}</time
				>
			{/if}
		</div>
	{:else}
		<div class="trend-legend" aria-label="Chart color legend">
			<span class="trend-value trend-increase">↗ Higher</span>
			<span class="trend-value trend-steady"
				>→ {baseline === undefined ? 'Unchanged' : 'Steady (±1%)'}</span
			>
			<span class="trend-value trend-decrease">↘ Lower</span>
		</div>
		<button class="data-toggle" aria-expanded={showData} onclick={() => (showData = !showData)}
			>{showData ? 'Hide' : 'Show'} chart data</button
		>
		{#if showData}
			<div class="scroll-table">
				<table>
					<caption>{label}</caption>
					<thead><tr><th>Month</th><th>{unit}</th><th>Change vs. previous month</th></tr></thead>
					<tbody
						>{#each points as point, i (point.date)}<tr
								><td>{monthLabel(point.date)}</td><td
									>{point.value === null ? 'Not enough comparable data' : format(point.value)}</td
								><td class={`trend-value trend-${pointTrends[i].tone}`}
									>{pointTrends[i].symbol} {pointTrends[i].label}</td
								></tr
							>{/each}</tbody
					>
				</table>
			</div>
		{/if}
	{/if}
{:else}
	<p class="chart-empty">
		{compact ? 'No load history' : 'Your trend will appear after two comparable months.'}
	</p>
{/if}

<style>
	svg {
		display: block;
		width: 100%;
		overflow: visible;
	}
	text {
		fill: var(--muted);
		font-size: 12px;
	}
	.trend-segment {
		stroke: var(--trend-ink);
		stroke-linecap: round;
	}
	.trend-point {
		fill: var(--trend-fill);
		stroke: var(--trend-ink);
		stroke-width: 2;
	}
	.grid-line {
		stroke: #ddded2;
		stroke-width: 1;
	}
	.baseline {
		stroke: #929789;
		stroke-dasharray: 5 5;
	}
	.compact {
		width: 115px;
		height: 40px;
	}
	.compact-dates {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		width: 115px;
		margin-top: 5px;
		font-size: 10px;
		color: var(--muted);
		white-space: nowrap;
	}
	.compact-dates.single {
		justify-content: center;
	}
	.data-toggle {
		min-height: 44px;
		padding: 8px 0;
		font-size: 12px;
		border: 0;
		background: transparent;
		text-decoration: underline;
	}
	.chart-empty {
		padding: 35px 12px;
		text-align: center;
		color: var(--muted);
		font-size: 13px;
	}
</style>
