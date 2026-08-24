import type { ExecutionEvent, ExecutionReport, StepDefinition, StepId, StepResult, TaskContract } from './contracts.js';
import { validateGraph, readySteps } from './graph.js';
import { evaluateStep } from './policy.js';
import { validateTaskContract } from './validation.js';

export interface ExecutorOptions {
  onEvent?: (event: ExecutionEvent) => void;
}

export async function executeTask(task: TaskContract, steps: readonly StepDefinition[], options: ExecutorOptions = {}): Promise<ExecutionReport> {
  validateTaskContract(task);
  validateGraph(steps);
  if (steps.length > task.budget.maxSteps) throw new Error('step graph exceeds maxSteps budget');
  const events: ExecutionEvent[] = [];
  const completed = new Map<StepId, StepResult>();
  const running = new Set<StepId>();
  const started = Date.now();
  const controller = new AbortController();
  const emit = (event: ExecutionEvent) => { events.push(event); options.onEvent?.(event); };
  emit({ type: 'task_started', taskId: task.id, status: 'running', timestamp: new Date().toISOString() });
  let toolCalls = 0;
  while (completed.size < steps.length) {
    if (Date.now() - started > task.budget.maxRuntimeMs) {
      controller.abort();
      return finish('failed', 'task runtime budget exceeded');
    }
    const ready = readySteps(steps, new Set(completed.keys()), running);
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
      emit({ type: 'step_started', taskId: task.id, stepId: step.id, status: 'running', timestamp: new Date().toISOString() });
      if (!decision.allowed) return [step, { status: 'failed', error: decision.reason }] as const;
      try {
        const result = await step.run({ task, step, completed, signal: controller.signal });
        return [step, result] as const;
      } catch (error) {
        return [step, { status: 'failed', error: error instanceof Error ? error.message : String(error) }] as const;
      }
    }));
    for (const [step, result] of results) {
      running.delete(step.id);
      completed.set(step.id, result);
      emit({ type: 'step_finished', taskId: task.id, stepId: step.id, status: result.status, timestamp: new Date().toISOString(), detail: result.error });
      if (result.status === 'failed') return finish('failed', result.error);
    }
  }
  return finish('succeeded');

  function finish(status: 'succeeded' | 'failed', detail?: string): ExecutionReport {
    emit({ type: 'task_finished', taskId: task.id, status, timestamp: new Date().toISOString(), detail });
    return { taskId: task.id, status, completed, events };
  }
}
