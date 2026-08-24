# Agent Kernel

This package is an executable foundation for controlled agent workflows. It provides typed task contracts, contract validation, capability policy evaluation, DAG validation, bounded parallel scheduling, event emission, and deterministic execution reports.

## Build and test

From the repository root:

```bash
npm --prefix packages/agent-kernel test
```

The test command first compiles the TypeScript sources into `dist/`, then runs the Node test suite against the compiled modules. Invalid contracts, cyclic graphs, missing capabilities, dependency ordering, concurrent independent steps, and budget validation are covered by tests.
