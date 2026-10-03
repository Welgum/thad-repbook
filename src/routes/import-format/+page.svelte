<script lang="ts">
	import { schema } from '$lib/validation/import';
	import sample from '$lib/seed/bundle.json';
	import prompt from '$lib/seed/ai-prompt.txt?raw';
	import Icon from '$lib/components/Icon.svelte';
	let copied = $state(false),
		error = $state('');
	async function copy() {
		try {
			await navigator.clipboard.writeText(
				`${prompt}\n\nJSON SCHEMA\n${JSON.stringify(schema, null, 2)}\n\nCOMPLETE VALID EXAMPLE\n${JSON.stringify(sample, null, 2)}`
			);
			copied = true;
			error = '';
		} catch {
			error =
				'Clipboard access was blocked. Select and copy the instructions below, together with the schema and example.';
		}
	}
</script>

<svelte:head><title>JSON format · Repbook</title></svelte:head>
<div style="max-width:1000px;margin:0 auto;padding:35px 23px 70px">
	<a class="brand" href="/" style="margin-bottom:40px">repbook.</a>
	<div class="page-heading">
		<div>
			<span class="eyebrow">OPEN FORMAT. ENDLESS POSSIBILITIES.</span>
			<h1>A good plan travels well.</h1>
			<p class="muted">Workout-template JSON · version 1 · kilograms</p>
		</div>
	</div>
	<div class="actions">
		<button class="button lime" onclick={copy}
			><Icon name="copy" />{copied ? 'Copied' : 'Copy for AI'}</button
		><a class="button" href="/workouts.example.json" download
			><Icon name="download" />Download sample</a
		><a class="button" href="/workouts.schema.json" download
			><Icon name="download" />Download JSON Schema</a
		><a class="button" href="/import">Import workouts<Icon name="arrow" /></a>
	</div>
	{#if error}<p class="notice error" role="alert">{error}</p>{/if}
	<p style="margin:25px 0">
		Create programs yourself or give your AI assistant the complete instructions. “Copy for AI”
		includes the instructions, current schema, and a full valid example. Imports create templates;
		they never create completed training history.
	</p>
	<section class="card">
		<h2>The contract.</h2>
		<div class="scroll-table">
			<table>
				<thead><tr><th>Object</th><th>Required fields</th><th>Optional</th></tr></thead><tbody
					><tr
						><td>Root</td><td>schemaVersion: 1, units: "kg", exercises, workouts</td><td>None</td
						></tr
					><tr
						><td>Exercise</td><td>key, name, kind, loadMode, weightConvention</td><td>notes</td></tr
					><tr><td>Workout</td><td>key, name, items</td><td>notes</td></tr><tr
						><td>Item</td><td>itemKey, exerciseKey, target, restSeconds</td><td
							>notes, defaultWeightKg</td
						></tr
					></tbody
				>
			</table>
		</div>
		<p style="margin-top:20px">
			Keys use lowercase letters, numbers and hyphens (1–64 characters). Exercise and workout keys
			must be unique; item keys must be unique within each workout. Every exerciseKey references an
			exercise in the same file.
		</p>
		<h3>Targets by exercise type</h3>
		<pre>{JSON.stringify(
				{
					strength: { sets: 3, repsMin: 6, repsMax: 10 },
					isometric: {
						rounds: 2,
						directions: ['Front', 'Back', 'Left', 'Right'],
						holdSecondsMin: 5,
						holdSecondsMax: 10
					},
					duration: { durationSeconds: 1500 }
				},
				null,
				2
			)}</pre>
		<p class="field-help">
			These are target shapes, not an importable bundle. Each item contains only the target for its
			exercise kind.
		</p>
		<h3>Keep measurements consistent.</h3>
		<p>
			Strength supports external / total, per_dumbbell, machine_stack, or as_logged; bodyweight /
			bodyweight_adjustment; or none / none. Isometric and duration use none / none. For dumbbells,
			record one dumbbell. For bodyweight, 0 means unassisted, positive means added weight, and
			negative means assistance.
		</p>
		<p>
			Omit defaultWeightKg unless an explicit load is part of the plan. Do not use null, numeric
			strings, comments, trailing commas, or extra properties.
		</p>
		<h3>Limits</h3>
		<p>
			1 MiB per file. 1–20 workouts, 1–100 exercises, 1–40 items per workout. Names: 1–120
			characters; notes: up to 2,000. Templates: up to 64 KiB after serialization.
		</p>
		<p>
			Sets / rounds: 1–30. Reps: 1–1,000. Rest: 0–3,600 seconds. Holds: 1–600 seconds and 1–8 unique
			directions. Duration: 1–86,400 seconds. Minimum targets cannot exceed maximums. External
			default loads: 0–2,000 kg; bodyweight adjustments: −2,000–2,000 kg.
		</p>
	</section>
	<section class="card" style="margin-top:22px">
		<h2>Instructions for your AI assistant</h2>
		<pre>{prompt}</pre>
		<details>
			<summary>Current JSON Schema</summary>
			<pre>{JSON.stringify(schema, null, 2)}</pre>
		</details>
		<details style="margin-top:20px">
			<summary>Full valid example: five starter programs</summary>
			<pre>{JSON.stringify(sample, null, 2)}</pre>
		</details>
	</section>
	<p class="field-help" style="margin-top:25px">
		Starter source notes: approximate sessions are 50 minutes; rests are guidelines. Leave 1–3 reps
		in reserve (deadlift 2–3; squat 3). Barbell loads are total, dumbbell loads are per dumbbell.
		Sunday is a rest day in the source. You may start any workout on any day. Thursday is preserved
		in the requirements as an optional sixth program and is not seeded.
	</p>
</div>
