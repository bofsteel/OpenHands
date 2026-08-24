export type TaskId = string;
export type StepId = string;

export type TaskStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type StepStatus = TaskStatus | 'blocked';

export interface TaskBudget {
  maxSteps: number;
  maxRuntimeMs: number;
  maxToolCalls: number;
}

export interface TaskContract {
  id: TaskId;
  objective: string;
  allowedCapabilities: ReadonlySet<string>;
  budget: TaskBudget;
}

export interface StepDefinition {
  id: StepId;
  title: string;
  dependsOn: readonly StepId[];
  capabilities: readonly string[];
  run: (context: StepContext) => Promise<StepResult>;
}

export interface StepContext {
  task: TaskContract;
  step: StepDefinition;
  completed: ReadonlyMap<StepId, StepResult>;
  signal: AbortSignal;
}

export interface StepResult {
  status: 'succeeded' | 'failed';
  output?: unknown;
  error?: string;
}

export interface ExecutionEvent {
  type: 'task_started' | 'step_started' | 'step_finished' | 'task_finished';
  taskId: TaskId;
  stepId?: StepId;
  status?: TaskStatus | StepStatus;
  timestamp: string;
  detail?: string;
}

export interface ExecutionReport {
  taskId: TaskId;
  status: TaskStatus;
  completed: ReadonlyMap<StepId, StepResult>;
  events: readonly ExecutionEvent[];
}
