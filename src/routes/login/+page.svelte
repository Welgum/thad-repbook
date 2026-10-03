<script lang="ts">
	import { app, login, emulatorLogin } from '$lib/repositories/app';
	import { emulatorEnabled } from '$lib/firebase/client';
	import Icon from '$lib/components/Icon.svelte';
	let busy = $state(false),
		error = $state(''),
		email = $state('athlete@example.test');
	async function signIn(local = false) {
		busy = true;
		error = '';
		try {
			if (local) await emulatorLogin(email);
			else await login();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Sign in · Repbook</title></svelte:head>
<div class="login-layout">
	<section class="login-story">
		<a class="brand" href="/">repbook.</a>
		<div class="login-story-content">
			<span class="eyebrow">YOUR PERSONAL TRAINING JOURNAL</span>
			<h1>Small steps.<br />Strong habits.<br /><span>Real progress.</span></h1>
			<p>
				A place for your programs, your personal bests,<br class="desktop-only" /> and every honest rep
				in between.
			</p>
			<div class="login-art" aria-hidden="true">
				<div class="art-weight"><Icon name="workouts" size={150} /></div>
				<span class="sticker">SHOW UP<br />FOR YOU. ↗</span><span class="login-star">✳</span>
			</div>
		</div>
		<span class="eyebrow">ONE REP AT A TIME. SINCE TODAY.</span>
	</section>
	<section class="login-form">
		<div class="login-box">
			<span class="badge lime">LET’S GET TO WORK</span>
			<h2>Your next chapter<br />starts with a set.</h2>
			<p class="muted">
				Sign in to keep your training in one place. Five starter programs are ready when you are.
			</p>
			{#if $app.phase === 'error'}<div class="notice error" role="alert">
					{$app.error}<button class="button" onclick={() => location.reload()}
						>Retry initialization</button
					>
				</div>{/if}
			{#if error}<p class="notice error" role="alert">
					{error}
				</p>{/if}{#if $app.phase === 'unconfigured'}<div class="notice">
					<h3>Connect Firebase to get started.</h3>
					<p>
						Add your Firebase web configuration to <code>.env</code>, enable Google sign-in and
						deploy the included security rules. The README walks you through each step.
					</p>
					<a href="/import-format" class="text-link"
						>Explore the workout format <Icon name="arrow" size={16} /></a
					>
				</div>{:else}<button
					class="button google full"
					onclick={() => signIn()}
					disabled={busy || $app.phase === 'loading'}
					><span class="google-g">G</span>{busy ? 'Connecting…' : 'Continue with Google'}<Icon
						name="arrow"
					/></button
				>{/if}{#if emulatorEnabled()}<div class="emulator-box">
					<span class="badge">LOCAL FIREBASE EMULATOR</span><label
						>Test account email<input type="email" bind:value={email} /></label
					><button
						class="button full"
						onclick={() => signIn(true)}
						disabled={busy || $app.phase === 'loading'}>Continue with test account</button
					>
				</div>{/if}
			<div class="login-features">
				<span><Icon name="check" size={18} /> Your data, your space</span><span
					><Icon name="check" size={18} /> Pick any workout, any day</span
				><span><Icon name="check" size={18} /> Made for your phone</span>
			</div>
			<a href="/import-format" class="muted text-link"
				>Have your own program? Bring it along. <Icon name="external" size={16} /></a
			>
		</div>
	</section>
</div>
