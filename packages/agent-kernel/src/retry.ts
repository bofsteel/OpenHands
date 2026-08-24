import type { RetryPolicy, StepResult } from './contracts.js';

export function normalizeRetryPolicy(policy: RetryPolicy | undefined): RetryPolicy {
  const normalized = policy ?? { maxAttempts: 1, backoffMs: 0 };
  if (!Number.isInteger(normalized.maxAttempts) || normalized.maxAttempts < 1) throw new Error('maxAttempts must be a positive integer');
  if (!Number.isInteger(normalized.backoffMs) || normalized.backoffMs < 0) throw new Error('backoffMs must be a non-negative integer');
  return normalized;
}

export async function runWithRetry(run: (attempt: number) => Promise<StepResult>, policy: RetryPolicy, signal: AbortSignal, onRetry: (attempt: number, error?: string) => void): Promise<StepResult> {
  let last: StepResult = { status: 'failed', error: 'no attempt' };
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    if (signal.aborted) return { status: 'failed', error: 'execution cancelled', attempts: attempt - 1 };
    last = await run(attempt);
    if (last.status === 'succeeded') return { ...last, attempts: attempt };
    if (attempt < policy.maxAttempts) {
      onRetry(attempt + 1, last.error);
      if (policy.backoffMs > 0) await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, policy.backoffMs);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('execution cancelled')); }, { once: true });
      });
    }
  }
  return { ...last, attempts: policy.maxAttempts };
}
