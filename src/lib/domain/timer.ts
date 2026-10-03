import type { RestState } from './types';
export function startRest(
	seconds: number,
	recordId: string,
	nextAction: string,
	now = Date.now()
): RestState | null {
	return seconds > 0
		? {
				startedAt: now,
				deadlineAt: now + seconds * 1000,
				durationSeconds: seconds,
				recordId,
				nextAction
			}
		: null;
}
export function remaining(timer: RestState | null, now = Date.now()): number {
	return timer ? Math.max(0, Math.ceil((timer.deadlineAt - now) / 1000)) : 0;
}
export function extendRest(timer: RestState, now = Date.now()): RestState {
	return {
		...timer,
		deadlineAt: Math.max(now, timer.deadlineAt) + 30000,
		durationSeconds: timer.durationSeconds + 30
	};
}
