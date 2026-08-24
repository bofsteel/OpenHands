import test from 'node:test';
import assert from 'node:assert/strict';
import { executeTask } from '../dist/executor.js';
import { validateGraph } from '../dist/graph.js';
import { validateTaskContract } from '../dist/validation.js';

test('rejects cyclic execution graphs', () => {
  assert.throws(() => validateGraph([
    { id: 'a', title: 'A', dependsOn: ['b'], capabilities: [], run: async () => ({ status: 'succeeded' }) },
    { id: 'b', title: 'B', dependsOn: ['a'], capabilities: [], run: async () => ({ status: 'succeeded' }) },
  ]), /cycle detected/);
});

test('executes independent steps concurrently and dependent steps afterwards', async () => {
  const order = [];
  const task = { id: 't', objective: 'test', allowedCapabilities: new Set(), budget: { maxSteps: 4, maxRuntimeMs: 1000, maxToolCalls: 4, maxConcurrentSteps: 2 } };
  const steps = [
    { id: 'a', title: 'A', dependsOn: [], capabilities: [], run: async () => { order.push('a:start'); await new Promise((r) => setTimeout(r, 10)); order.push('a:end'); return { status: 'succeeded', output: 1 }; } },
    { id: 'b', title: 'B', dependsOn: [], capabilities: [], run: async () => { order.push('b:start'); await new Promise((r) => setTimeout(r, 10)); order.push('b:end'); return { status: 'succeeded', output: 2 }; } },
    { id: 'c', title: 'C', dependsOn: ['a', 'b'], capabilities: [], run: async () => { order.push('c'); return { status: 'succeeded', output: 3 }; } },
  ];
  const report = await executeTask(task, steps);
  assert.equal(report.status, 'succeeded');
  assert.ok(order.indexOf('c') > order.indexOf('a:end'));
  assert.ok(order.indexOf('c') > order.indexOf('b:end'));
});

test('retries a failed step and records the successful attempt', async () => {
  let attempts = 0;
  const task = { id: 'retry', objective: 'retry', allowedCapabilities: new Set(), retry: { maxAttempts: 3, backoffMs: 0 }, budget: { maxSteps: 1, maxRuntimeMs: 1000, maxToolCalls: 3, maxConcurrentSteps: 1 } };
  const report = await executeTask(task, [{ id: 'unstable', title: 'Unstable', dependsOn: [], capabilities: [], run: async () => { attempts += 1; return attempts < 3 ? { status: 'failed', error: 'transient' } : { status: 'succeeded', output: 'ok' }; } }]);
  assert.equal(report.status, 'succeeded');
  assert.equal(attempts, 3);
  assert.equal(report.completed.get('unstable').attempts, 3);
  assert.equal(report.events.filter((event) => event.type === 'step_retrying').length, 2);
});

test('passes task context to every retry attempt', async () => {
  const task = { id: 'context', objective: 'context', allowedCapabilities: new Set(), retry: { maxAttempts: 2, backoffMs: 0 }, budget: { maxSteps: 1, maxRuntimeMs: 1000, maxToolCalls: 2, maxConcurrentSteps: 1 } };
  const seen = [];
  const report = await executeTask(task, [{ id: 'context-step', title: 'Context', dependsOn: [], capabilities: [], run: async (context) => { seen.push(context); return seen.length === 1 ? { status: 'failed', error: 'retry' } : { status: 'succeeded' }; } }]);
  assert.equal(report.status, 'succeeded');
  assert.equal(seen.length, 2);
  assert.equal(seen[0].task.id, 'context');
  assert.equal(seen[0].step.id, 'context-step');
  assert.ok(seen[0].signal);
});

test('cancels before starting work', async () => {
  const controller = new AbortController();
  controller.abort();
  const task = { id: 'cancel', objective: 'cancel', allowedCapabilities: new Set(), budget: { maxSteps: 1, maxRuntimeMs: 1000, maxToolCalls: 1, maxConcurrentSteps: 1 } };
  const report = await executeTask(task, [{ id: 'never', title: 'Never', dependsOn: [], capabilities: [], run: async () => ({ status: 'succeeded' }) }], { signal: controller.signal });
  assert.equal(report.status, 'cancelled');
});

test('denies a step when capability is absent', async () => {
  const task = { id: 't', objective: 'test', allowedCapabilities: new Set(), budget: { maxSteps: 1, maxRuntimeMs: 1000, maxToolCalls: 1, maxConcurrentSteps: 1 } };
  const report = await executeTask(task, [{ id: 'secret', title: 'Secret', dependsOn: [], capabilities: ['secret.read'], run: async () => ({ status: 'succeeded' }) }]);
  assert.equal(report.status, 'failed');
  assert.match(report.completed.get('secret').error, /missing capabilities/);
});

test('rejects invalid task budgets', () => {
  assert.throws(() => validateTaskContract({ id: 't', objective: 'x', allowedCapabilities: new Set(), budget: { maxSteps: 0, maxRuntimeMs: 1000, maxToolCalls: 1, maxConcurrentSteps: 1 } }), /maxSteps/);
  assert.throws(() => validateTaskContract({ id: 't', objective: 'x', allowedCapabilities: new Set(), budget: { maxSteps: 1, maxRuntimeMs: 0, maxToolCalls: 1, maxConcurrentSteps: 1 } }), /maxRuntimeMs/);
  assert.throws(() => validateTaskContract({ id: 't', objective: 'x', allowedCapabilities: new Set(), budget: { maxSteps: 1, maxRuntimeMs: 1000, maxToolCalls: 1, maxConcurrentSteps: 0 } }), /maxConcurrentSteps/);
});
