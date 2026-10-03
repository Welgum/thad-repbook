<script lang="ts">
	import '../app.css';
	import '@fontsource-variable/dm-sans';
	import '@fontsource-variable/space-grotesk';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { app, initializeAppState } from '$lib/repositories/app';
	import Icon from '$lib/components/Icon.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
	let more = $state(false);
	const publicPage = $derived(['/login', '/import-format'].includes(page.url.pathname));
	const nav = [
		{ url: '/', icon: 'home', label: 'Home' },
		{ url: '/workouts', icon: 'workouts', label: 'Workouts' },
		{ url: '/calendar', icon: 'calendar', label: 'Calendar' },
		{ url: '/progress', icon: 'progress', label: 'Progress' }
	];
	const secondary = [
		{ url: '/history', icon: 'history', label: 'History' },
		{ url: '/import', icon: 'import', label: 'Import workouts' },
		{ url: '/import-format', icon: 'book', label: 'JSON format' },
		{ url: '/settings', icon: 'settings', label: 'Settings' }
	];
	onMount(() => initializeAppState());
	$effect(() => {
		if (['signed-out', 'unconfigured'].includes($app.phase) && !publicPage)
			void goto('/login', { replaceState: true });
		if ($app.phase === 'ready' && page.url.pathname === '/login')
			void goto('/', { replaceState: true });
	});
</script>

<svelte:head
	><title>Repbook — Make every rep count.</title><meta
		name="description"
		content="Your personal workout journal. Plan your training, log every set, and see your progress."
	/></svelte:head
>
{#if publicPage}<main class="public-page">{@render children()}</main>
{:else if $app.phase === 'ready'}
	<div class="app-shell">
		<aside class="sidebar">
			<a href="/" class="brand"
				><span class="brand-icon"><Icon name="workouts" size={26} /></span>repbook<span
					class="brand-period">.</span
				></a
			>
			<div class="sidebar-caption">YOUR TRAINING SPACE</div>
			<nav aria-label="Main navigation">
				{#each nav as n (n.url)}<a
						href={n.url}
						class:active={n.url === '/'
							? page.url.pathname === '/'
							: page.url.pathname.startsWith(n.url)}
						><Icon
							name={n.icon}
						/>{n.label}{#if n.url === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(n.url)}<span
								class="nav-dot"
							></span>{/if}</a
					>{/each}
			</nav>
			<div class="sidebar-rule"></div>
			<nav aria-label="Tools">
				{#each secondary as n (n.url)}<a href={n.url} class:active={page.url.pathname === n.url}
						><Icon name={n.icon} />{n.label}</a
					>{/each}
			</nav>
			<div class="sidebar-bottom">
				<div class="sidebar-note">
					<Icon name="zap" /><strong>Progress is a practice.</strong>
					<p>Show up. Log it.<br />Come back stronger.</p>
					<span aria-hidden="true">↗</span>
				</div>
				<a href="/settings" class="profile"
					><span class="avatar">{($app.profile?.displayName || 'A').charAt(0).toUpperCase()}</span
					><span><strong>{$app.profile?.displayName}</strong><small>Personal workspace</small></span
					><Icon name="settings" size={18} /></a
				>
			</div>
		</aside>
		<div class="main-column">
			<header class="topbar">
				<span class="topbar-kicker">A LITTLE STRONGER, EVERY DAY.</span><a
					href="/"
					class="mobile-brand">repbook.</a
				><span class="connection"
					><span class:offline={!$app.online} class="connection-dot"></span>{$app.online
						? 'All systems go'
						: 'Offline · saving locally'}</span
				>
			</header>
			<main id="main" class="main-content">{@render children()}</main>
			<footer class="footer">
				<span>BUILT ONE REP AT A TIME.</span><span>YOUR PACE. YOUR PROGRESS. ↗</span>
			</footer>
		</div>
		<nav class="bottom-nav" aria-label="Mobile navigation">
			{#each nav as n (n.url)}<a
					href={n.url}
					class:active={n.url === '/'
						? page.url.pathname === '/'
						: page.url.pathname.startsWith(n.url)}
					><Icon name={n.icon} size={22} /><span>{n.label}</span></a
				>{/each}<button class="flat" onclick={() => (more = true)}
				><Icon name="more" size={22} /><span>More</span></button
			>
		</nav>
	</div>
	<Dialog bind:open={more} title="Your training tools"
		><div class="stack">
			{#each secondary as n (n.url)}<a
					class="choice-row"
					href={n.url}
					onclick={() => (more = false)}><Icon name={n.icon} />{n.label}<Icon name="arrow" /></a
				>{/each}
		</div></Dialog
	>
{:else if $app.phase === 'error'}<main class="center-state">
		<div class="card">
			<h1>Let’s reconnect.</h1>
			<p role="alert">{$app.error}</p>
			<button class="button lime" onclick={() => location.reload()}>Retry safely</button>
			<p class="muted">Initialization is atomic. Retrying will not create duplicates.</p>
		</div>
	</main>
{:else}<main class="center-state" aria-busy="true">
		<span class="brand">repbook.</span>
		<div class="loader"></div>
		<p>Getting your training space ready…</p>
	</main>{/if}
