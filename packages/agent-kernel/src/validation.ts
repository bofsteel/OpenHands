import type { TaskContract } from './contracts.js';

export function validateTaskContract(task: TaskContract): void {
  if (!task.id.trim()) throw new Error('task id must not be empty');
  if (!task.objective.trim()) throw new Error('task objective must not be empty');
  const { maxSteps, maxRuntimeMs, maxToolCalls, maxConcurrentSteps } = task.budget;
  if (!Number.isInteger(maxSteps) || maxSteps < 1) throw new Error('maxSteps must be a positive integer');
  if (!Number.isInteger(maxRuntimeMs) || maxRuntimeMs < 1) throw new Error('maxRuntimeMs must be a positive integer');
  if (!Number.isInteger(maxToolCalls) || maxToolCalls < 1) throw new Error('maxToolCalls must be a positive integer');
  if (!Number.isInteger(maxConcurrentSteps) || maxConcurrentSteps < 1) throw new Error('maxConcurrentSteps must be a positive integer');
  if (task.retry) {
    if (!Number.isInteger(task.retry.maxAttempts) || task.retry.maxAttempts < 1) throw new Error('maxAttempts must be a positive integer');
    if (!Number.isInteger(task.retry.backoffMs) || task.retry.backoffMs < 0) throw new Error('backoffMs must be a non-negative integer');
  }
}
