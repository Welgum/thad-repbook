<script lang="ts">
	import { onMount } from 'svelte';
	import type { RestState } from '$lib/domain/types';
	import { remaining } from '$lib/domain/timer';
	import { clock } from '$lib/domain/time';
	import Icon from './Icon.svelte';
	let {
		timer,
		onchange
	}: { timer: RestState | null; onchange: (action: 'skip' | 'extend' | 'restart') => void } =
		$props();
	let now = $state(Date.now());
	const left = $derived(remaining(timer, now));
	onMount(() => {
		const refresh = () => (now = Date.now());
		const interval = setInterval(refresh, 250);
		document.addEventListener('visibilitychange', refresh);
		return () => {
			clearInterval(interval);
			document.removeEventListener('visibilitychange', refresh);
		};
	});
</script>

{#if timer}<section class="rest-timer" aria-label="Rest timer">
		<div class="timer-header">
			<span role="status">{left > 0 ? 'TAKE A BREATHER' : 'REST COMPLETE'}</span><Icon
				name="timer"
				size={18}
			/>
		</div>
		<div class="timer-time" aria-hidden="true">{clock(left)}</div>
		<progress
			max={timer.durationSeconds}
			value={Math.max(0, timer.durationSeconds - left)}
			aria-label="Rest progress"
		></progress>
		<p>
			{left > 0 ? `Up next: ${timer.nextAction}` : 'Ready when you are. Your next set is yours.'}
		</p>
		<div class="actions">
			<button onclick={() => onchange('skip')}>Skip rest</button><button
				onclick={() => onchange('extend')}>+30 sec</button
			><button onclick={() => onchange('restart')}>Restart rest</button>
		</div>
	</section>{/if}
