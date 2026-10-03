<script lang="ts">
	import { page } from '$app/state';
	import ProgressScreen from '$lib/components/ProgressScreen.svelte';
</script>

{#key page.params.id}<ProgressScreen exerciseId={page.params.id} />{/key}
