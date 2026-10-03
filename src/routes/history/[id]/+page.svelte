<script lang="ts">
	import { page } from '$app/state';
	import SessionScreen from '$lib/components/SessionScreen.svelte';
</script>

{#key page.params.id}<SessionScreen sessionId={page.params.id!} />{/key}
