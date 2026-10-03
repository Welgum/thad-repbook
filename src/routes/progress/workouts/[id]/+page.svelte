<script lang="ts">
	import { page } from '$app/state';
	import ProgressScreen from '$lib/components/ProgressScreen.svelte';
</script>

{#key page.params.id}<ProgressScreen workoutId={page.params.id} />{/key}
