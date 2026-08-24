# Agent Kernel

The execution kernel provides a typed task contract, capability policy evaluation, DAG validation, bounded parallel scheduling, event emission, and deterministic execution reports.

## Guarantees

- Duplicate and missing graph dependencies are rejected.
- Cyclic graphs are rejected before execution.
- Independent steps run in the same scheduling batch.
- A step cannot request a capability absent from the task contract.
- Runtime, step, and tool-call budgets are enforced.
- Every task and step transition emits a timestamped event.
- Failed steps stop downstream execution and produce a structured report.

## Build and test

From this directory:

```bash
npx tsc -p tsconfig.json
npm test
```
