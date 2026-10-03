<script lang="ts">
	import { app } from '$lib/repositories/app';
	import { validateImport, compatible } from '$lib/validation/import';
	import { digestText, importBundle } from '$lib/repositories/data';
	import { id, plan } from '$lib/domain/session';
	import type { Bundle } from '$lib/domain/types';
	import Icon from '$lib/components/Icon.svelte';
	let text = $state(''),
		bundle = $state<Bundle | null>(null),
		errors = $state<string[]>([]),
		mapping = $state<Record<string, string>>({}),
		copyOkay = $state(false),
		busy = $state(false),
		done = $state(false),
		count = $state(0),
		operation = $state(''),
		digest = $state('');
	const conflicts = $derived(
		bundle?.workouts.filter((w) =>
			$app.workouts.some((old) => old.key === w.key || old.name === w.name)
		) || []
	);
	async function file(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const f = input.files?.[0];
		if (!f) return;
		if (f.size > 1048576) {
			errors = ['file: maximum size is 1 MiB.'];
			return;
		}
		text = await f.text();
		await preview();
	}
	async function preview() {
		done = false;
		copyOkay = false;
		mapping = {};
		const result = validateImport(text);
		errors = result.errors;
		bundle = result.bundle || null;
		if (bundle) {
			digest = await digestText(JSON.stringify(bundle));
			const key = `repbook:${$app.user!.uid}:import:${digest}`;
			operation = sessionStorage.getItem(key) || id();
			sessionStorage.setItem(key, operation);
		}
	}
	async function commit() {
		if (!bundle || busy) return;
		busy = true;
		errors = [];
		try {
			if (conflicts.length && !copyOkay)
				throw new Error('Confirm that matching workouts should be imported as copies.');
			const map = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v));
			const result = await importBundle($app.user!.uid, bundle, operation, digest, map);
			count = result.createdIds.length;
			done = true;
		} catch (e) {
			errors = [(e as Error).message];
		} finally {
			busy = false;
		}
	}
	function another() {
		operation = id();
		sessionStorage.setItem(`repbook:${$app.user!.uid}:import:${digest}`, operation);
		done = false;
		copyOkay = false;
	}
</script>

<svelte:head><title>Import workouts · Repbook</title></svelte:head>
<div class="page-heading">
	<div>
		<span class="eyebrow">BRING YOUR OWN GAME PLAN</span>
		<h1>Your program. Right here.</h1>
		<p class="muted">Import workout templates with one simple JSON file.</p>
	</div>
	<a class="button" href="/import-format"><Icon name="book" /> Format & sample</a>
</div>
{#if done}<div class="card">
		<span class="badge lime">IMPORTED & SAVED</span>
		<h2 style="margin-top:20px">{count} {count === 1 ? 'workout' : 'workouts'}, ready to go.</h2>
		<p>
			Your exercises and templates were saved together. Retrying this operation won’t make
			duplicates.
		</p>
		<div class="actions">
			<a class="button lime" href="/workouts">Go to workouts<Icon name="arrow" /></a><button
				class="button"
				onclick={another}>Import another copy</button
			>
		</div>
		<p class="field-help" style="margin-top:18px">
			Importing another copy intentionally creates additional templates.
		</p>
	</div>{:else}<div class="card form-stack">
		<label
			>Choose a JSON file<input
				type="file"
				accept=".json,application/json"
				onchange={file}
			/></label
		><label
			>Or paste your JSON<textarea
				class="json-input"
				style="font-family:monospace;min-height:220px"
				bind:value={text}
				oninput={() => {
					bundle = null;
					errors = [];
				}}
				placeholder={'{ "schemaVersion": 1, "units": "kg", … }'}></textarea></label
		>
		<p class="field-help">
			Maximum 1 MiB · 20 workouts · 100 exercises · 40 items per workout. Only templates are
			imported.
		</p>
		<button class="button lime" disabled={!text.trim() || busy} onclick={preview}
			><Icon name="check" /> Validate & preview</button
		>
	</div>
	{#if bundle}<section class="card" style="margin-top:26px">
			<span class="badge lime">VALID BUNDLE · VERSION 1 · KG</span>
			<h2 style="margin-top:18px">Here’s what’s coming in.</h2>
			<p class="muted">
				{bundle.workouts.length} workouts · {bundle.exercises.length} exercise definitions
			</p>
			<div class="stack">
				{#each bundle.workouts as w (w.key)}<details>
						<summary><strong>{w.name}</strong> · {w.items.length} exercises</summary>
						<div class="scroll-table">
							<table>
								<thead><tr><th>Exercise</th><th>Plan</th><th>Rest</th></tr></thead><tbody
									>{#each w.items as item (item.itemKey)}<tr
											><td>{bundle.exercises.find((e) => e.key === item.exerciseKey)?.name}</td><td
												>{plan(item.target)}</td
											><td>{item.restSeconds}s</td></tr
										>{/each}</tbody
								>
							</table>
						</div>
					</details>{/each}
			</div>
			<h3 style="margin-top:26px">Exercise identity</h3>
			<p class="field-help">
				Choose an existing exercise explicitly to share its progress. Existing names and notes will
				be preserved. Otherwise a separate exercise is created.
			</p>
			<div class="form-stack">
				{#each bundle.exercises as e (e.key)}{@const matches = $app.exercises.filter(
						(old) => old.key === e.key
					)}{#if matches.length}<label
							>{e.name}<select bind:value={mapping[e.key]}
								><option value="">Import as separate exercise</option
								>{#each matches.filter((old) => compatible(old, e)) as old (old.id)}<option
										value={old.id}>Use existing: {old.name}</option
									>{/each}</select
							></label
						>{#if matches.some((old) => !compatible(old, e))}<p class="field-help">
								A matching key uses different measurements. It can only be imported as a separate
								exercise.
							</p>{/if}{/if}{/each}
			</div>
			{#if conflicts.length}<div class="notice">
					<strong>{conflicts.length} workouts match existing names or keys.</strong><label
						class="check-label"
						><input type="checkbox" bind:checked={copyOkay} />Import as copies. Keep existing
						programs.</label
					>
				</div>{/if}<button
				class="button lime full"
				style="margin-top:25px"
				disabled={busy || (conflicts.length > 0 && !copyOkay)}
				onclick={commit}
				><Icon name="import" />{busy ? 'Importing atomically…' : 'Import workouts'}</button
			>
		</section>{/if}{/if}
{#if errors.length}<div class="notice error" role="alert">
		<strong>Let’s fix a few things first.</strong>
		<ul>
			{#each errors as error, i (i)}<li>{error}</li>{/each}
		</ul>
	</div>{/if}
