<script lang="ts">
	import Icon from './Icon.svelte';
	let {
		title,
		description,
		icon = 'workouts'
	}: { title: string; description: string; icon?: string } = $props();
</script>

<div class="empty-state">
	<div class="empty-icon"><Icon name={icon} size={30} /></div>
	<h3>{title}</h3>
	<p>{description}</p>
</div>
