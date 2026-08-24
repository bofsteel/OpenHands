import type { StepDefinition, TaskContract } from './contracts.js';

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
}

export function evaluateStep(task: TaskContract, step: StepDefinition): PolicyDecision {
  const missing = step.capabilities.filter((capability) => !task.allowedCapabilities.has(capability));
  if (missing.length > 0) {
    return { allowed: false, reason: `missing capabilities: ${missing.join(', ')}` };
  }
  return { allowed: true };
}
