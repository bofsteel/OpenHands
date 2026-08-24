import type { ExecutionEvent, ExecutionSnapshot, StepId, StepResult } from './contracts.js';

export const SNAPSHOT_VERSION = 1 as const;

type StoredSnapshot = {
  version: typeof SNAPSHOT_VERSION;
  taskId: string;
  status: ExecutionSnapshot['status'];
  completed: Array<[StepId, StepResult]>;
  events: ExecutionEvent[];
};

export interface SnapshotStore {
  save(snapshot: ExecutionSnapshot): Promise<void>;
  load(taskId: string): Promise<ExecutionSnapshot | undefined>;
  delete(taskId: string): Promise<boolean>;
  list(): Promise<string[]>;
}

export function serializeSnapshot(snapshot: ExecutionSnapshot): string {
  validateSnapshot(snapshot);
  const stored: StoredSnapshot = {
    version: SNAPSHOT_VERSION,
    taskId: snapshot.taskId,
    status: snapshot.status,
    completed: [...snapshot.completed.entries()],
    events: [...snapshot.events],
  };
  return JSON.stringify(stored);
}

export function deserializeSnapshot(serialized: string, expectedTaskId?: string): ExecutionSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error('snapshot is not valid JSON');
  }
  if (!isRecord(value) || value.version !== SNAPSHOT_VERSION) throw new Error('unsupported snapshot version');
  if (typeof value.taskId !== 'string' || !value.taskId.trim()) throw new Error('snapshot taskId must be a non-empty string');
  if (expectedTaskId !== undefined && value.taskId !== expectedTaskId) throw new Error('snapshot taskId does not match requested task');
  if (!isTaskStatus(value.status)) throw new Error('snapshot status is invalid');
  if (!Array.isArray(value.completed) || !value.completed.every(isCompletedEntry)) throw new Error('snapshot completed entries are invalid');
  if (!Array.isArray(value.events) || !value.events.every(isEvent)) throw new Error('snapshot events are invalid');
  return { taskId: value.taskId, status: value.status, completed: new Map(value.completed), events: value.events };
}

export class InMemorySnapshotStore implements SnapshotStore {
  private readonly values = new Map<string, string>();

  async save(snapshot: ExecutionSnapshot): Promise<void> {
    this.values.set(snapshot.taskId, serializeSnapshot(snapshot));
  }

  async load(taskId: string): Promise<ExecutionSnapshot | undefined> {
    const value = this.values.get(taskId);
    return value === undefined ? undefined : deserializeSnapshot(value, taskId);
  }

  async delete(taskId: string): Promise<boolean> {
    return this.values.delete(taskId);
  }

  async list(): Promise<string[]> {
    return [...this.values.keys()].sort();
  }
}

function validateSnapshot(snapshot: ExecutionSnapshot): void {
  if (!snapshot.taskId.trim()) throw new Error('snapshot taskId must be a non-empty string');
  if (!isTaskStatus(snapshot.status)) throw new Error('snapshot status is invalid');
  for (const [stepId, result] of snapshot.completed) {
    if (!stepId.trim() || !isStepResult(result)) throw new Error('snapshot completed entry is invalid');
  }
  if (!snapshot.events.every(isEvent)) throw new Error('snapshot event is invalid');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTaskStatus(value: unknown): value is ExecutionSnapshot['status'] {
  return value === 'pending' || value === 'running' || value === 'succeeded' || value === 'failed' || value === 'cancelled';
}

function isStepResult(value: unknown): value is StepResult {
  return isRecord(value) && (value.status === 'succeeded' || value.status === 'failed') && (value.error === undefined || typeof value.error === 'string') && (value.attempts === undefined || Number.isInteger(value.attempts));
}

function isCompletedEntry(value: unknown): value is [StepId, StepResult] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && isStepResult(value[1]);
}

function isEvent(value: unknown): value is ExecutionEvent {
  return isRecord(value) && typeof value.type === 'string' && typeof value.taskId === 'string' && typeof value.timestamp === 'string' && (value.stepId === undefined || typeof value.stepId === 'string') && (value.detail === undefined || typeof value.detail === 'string') && (value.attempt === undefined || Number.isInteger(value.attempt));
}
