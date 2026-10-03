<script lang="ts">
	import { onMount } from 'svelte';
	import { app } from '$lib/repositories/app';
	import { id, parseNumber, loadLabel, recordLabel } from '$lib/domain/session';
	import type { Session, SessionExercise, SessionRecord } from '$lib/domain/types';
	import NumberInput from './NumberInput.svelte';
	import Icon from './Icon.svelte';
	let {
		session,
		item,
		unitIndex,
		record,
		suggestion,
		onlog,
		oncancel
	}: {
		session: Session;
		item: SessionExercise;
		unitIndex: number | null;
		record?: SessionRecord;
		suggestion?: { record: SessionRecord; date: string };
		onlog: (r: SessionRecord) => Promise<void>;
		oncancel?: () => void;
	} = $props();
	let reps = $state(''),
		weight = $state(''),
		mode = $state('bodyweight'),
		seconds = $state(''),
		distance = $state(''),
		holds = $state<Record<string, string>>({}),
		notes = $state(''),
		failed = $state(false),
		error = $state(''),
		busy = $state(false),
		ready = $state(false),
		touched = $state(false);
	const storageKey = $derived(
		`repbook:${$app.user?.uid}:input:${session.id}:${item.id}:${record?.id || 'new'}`
	);
	function applySource(source?: SessionRecord) {
		reps =
			source?.reps === undefined
				? 'repsMax' in item.targetSnapshot
					? String(item.targetSnapshot.repsMax)
					: ''
				: String(source.reps);
		const initial =
			source?.weightKg ??
			item.defaultWeightKg ??
			(item.exerciseSnapshot.loadMode === 'bodyweight' ? 0 : undefined);
		weight = initial === undefined ? '' : String(Math.abs(initial));
		mode =
			initial === undefined || initial === 0 ? 'bodyweight' : initial < 0 ? 'assistance' : 'added';
		seconds = String(
			source?.durationSeconds ??
				('durationSeconds' in item.targetSnapshot ? item.targetSnapshot.durationSeconds : '')
		);
		distance = source?.distanceKm === undefined ? '' : String(source.distanceKm);
		notes = record?.notes || '';
		failed = record?.status === 'failed';
		if ('directions' in item.targetSnapshot)
			holds = Object.fromEntries(
				item.targetSnapshot.directions.map((d) => [
					d,
					String(
						source?.holds?.[d] ??
							('holdSecondsMax' in item.targetSnapshot ? item.targetSnapshot.holdSecondsMax : '')
					)
				])
			);
	}
	onMount(() => {
		const last = [...session.records]
			.reverse()
			.find((r) => r.sessionExerciseId === item.id && r.deletedAt == null && r.status === 'logged');
		const source = record || last || suggestion?.record;
		applySource(source);
		if (!record) {
			try {
				const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
				if (saved) {
					({ reps, weight, mode, seconds, distance, holds, notes, failed } = saved);
					touched = true;
				}
			} catch {
				/* Use suggestions if the input draft is unavailable. */
			}
		}
		ready = true;
	});
	$effect(() => {
		if (
			ready &&
			!record &&
			!touched &&
			!session.records.some(
				(r) => r.sessionExerciseId === item.id && r.deletedAt == null && r.status === 'logged'
			)
		)
			applySource(suggestion?.record);
	});
	$effect(() => {
		if (ready && !record && touched) {
			try {
				localStorage.setItem(
					storageKey,
					JSON.stringify({ reps, weight, mode, seconds, distance, holds, notes, failed })
				);
			} catch {
				/* The committed log still uses durable IndexedDB. */
			}
		}
	});
	async function submit() {
		if (busy) return;
		busy = true;
		error = '';
		try {
			const r: SessionRecord = {
				id: record?.id || id(),
				sessionExerciseId: item.id,
				sessionExerciseOrder: item.order,
				kind: item.exerciseSnapshot.kind,
				plannedUnitIndex: record ? record.plannedUnitIndex : unitIndex,
				isExtra: record ? record.isExtra : unitIndex === null,
				status: 'logged',
				loggedAtClient: record?.loggedAtClient || Date.now(),
				revision: (record?.revision || 0) + 1,
				operationId: id(),
				deletedAt: null,
				...(notes ? { notes } : {})
			};
			if (r.kind === 'strength') {
				r.reps = parseNumber(reps, 0, 1000, true);
				if (r.reps === 0 && !failed) throw new Error('Mark this set as Failed to record 0 reps.');
				if (failed && r.reps !== 0)
					throw new Error('A failed set must have 0 reps. Uncheck Failed for a successful set.');
				r.status = failed ? 'failed' : 'logged';
				if (item.exerciseSnapshot.loadMode !== 'none')
					r.weightKg =
						item.exerciseSnapshot.loadMode === 'bodyweight' && mode === 'bodyweight'
							? 0
							: parseNumber(weight, 0, 2000) *
								(item.exerciseSnapshot.loadMode === 'bodyweight' && mode === 'assistance' ? -1 : 1);
			} else if (r.kind === 'isometric' && 'directions' in item.targetSnapshot)
				r.holds = Object.fromEntries(
					item.targetSnapshot.directions.map((d) => [d, parseNumber(holds[d] || '', 0, 600, true)])
				);
			else if (r.kind === 'duration') {
				r.durationSeconds = parseNumber(seconds, 1, 86400, true);
				if (distance.trim()) r.distanceKm = parseNumber(distance, 0, 2000);
			}
			await onlog(r);
			// Keep the button disabled across the browser's double-tap window.
			if (!record) await new Promise((resolve) => setTimeout(resolve, 500));
			if (!record) {
				notes = '';
				failed = false;
			}
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

{#if ready}
	<form
		novalidate
		class="form-stack"
		oninput={() => (touched = true)}
		onchange={() => (touched = true)}
		onfocusin={(event) => {
			if ((event.target as HTMLElement).closest('button')) touched = true;
		}}
		onsubmit={(event) => {
			event.preventDefault();
			void submit();
		}}
	>
		{#if !record && suggestion}<div class="notice" style="margin:0;background:#f0f0e6">
				<strong>Previous · {suggestion.date}</strong><br />{recordLabel(suggestion.record, item)}<br
				/><span class="field-help">Suggested values only. Confirm each new entry.</span>
			</div>{/if}
		{#if item.exerciseSnapshot.kind === 'strength'}
			{#if item.exerciseSnapshot.loadMode === 'bodyweight'}<div
					class="tabs"
					aria-label="Bodyweight load mode"
				>
					{#each [['bodyweight', 'Bodyweight'], ['added', 'Added weight'], ['assistance', 'Assistance']] as [value, label] (value)}<button
							type="button"
							class:active={mode === value}
							onclick={() => (mode = value)}>{label}</button
						>{/each}
				</div>{/if}
			<div class="form-grid">
				<NumberInput
					label="Reps"
					bind:value={reps}
					integer
					max={1000}
					required
				/>{#if item.exerciseSnapshot.loadMode !== 'none' && !(item.exerciseSnapshot.loadMode === 'bodyweight' && mode === 'bodyweight')}<NumberInput
						label={item.exerciseSnapshot.loadMode === 'bodyweight'
							? mode === 'assistance'
								? 'Assistance (kg)'
								: 'Added weight (kg)'
							: loadLabel(item.exerciseSnapshot)}
						bind:value={weight}
						step={$app.profile?.settings.weightStep || 0.5}
						required
					/>{/if}
			</div>
			<label class="check-label"
				><input
					type="checkbox"
					bind:checked={failed}
					onchange={() => {
						if (failed) reps = '0';
					}}
				/> Failed set (0 reps)</label
			>
		{:else if item.exerciseSnapshot.kind === 'isometric' && 'directions' in item.targetSnapshot}<div
				class="form-grid"
			>
				{#each item.targetSnapshot.directions as direction (direction)}<NumberInput
						label={`${direction} (s)`}
						bind:value={holds[direction]}
						max={600}
						integer
						required
					/>{/each}
			</div>
			<p class="field-help">
				Log all directions together. A 0-second direction saves a partial round. Only complete
				rounds count toward your plan.
			</p>
		{:else}<div class="form-grid single-mobile">
				<NumberInput
					label="Duration (seconds)"
					bind:value={seconds}
					max={86400}
					min={1}
					step={30}
					integer
					required
				/><NumberInput label="Distance (km, optional)" bind:value={distance} step={0.1} />
			</div>{/if}
		<label
			>Set notes <span class="field-help">Optional</span><input
				maxlength="2000"
				placeholder="How did that feel?"
				bind:value={notes}
			/></label
		>
		{#if error}<p class="notice error" role="alert" style="margin:0">{error}</p>{/if}
		<div class="actions">
			<button type="submit" class="button lime" style="flex:1" disabled={busy || !ready}
				><Icon name="check" />{busy
					? 'Saving…'
					: record
						? 'Save changes'
						: item.exerciseSnapshot.kind === 'strength'
							? 'Log set'
							: item.exerciseSnapshot.kind === 'isometric'
								? 'Log round'
								: 'Log activity'}</button
			>{#if oncancel}<button type="button" class="button" onclick={oncancel}>Cancel</button>{/if}
		</div>
	</form>
{/if}
