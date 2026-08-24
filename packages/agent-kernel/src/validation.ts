import type { TaskContract } from './contracts.js';

export function validateTaskContract(task: TaskContract): void {
  if (!task.id.trim()) throw new Error('task id must not be empty');
  if (!task.objective.trim()) throw new Error('task objective must not be empty');
  const { maxSteps, maxRuntimeMs, maxToolCalls } = task.budget;
  if (!Number.isInteger(maxSteps) || maxSteps < 1) throw new Error('maxSteps must be a positive integer');
  if (!Number.isInteger(maxRuntimeMs) || maxRuntimeMs < 1) throw new Error('maxRuntimeMs must be a positive integer');
  if (!Number.isInteger(maxToolCalls) || maxToolCalls < 1) throw new Error('maxToolCalls must be a positive integer');
}
