import type { ExecutionEvent, ExecutionReport, StepDefinition, StepId, StepResult, TaskContract } from './contracts.js';
import { validateGraph, readySteps } from './graph.js';
import { evaluateStep } from './policy.js';
import { normalizeRetryPolicy, runWithRetry } from './retry.js';
import type { SnapshotStore } from './snapshot.js';
import { validateTaskContract } from './validation.js';

export interface ExecutorOptions {
  onEvent?: (event: ExecutionEvent) => void;
  signal?: AbortSignal;
  snapshot?: { completed: ReadonlyMap<StepId, StepResult>; events: readonly ExecutionEvent[] };
  snapshotStore?: SnapshotStore;
}

export async function executeTask(task: TaskContract, steps: readonly StepDefinition[], options: ExecutorOptions = {}): Promise<ExecutionReport> {
  validateTaskContract(task);
  validateGraph(steps);
  if (steps.length > task.budget.maxSteps) throw new Error('step graph exceeds maxSteps budget');
  const events: ExecutionEvent[] = [...(options.snapshot?.events ?? [])];
  const completed = new Map<StepId, StepResult>(options.snapshot?.completed ?? []);
  const running = new Set<StepId>();
  const started = Date.now();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  const emit = (event: ExecutionEvent) => { events.push(event); options.onEvent?.(event); };
  const persist = async (status: ExecutionReport['status']): Promise<void> => {
    if (!options.snapshotStore) return;
    try {
      await options.snapshotStore.save({ taskId: task.id, status, completed, events });
    } catch {
      // Persistence must not change the task result.
    }
  };
  if (completed.size === 0) emit({ type: 'task_started', taskId: task.id, status: 'running', timestamp: new Date().toISOString() });
  let toolCalls = 0;
  try {
    while (completed.size < steps.length) {
      if (controller.signal.aborted) return finish('cancelled', 'execution cancelled');
      if (Date.now() - started > task.budget.maxRuntimeMs) {
        controller.abort();
        return finish('failed', 'task runtime budget exceeded');
      }
      const ready = readySteps(steps, new Set(completed.keys()), running).slice(0, task.budget.maxConcurrentSteps);
      if (ready.length === 0) {
        if (running.size > 0) { await Promise.resolve(); continue; }
        return finish('failed', 'execution graph is blocked');
      }
      const remainingCalls = task.budget.maxToolCalls - toolCalls;
      if (remainingCalls < 1) return finish('failed', 'tool-call budget exceeded');
      const batch = ready.slice(0, remainingCalls);
      batch.forEach((step) => running.add(step.id));
      toolCalls += batch.length;
      const results = await Promise.all(batch.map(async (step) => {
        const decision = evaluateStep(task, step);
        emit({ type: 'step_started', taskId: task.id, stepId: step.id, status: 'running', timestamp: new Date().toISOString(), attempt: 1 });
        if (!decision.allowed) return [step, { status: 'failed', error: decision.reason, attempts: 1 }] as const;
        const result = await runWithRetry(
          () => step.run({ task, step, completed, signal: controller.signal }),
          normalizeRetryPolicy(step.retry ?? task.retry),
          controller.signal,
          (attempt, error) => emit({ type: 'step_retrying', taskId: task.id, stepId: step.id, status: 'running', timestamp: new Date().toISOString(), attempt, detail: error }),
        );
        return [step, result] as const;
      }));
      for (const [step, result] of results) {
        running.delete(step.id);
        completed.set(step.id, result);
        emit({ type: 'step_finished', taskId: task.id, stepId: step.id, status: result.status, timestamp: new Date().toISOString(), detail: result.error, attempt: result.attempts });
        await persist('running');
        if (result.status === 'failed') return finish('failed', result.error);
      }
    }
    return await finish('succeeded');
  } finally {
    options.signal?.removeEventListener('abort', cancel);
  }

  async function finish(status: 'succeeded' | 'failed' | 'cancelled', detail?: string): Promise<ExecutionReport> {
    emit({ type: 'task_finished', taskId: task.id, status, timestamp: new Date().toISOString(), detail });
    await persist(status);
    return { taskId: task.id, status, completed, events };
  }
}
