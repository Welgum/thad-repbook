/** Presentation only: callers choose whether change means a monthly percentage or a raw delta. */
export function chartTrend(change: number | null | undefined, tolerance = 1) {
	if (change == null || !Number.isFinite(change))
		return { tone: 'unavailable', symbol: '', label: 'No comparison' } as const;
	if (change > tolerance) return { tone: 'increase', symbol: '↗', label: 'Higher' } as const;
	if (change < -tolerance) return { tone: 'decrease', symbol: '↘', label: 'Lower' } as const;
	return { tone: 'steady', symbol: '→', label: 'Steady' } as const;
}
