import type { StepDefinition, StepId } from './contracts.js';

export function validateGraph(steps: readonly StepDefinition[]): void {
  const ids = new Set<StepId>();
  for (const step of steps) {
    if (ids.has(step.id)) throw new Error(`duplicate step id: ${step.id}`);
    ids.add(step.id);
  }
  for (const step of steps) {
    for (const dependency of step.dependsOn) {
      if (!ids.has(dependency)) throw new Error(`unknown dependency: ${dependency}`);
    }
  }
  const visiting = new Set<StepId>();
  const visited = new Set<StepId>();
  const visit = (id: StepId): void => {
    if (visiting.has(id)) throw new Error(`cycle detected at step: ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    const step = steps.find((candidate) => candidate.id === id);
    if (!step) throw new Error(`unknown step: ${id}`);
    step.dependsOn.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  steps.forEach((step) => visit(step.id));
}

export function readySteps(steps: readonly StepDefinition[], completed: ReadonlySet<StepId>, running: ReadonlySet<StepId>): StepDefinition[] {
  return steps.filter((step) => !completed.has(step.id) && !running.has(step.id) && step.dependsOn.every((dependency) => completed.has(dependency)));
}
