<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	let {
		open = $bindable(false),
		title,
		children
	}: { open?: boolean; title: string; children: Snippet } = $props();
	let element: HTMLDialogElement;
	$effect(() => {
		if (element) {
			if (open && !element.open) element.showModal();
			else if (!open && element.open) element.close();
		}
	});
</script>

<dialog bind:this={element} onclose={() => (open = false)} aria-label={title}>
	<div class="dialog-head">
		<h2>{title}</h2>
		<button class="icon-button flat" aria-label="Close dialog" onclick={() => (open = false)}
			><Icon name="close" /></button
		>
	</div>
	{@render children()}
</dialog>
