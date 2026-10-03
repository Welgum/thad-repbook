<script lang="ts">
	import type { Session } from '$lib/domain/types';
	import { app } from '$lib/repositories/app';
	import { exclusionReasons, sessionMetrics } from '$lib/analytics';
	import { displayDate, durationLabel } from '$lib/domain/time';
	import Icon from './Icon.svelte';
	let { session }: { session: Session } = $props();
	const metrics = $derived(sessionMetrics(session));
	const reasons = $derived(exclusionReasons(session, $app));
</script>

<a
	class="session-card"
	href={session.status === 'in_progress' ? `/session/${session.id}` : `/history/${session.id}`}
	><span class="session-icon"><Icon name="workouts" /></span><span class="session-info"
		><strong>{session.nameSnapshot}</strong><span class="muted"
			>{displayDate(session.workoutDate)} · {durationLabel(session.durationSeconds)} · {metrics.completed}
			logged units</span
		>{#if reasons.some((r) => r.toLowerCase().includes('excluded'))}<span class="excluded"
				>Excluded from stats</span
			>{/if}</span
	><span class:green={session.status === 'completed'} class="badge status-badge"
		>{session.status.replace('_', ' ')}</span
	><Icon name="right" /></a
>
