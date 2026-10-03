export type Kind = 'strength' | 'isometric' | 'duration';
export type LoadMode = 'external' | 'bodyweight' | 'none';
export type Convention =
	'total' | 'per_dumbbell' | 'machine_stack' | 'as_logged' | 'bodyweight_adjustment' | 'none';
export interface StrengthTarget {
	sets: number;
	repsMin: number;
	repsMax: number;
}
export interface IsometricTarget {
	rounds: number;
	directions: string[];
	holdSecondsMin: number;
	holdSecondsMax: number;
}
export interface DurationTarget {
	durationSeconds: number;
}
export type Target = StrengthTarget | IsometricTarget | DurationTarget;
export interface ExerciseDefinition {
	key: string;
	name: string;
	kind: Kind;
	loadMode: LoadMode;
	weightConvention: Convention;
	notes?: string;
}
export interface ImportItem {
	itemKey: string;
	exerciseKey: string;
	target: Target;
	restSeconds: number;
	defaultWeightKg?: number;
	notes?: string;
}
export interface ImportWorkout {
	key: string;
	name: string;
	notes?: string;
	items: ImportItem[];
}
export interface Bundle {
	schemaVersion: 1;
	units: 'kg';
	exercises: ExerciseDefinition[];
	workouts: ImportWorkout[];
}
export interface Exclusion {
	excludedFromStats: boolean;
	exclusionReason?: string;
}
export interface Exercise extends ExerciseDefinition, Exclusion {
	id: string;
	archivedAt: number | null;
}
export interface WorkoutItem {
	itemId: string;
	exerciseId: string;
	target: Target;
	restSeconds: number;
	defaultWeightKg?: number;
	notes?: string;
}
export interface Workout extends Exclusion {
	id: string;
	key: string;
	name: string;
	notes: string;
	version: number;
	items: WorkoutItem[];
	archivedAt: number | null;
}
export interface Profile {
	displayName: string;
	email: string;
	timeZone: string;
	units: 'kg';
	seedVersion: number;
	activeSessionId: string | null;
	settings: { weightStep: number };
}
export interface SessionExercise extends Exclusion {
	id: string;
	itemId: string;
	exerciseId: string;
	order: number;
	exerciseSnapshot: ExerciseDefinition;
	targetSnapshot: Target;
	restSeconds: number;
	defaultWeightKg?: number;
	notes: string;
}
export interface RestState {
	startedAt: number;
	deadlineAt: number;
	durationSeconds: number;
	recordId: string;
	nextAction: string;
}
export interface SessionRecord {
	id: string;
	sessionExerciseId: string;
	sessionExerciseOrder: number;
	kind: Kind;
	plannedUnitIndex: number | null;
	isExtra: boolean;
	status: 'logged' | 'failed' | 'skipped';
	reps?: number;
	lastRepFailed?: boolean;
	weightKg?: number;
	holds?: Record<string, number>;
	durationSeconds?: number;
	distanceKm?: number;
	notes?: string;
	loggedAtClient: number;
	revision: number;
	operationId: string;
	deletedAt: number | null;
}
export interface Session extends Exclusion {
	id: string;
	templateId: string;
	templateVersion: number;
	nameSnapshot: string;
	workoutDate: string;
	timeZoneAtStart: string;
	status: 'in_progress' | 'completed' | 'abandoned';
	entryMode: 'live' | 'retrospective';
	startedAt: number;
	finishedAt: number | null;
	durationSeconds: number | null;
	notes: string;
	timerState: RestState | null;
	revision: number;
	deletedAt: number | null;
	editorId: string;
	lastOperationId: string;
	exercises: SessionExercise[];
	records: SessionRecord[];
}
export type SyncStatus = 'Saved locally' | 'Syncing' | 'Synced' | 'Sync failed' | 'Conflict';
export interface Draft {
	recoveredFrom?: string;
	session: Session;
	baseRevision: number;
	dirtyRecordIds: string[];
	pending: boolean;
	operationId: string;
	status: SyncStatus;
	error?: string;
}
