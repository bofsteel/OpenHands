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
  const task = { id: 't', objective: 'test', allowedCapabilities: new Set(), budget: { maxSteps: 4, maxRuntimeMs: 1000, maxToolCalls: 4 } };
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

test('denies a step when capability is absent', async () => {
  const task = { id: 't', objective: 'test', allowedCapabilities: new Set(), budget: { maxSteps: 1, maxRuntimeMs: 1000, maxToolCalls: 1 } };
  const report = await executeTask(task, [{ id: 'secret', title: 'Secret', dependsOn: [], capabilities: ['secret.read'], run: async () => ({ status: 'succeeded' }) }]);
  assert.equal(report.status, 'failed');
  assert.match(report.completed.get('secret').error, /missing capabilities/);
});

test('rejects invalid task budgets', () => {
  assert.throws(() => validateTaskContract({ id: 't', objective: 'x', allowedCapabilities: new Set(), budget: { maxSteps: 0, maxRuntimeMs: 1000, maxToolCalls: 1 } }), /maxSteps/);
  assert.throws(() => validateTaskContract({ id: 't', objective: 'x', allowedCapabilities: new Set(), budget: { maxSteps: 1, maxRuntimeMs: 0, maxToolCalls: 1 } }), /maxRuntimeMs/);
});
