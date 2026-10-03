<script lang="ts">
	import { onMount } from 'svelte';
	import { app, logout } from '$lib/repositories/app';
	import { saveProfile, saveEntity, sessionsInRange } from '$lib/repositories/data';
	import {
		openSession,
		mutateSession,
		takeover,
		editorId,
		retryAll,
		drafts
	} from '$lib/repositories/sessions';
	import { validZone } from '$lib/domain/time';
	import type { Session } from '$lib/domain/types';
	import Icon from '$lib/components/Icon.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	let zone = $state($app.profile!.timeZone),
		step = $state($app.profile!.settings.weightStep),
		error = $state(''),
		message = $state(''),
		sessions = $state<Session[]>([]),
		loading = $state(true),
		signout = $state(false);
	onMount(async () => {
		try {
			sessions = await sessionsInRange($app.user!.uid);
		} catch (e) {
			error = (e as Error).message;
		} finally {
			loading = false;
		}
	});
	async function action(fn: () => Promise<unknown>) {
		error = '';
		message = '';
		try {
			await fn();
		} catch (e) {
			error = (e as Error).message;
		}
	}
	async function save() {
		if (!validZone(zone))
			throw new Error('Enter a valid IANA timezone, for example Europe/Warsaw.');
		if (!Number.isFinite(step) || step <= 0 || step > 100)
			throw new Error('Choose a weight step above 0 and at most 100 kg.');
		await saveProfile($app.user!.uid, { timeZone: zone, settings: { weightStep: step } });
		message = 'Settings saved. Past workout dates are unchanged.';
	}
	async function restoreSession(s: Session, itemId?: string) {
		const d = await openSession($app.user!.uid, s.id);
		if (d.pending)
			throw new Error(
				'This session has unsent changes. Open it and sync before restoring exclusions here.'
			);
		if (d.session.editorId !== editorId()) await takeover($app.user!.uid, s.id);
		await mutateSession($app.user!.uid, s.id, (current) => {
			if (itemId) current.exercises.find((e) => e.id === itemId)!.excludedFromStats = false;
			else current.excludedFromStats = false;
		});
		sessions = sessions.map((old) => (old.id === s.id ? $drafts[s.id].session : old));
		message = 'Exclusion restored. Any remaining parent exclusions still apply.';
	}
</script>

<svelte:head><title>Settings · Repbook</title></svelte:head>
<div class="page-heading">
	<div>
		<span class="eyebrow">MAKE THIS SPACE YOURS</span>
		<h1>Your preferences.</h1>
		<p class="muted">Small adjustments, a smoother session.</p>
	</div>
</div>
{#if error}<p class="notice error" role="alert">{error}</p>{/if}{#if message}<p
		class="notice success"
		role="status"
	>
		{message}
	</p>{/if}
<div class="two-col">
	<section class="card form-stack">
		<h2>Training setup</h2>
		<label
			>Time zone (IANA)<input bind:value={zone} placeholder="Europe/Warsaw" list="zones" /></label
		><datalist id="zones"
			>{#each ['Europe/Warsaw', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney', 'UTC'] as z (z)}<option
					value={z}
				></option>{/each}</datalist
		>
		<p class="field-help">
			New workouts use this time zone. Existing calendar dates stay where you logged them.
		</p>
		<label
			>Weight step (kg)<input
				type="number"
				min="0.1"
				max="100"
				step="0.1"
				bind:value={step}
			/></label
		><label>Weight units<input value="Kilograms (kg)" readonly /></label><button
			class="button lime"
			onclick={() => action(save)}>Save preferences</button
		>
	</section>
	<section class="card">
		<span class="badge purple">YOUR PRIVATE WORKSPACE</span>
		<h2 style="margin-top:20px">{$app.profile?.displayName}</h2>
		<p class="muted">{$app.profile?.email}</p>
		<div class="stack">
			<button
				class="button"
				onclick={() =>
					action(async () => {
						await retryAll($app.user!.uid);
						message = 'Sync retry finished. Check each session’s sync status.';
					})}><Icon name="cloud" />Retry sync</button
			><button class="button" onclick={() => (signout = true)}
				><Icon name="logout" />Sign out</button
			><a class="text-link" href="/import-format"
				>JSON format & AI instructions<Icon name="arrow" size={16} /></a
			>
		</div>
	</section>
</div>
<div class="section-heading"><h2>Statistics exclusions</h2></div>
<p class="muted">
	Each level is independent. Restoring a program or exercise leaves individual session exclusions in
	place. Archived programs are still included unless excluded here.
</p>
<div class="card">
	<h3>Programs</h3>
	{#each $app.workouts as w (w.id)}<div class="exclusion-row">
			<span
				><strong>{w.name}</strong><small class="muted" style="display:block"
					>{w.excludedFromStats ? 'Excluded globally' : 'Included'}</small
				></span
			><button
				class="button small"
				onclick={() =>
					action(() =>
						saveEntity($app.user!.uid, 'workouts', {
							...w,
							excludedFromStats: !w.excludedFromStats
						})
					)}
				>{w.excludedFromStats ? 'Include in statistics' : 'Exclude workout from statistics'}</button
			>
		</div>{/each}
	<h3 style="margin-top:28px">Exercises</h3>
	{#each $app.exercises as e (e.id)}<div class="exclusion-row">
			<span
				><strong>{e.name}</strong><small class="muted" style="display:block"
					>{e.excludedFromStats ? 'Excluded in every program' : 'Included'}</small
				></span
			><button
				class="button small"
				onclick={() =>
					action(() =>
						saveEntity($app.user!.uid, 'exercises', {
							...e,
							excludedFromStats: !e.excludedFromStats
						})
					)}
				>{e.excludedFromStats
					? 'Include in statistics'
					: 'Exclude exercise from statistics'}</button
			>
		</div>{/each}
	<h3 style="margin-top:28px">Individual exclusions</h3>
	{#if loading}<p class="muted">
			Loading all sessions in pages…
		</p>{/if}{#each sessions as s (s.id)}{#if s.excludedFromStats}<div class="exclusion-row">
				<a class="text-link" href={`/history/${s.id}`}>{s.nameSnapshot} · {s.workoutDate}</a><button
					class="button small"
					onclick={() => action(() => restoreSession(s))}>Include session</button
				>
			</div>{/if}{#each s.exercises.filter((e) => e.excludedFromStats) as e (e.id)}<div
				class="exclusion-row"
			>
				<span
					>{e.exerciseSnapshot.name} · occurrence {e.order + 1}<small
						class="muted"
						style="display:block">{s.nameSnapshot} · {s.workoutDate}</small
					></span
				><button class="button small" onclick={() => action(() => restoreSession(s, e.id))}
					>Include this occurrence</button
				>
			</div>{/each}{/each}{#if !loading && !sessions.some((s) => s.excludedFromStats || s.exercises.some((e) => e.excludedFromStats))}<p
			class="muted"
		>
			No individual session exclusions.
		</p>{/if}
</div>
<Dialog bind:open={signout} title="Sign out of your workspace?"
	><p>
		Unsent workout changes must sync before you sign out. If sync fails, stay signed in and retry
		from the workout.
	</p>
	<button
		class="button lime full"
		onclick={() =>
			action(async () => {
				await logout();
				signout = false;
			})}>Sign out</button
	><button class="button full" style="margin-top:12px" onclick={() => (signout = false)}
		>Stay signed in</button
	></Dialog
>
