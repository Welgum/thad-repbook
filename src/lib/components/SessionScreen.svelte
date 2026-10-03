<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { app } from '$lib/repositories/app';
	import { sessionsInRange } from '$lib/repositories/data';
	import {
		drafts,
		openSession,
		watchSession,
		mutateSession,
		syncSession,
		editorId,
		takeover,
		resolveConflict
	} from '$lib/repositories/sessions';
	import { id, clone, plan, units, nextUnit, recordLabel } from '$lib/domain/session';
	import { dateInZone, validDate, displayDate, durationLabel } from '$lib/domain/time';
	import { startRest, extendRest } from '$lib/domain/timer';
	import { sessionMetrics, previousResult, exclusionReasons } from '$lib/analytics';
	import type { Session, SessionRecord } from '$lib/domain/types';
	import Icon from './Icon.svelte';
	import RecordForm from './RecordForm.svelte';
	import RestTimer from './RestTimer.svelte';
	import Dialog from './Dialog.svelte';
	let { sessionId }: { sessionId: string } = $props();

	let selected = $state(0),
		error = $state(''),
		loaded = $state(false),
		past = $state<Session[]>([]),
		editing = $state<SessionRecord | null>(null),
		finish = $state(false),
		abandon = $state(false),
		remove = $state(false),
		notes = $state(''),
		date = $state(''),
		duration = $state(''),
		showExtra = $state(false),
		undoRecord = $state<SessionRecord | null>(null),
		busy = $state(false);
	const draft = $derived($drafts[sessionId]);
	const session = $derived(draft?.session);
	const item = $derived(session?.exercises[selected]);
	const metrics = $derived(session ? sessionMetrics(session) : null);
	const readonly = $derived(session?.editorId !== editorIdSafe() || draft?.status === 'Conflict');
	const unitIndex = $derived(session && item ? nextUnit(session, item) : null);
	const suggestion = $derived(item ? previousResult(past, item, $app) : undefined);
	const reasons = $derived(session ? exclusionReasons(session, $app) : []);
	function editorIdSafe() {
		return typeof sessionStorage === 'undefined' ? '' : editorId();
	}
	onMount(() => {
		let stop = () => {};
		let alive = true;
		(async () => {
			try {
				const d = await openSession($app.user!.uid, sessionId);
				if (!alive) return;
				notes = d.session.notes;
				date = d.session.workoutDate;
				duration = d.session.durationSeconds === null ? '' : String(d.session.durationSeconds / 60);
				loaded = true;
				stop = watchSession($app.user!.uid, sessionId);
				past = await sessionsInRange($app.user!.uid, undefined, d.session.workoutDate);
			} catch (e) {
				error = (e as Error).message;
			}
		})();
		return () => {
			alive = false;
			stop();
		};
	});
	async function change(fn: (s: Session) => void, ids: string[] = []) {
		await mutateSession($app.user!.uid, sessionId, fn, ids);
	}
	async function guard(fn: () => Promise<void>) {
		error = '';
		try {
			await fn();
		} catch (e) {
			error = (e as Error).message;
		}
	}
	async function log(r: SessionRecord) {
		if (!session || !item) return;
		const currentItem = clone(item);
		const isEdit = Boolean(editing);
		if (
			!isEdit &&
			r.plannedUnitIndex !== null &&
			session.records.some(
				(old) =>
					old.sessionExerciseId === r.sessionExerciseId &&
					old.deletedAt == null &&
					old.plannedUnitIndex === r.plannedUnitIndex
			)
		)
			return;
		await change(
			(s) => {
				const index = s.records.findIndex((old) => old.id === r.id);
				if (index >= 0) s.records[index] = r;
				else s.records.push(r);
				if (
					!isEdit &&
					s.entryMode === 'live' &&
					s.status === 'in_progress' &&
					currentItem.restSeconds > 0
				)
					s.timerState = startRest(
						currentItem.restSeconds,
						r.id,
						currentItem.exerciseSnapshot.name
					);
			},
			[r.id]
		);
		editing = null;
		showExtra = false;
	}
	async function skip() {
		if (!session || !item || unitIndex === null) return;
		const r: SessionRecord = {
			id: id(),
			sessionExerciseId: item.id,
			sessionExerciseOrder: item.order,
			kind: item.exerciseSnapshot.kind,
			plannedUnitIndex: unitIndex,
			isExtra: false,
			status: 'skipped',
			loggedAtClient: Date.now(),
			operationId: id(),
			revision: 1,
			deletedAt: null
		};
		await change((s) => s.records.push(r), [r.id]);
	}
	async function deleteRecord(record: SessionRecord) {
		await change(
			(s) => {
				const r = s.records.find((r) => r.id === record.id)!;
				r.deletedAt = Date.now();
				r.revision++;
				r.operationId = id();
				if (s.timerState?.recordId === r.id) s.timerState = null;
			},
			[record.id]
		);
		undoRecord = clone(record);
	}
	async function undo() {
		if (!undoRecord) return;
		const old = clone(undoRecord);
		await change(
			(s) => {
				const r = s.records.find((r) => r.id === old.id)!;
				Object.assign(r, old, { revision: r.revision + 1, operationId: id(), deletedAt: null });
			},
			[old.id]
		);
		undoRecord = null;
	}
	async function timer(action: 'skip' | 'extend' | 'restart') {
		await change((s) => {
			if (!s.timerState) return;
			if (action === 'skip') s.timerState = { ...s.timerState, deadlineAt: Date.now() };
			if (action === 'extend') s.timerState = extendRest(s.timerState);
			if (action === 'restart')
				s.timerState = startRest(
					s.timerState.durationSeconds,
					s.timerState.recordId,
					s.timerState.nextAction
				);
		});
	}
	async function saveDetails() {
		if (!validDate(date) || date > dateInZone(Date.now(), $app.profile!.timeZone))
			throw new Error('Choose a valid date, today or earlier.');
		let seconds: number | null = null;
		if (duration.trim()) {
			const n = Number(duration.replace(',', '.'));
			if (!Number.isFinite(n) || n < 0 || n > 1440)
				throw new Error('Duration must be from 0 to 1,440 minutes, or blank.');
			seconds = Math.round(n * 60);
		}
		await change((s) => {
			s.notes = notes;
			s.workoutDate = date;
			if (s.entryMode === 'retrospective' || s.status !== 'in_progress')
				s.durationSeconds = seconds;
		});
	}
	async function end(status: 'completed' | 'abandoned') {
		if (busy) return;
		busy = true;
		try {
			await saveDetails();
			await change((s) => {
				s.status = status;
				s.finishedAt = Date.now();
				s.timerState = null;
				if (s.entryMode === 'live')
					s.durationSeconds = Math.round((Date.now() - s.startedAt) / 1000);
			});
			finish = false;
			abandon = false;
			await goto(`/history/${sessionId}`);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>{session?.nameSnapshot || 'Workout'} · Repbook</title></svelte:head>
<a class="back-link" href="/history"><Icon name="left" size={16} /> Workout history</a>
{#if error}<p class="notice error" role="alert">
		{error}<button class="flat" onclick={() => location.reload()}>Reload</button>
	</p>{/if}
{#if !loaded}<p class="muted">Loading your workout…</p>{:else if session && item && metrics}
	<div class="page-heading">
		<div>
			<span class="eyebrow"
				>{session.entryMode === 'retrospective'
					? 'PAST WORKOUT · TIMER OFF'
					: session.status === 'in_progress'
						? 'YOU SHOWED UP. NOW MAKE IT COUNT.'
						: 'ANOTHER SESSION IN THE BOOKS'}</span
			>
			<h1>{session.nameSnapshot}</h1>
			<p class="muted">
				{displayDate(session.workoutDate)} · {metrics.completed}/{metrics.planned} planned units · {metrics.extra}
				extra · {session.status.replace('_', ' ')}
			</p>
		</div>
		<span class="badge" class:lime={draft.status === 'Synced'} role="status"
			><Icon name={draft.status === 'Synced' ? 'cloud' : 'offline'} size={14} />{draft.status}</span
		>
	</div>
	{#if draft.status === 'Sync failed'}<div class="notice error" role="alert">
			Sync failed. {draft.error} Your local data is safe.<button
				class="button small"
				onclick={() => syncSession($app.user!.uid, sessionId)}>Retry sync</button
			>
		</div>{/if}
	{#if draft.status === 'Conflict'}<div class="notice error">
			<h3>Two versions need your attention.</h3>
			<p>
				{draft.error} Keeping this device replaces the server version. A recovery copy is kept locally.
			</p>
			<div class="actions">
				<button
					class="button"
					onclick={() => guard(() => resolveConflict($app.user!.uid, sessionId, 'remote'))}
					>Use server version</button
				><button
					class="button yellow"
					onclick={() => guard(() => resolveConflict($app.user!.uid, sessionId, 'local'))}
					>Keep this device’s version</button
				>
			</div>
		</div>{:else if readonly}<div class="notice">
			<strong>Another editor owns this workout.</strong>
			<p>
				Take over to log or edit here. Other devices will be asked to resolve conflicting changes.
			</p>
			<button class="button" onclick={() => guard(() => takeover($app.user!.uid, sessionId))}
				>Take over editing</button
			>
		</div>{/if}
	{#if reasons.some((r) => r.toLowerCase().includes('excluded'))}<p class="notice">
			Excluded from stats: {reasons.filter((r) => r.toLowerCase().includes('excluded')).join(' · ')}
		</p>{/if}
	{#if session.status === 'in_progress' && session.entryMode === 'live'}<div class="mobile-rest">
			<RestTimer
				timer={session.timerState}
				onchange={(action) => {
					if (!readonly) void guard(() => timer(action));
				}}
			/>
		</div>{/if}
	<div class="session-layout">
		<div class="session-main stack">
			<div class="card">
				<div class="section-heading" style="margin-top:0">
					<span class="badge blue">EXERCISE {selected + 1} OF {session.exercises.length}</span><span
						class="badge"
						>{unitIndex === null
							? 'PLAN LOGGED'
							: `UNIT ${unitIndex + 1} OF ${units(item.targetSnapshot)}`}</span
					>
				</div>
				<h2>{item.exerciseSnapshot.name}</h2>
				<p class="muted">{plan(item.targetSnapshot)} · {item.restSeconds}s rest</p>
				{#if item.exerciseSnapshot.notes}<p class="field-help">
						{item.exerciseSnapshot.notes}
					</p>{/if}<progress
					max={metrics.planned || 1}
					value={metrics.completed}
					aria-label="Planned workout completion"
				></progress>
				<div style="margin-top:23px">
					{#if !readonly && (unitIndex !== null || showExtra)}{#key `${item.id}:${showExtra ? 'extra' : 'planned'}`}<RecordForm
								{session}
								{item}
								unitIndex={showExtra ? null : unitIndex}
								{suggestion}
								onlog={log}
							/>{/key}{:else if !readonly}<div class="empty-state">
							<h3>That’s the planned work logged.</h3>
							<p>Move to the next exercise, or add an extra unit.</p>
						</div>{/if}
				</div>
				{#if !readonly}<div class="actions" style="margin-top:18px">
						{#if unitIndex !== null && !showExtra}<button
								class="button small"
								onclick={() => guard(skip)}
								>Skip {item.exerciseSnapshot.kind === 'strength' ? 'set' : 'unit'}</button
							>{/if}<button class="button small" onclick={() => (showExtra = !showExtra)}
							><Icon name={showExtra ? 'close' : 'plus'} size={16} />{showExtra
								? 'Cancel extra'
								: `Add ${item.exerciseSnapshot.kind === 'strength' ? 'set' : item.exerciseSnapshot.kind === 'isometric' ? 'round' : 'activity'} (extra)`}</button
						>
					</div>{/if}
			</div>
			<section class="card">
				<h3>Logged here.</h3>
				{#each session.records.filter((r) => r.sessionExerciseId === item.id && r.deletedAt == null) as r (r.id)}<div
						class="record-row"
					>
						<span class="record-index">{r.isExtra ? '+' : (r.plannedUnitIndex ?? 0) + 1}</span><span
							><strong>{recordLabel(r, item)}</strong>{#if r.isExtra}<span
									class="badge"
									style="margin-left:5px">Extra</span
								>{/if}{#if r.notes}<p class="field-help" style="margin:3px 0 0">
									{r.notes}
								</p>{/if}</span
						>{#if !readonly}{#if r.status !== 'skipped'}<button
									class="icon-button flat"
									aria-label="Edit set"
									onclick={() => (editing = clone(r))}><Icon name="edit" size={16} /></button
								>{/if}<button
								class="icon-button flat"
								aria-label="Delete set"
								onclick={() => guard(() => deleteRecord(r))}
								><Icon name="delete" size={16} /></button
							>{/if}
					</div>{/each}{#if !session.records.some((r) => r.sessionExerciseId === item.id && r.deletedAt == null)}<p
						class="muted"
					>
						Your next set starts the story.
					</p>{/if}<label style="margin-top:18px"
					>Exercise notes<textarea
						value={item.notes}
						maxlength="2000"
						disabled={readonly}
						onchange={(event) => {
							const value = event.currentTarget.value;
							void guard(() =>
								change((s) => {
									s.exercises[selected].notes = value;
								})
							);
						}}></textarea></label
				>{#if !readonly}<button
						class="button small"
						style="margin-top:16px"
						onclick={() =>
							guard(() =>
								change((s) => {
									s.exercises[selected].excludedFromStats =
										!s.exercises[selected].excludedFromStats;
								})
							)}
						>{item.excludedFromStats
							? 'Include this exercise in statistics'
							: 'Exclude this exercise in this session'}</button
					>{/if}{#if exclusionReasons(session, $app, item).some((r) => r
						.toLowerCase()
						.includes('excluded'))}<p class="field-help" style="margin:12px 0 0">
						{exclusionReasons(session, $app, item)
							.filter((r) => r.toLowerCase().includes('excluded'))
							.join(' · ')}
					</p>{/if}
			</section>
			<section class="card form-stack">
				<h3>The session notes.</h3>
				<label
					>How did training feel?<textarea maxlength="2000" bind:value={notes} disabled={readonly}
					></textarea></label
				>
				<div class="form-grid">
					<label
						>Workout date<input
							type="date"
							bind:value={date}
							max={dateInZone(Date.now(), $app.profile!.timeZone)}
							disabled={readonly}
						/></label
					>{#if session.entryMode === 'retrospective' || session.status !== 'in_progress'}<label
							>Duration (minutes)<input
								inputmode="decimal"
								placeholder="Unknown"
								bind:value={duration}
								disabled={readonly}
							/></label
						>{/if}
				</div>
				{#if !readonly}<button class="button" onclick={() => guard(saveDetails)}
						>Save notes and details</button
					>{/if}
				<p class="field-help">
					Recorded in {session.timeZoneAtStart}. Your calendar date stays the same when your
					timezone changes. {session.durationSeconds === null
						? 'Duration is not recorded.'
						: durationLabel(session.durationSeconds)}
				</p>
			</section>
			<div class="actions">
				{#if !readonly}{#if session.status === 'in_progress'}<button
							class="button lime"
							onclick={() => (finish = true)}><Icon name="check" /> Finish workout</button
						><button class="button" onclick={() => (abandon = true)}>Abandon workout</button
						>{:else}<button
							class="button"
							onclick={() =>
								guard(() =>
									change((s) => {
										s.excludedFromStats = !s.excludedFromStats;
									})
								)}
							>{session.excludedFromStats
								? 'Include in statistics'
								: 'Exclude this workout session'}</button
						><button class="button" onclick={() => (remove = true)}
							><Icon name="delete" />Delete from history</button
						>{/if}{/if}<a class="button" href="/calendar"><Icon name="calendar" /> Calendar</a>
			</div>
		</div>
		<aside class="exercise-sidebar">
			{#if session.status === 'in_progress' && session.entryMode === 'live'}<div
					class="desktop-rest"
				>
					<RestTimer
						timer={session.timerState}
						onchange={(action) => {
							if (!readonly) void guard(() => timer(action));
						}}
					/>
				</div>{/if}
			<div class="exercise-switcher">
				{#each session.exercises as ex, i (ex.id)}<button
						class:active={i === selected}
						onclick={() => {
							selected = i;
							showExtra = false;
						}}
						><span>{ex.exerciseSnapshot.name}<small>{plan(ex.targetSnapshot)}</small></span
						>{#if i === selected}<Icon name="arrow" size={15} />{/if}</button
					>{/each}
			</div>
			<p class="field-help">
				Your program is a snapshot of version {session.templateVersion}. Template edits won’t change
				it.
			</p>
		</aside>
	</div>
	<Dialog
		title="Edit logged result"
		bind:open={
			() => Boolean(editing),
			(v) => {
				if (!v) editing = null;
			}
		}
		>{#if editing}{#key editing.id}<RecordForm
					{session}
					{item}
					unitIndex={editing.plannedUnitIndex}
					record={editing}
					onlog={log}
					oncancel={() => (editing = null)}
				/>{/key}{/if}</Dialog
	>
	<Dialog bind:open={finish} title="Put this one in the books?"
		><p>{metrics.completed} of {metrics.planned} planned units completed. {metrics.extra} extra.</p>
		{#if metrics.completed < metrics.planned}<p class="notice">
				This is a partial workout. Unfinished units stay unperformed; no results will be filled in
				for you.
			</p>{/if}<button
			class="button lime full"
			disabled={busy}
			onclick={() => guard(() => end('completed'))}>{busy ? 'Saving…' : 'Finish workout'}</button
		></Dialog
	>
	<Dialog bind:open={abandon} title="Call it here?"
		><p>
			Your logged results stay in history. Abandoned workouts are excluded from statistics and the
			rest timer stops.
		</p>
		<button class="button yellow full" disabled={busy} onclick={() => guard(() => end('abandoned'))}
			>Abandon current workout</button
		></Dialog
	>
	<Dialog bind:open={remove} title="Delete this history entry?"
		><p>
			This hides the workout from your history, calendar, and statistics. A soft-deleted copy
			remains in your private storage.
		</p>
		<button
			class="button pink full"
			onclick={() =>
				guard(async () => {
					await change((s) => {
						s.deletedAt = Date.now();
						s.timerState = null;
					});
					remove = false;
					await goto('/history');
				})}>Confirm delete</button
		></Dialog
	>
	{#if undoRecord}<div class="toast" role="status">
			Record deleted<button class="flat" onclick={() => guard(undo)}>Undo</button><button
				class="flat"
				aria-label="Dismiss undo"
				onclick={() => (undoRecord = null)}><Icon name="close" size={15} /></button
			>
		</div>{/if}
{/if}
