# ADR 0001: EventBus as in-memory singleton (single-container deploy)

- **Status**: Accepted
- **Date**: 2026-05-11

## Context

`src/lib/events.ts` is an in-process `EventBus` that holds a `Set<Listener>`
and broadcasts events from API route handlers to connected SSE clients via
`/api/events`. The singleton is persisted on `globalThis` so it survives
across route invocations in the same Node process.

The current production deploy is **Sirvici**, a self-hosted single
Docker container running one Next.js process behind nginx (see
`docker-compose.yml`, `.github/workflows/deploy-sirvici.yml`). All mutations
and all SSE connections share the same `EventBus` instance.

## Decision

Stay with the in-memory singleton for now. Document the assumption.

If/when we migrate to a multi-instance deploy (Vercel serverless, multiple
containers behind a load balancer, etc.), the `EventBus` will silently drop
events across instances. This ADR is the canonical place to look up that
constraint, and `events.ts` carries a comment pointing here.

## Consequences

- **Pros**: zero ops, zero infra. Listeners cost a few bytes each.
- **Cons**:
  - Not horizontally scalable. A migration to Vercel/multi-instance breaks
    real-time delivery without making any code change visible at the
    boundary — symptoms would be "some users miss some events".
  - Listener cleanup depends on `controller.enqueue()` failing for cleanup
    to run. A stuck connection that never errors out leaks a listener. Low
    risk at our scale (single-digit concurrent operators).

## Migration path (if needed)

When/if multi-instance is on the roadmap, replace the in-memory bus with:

1. A pub/sub-based bus (Redis pub/sub, Pusher, Ably, NATS) — emit on mutation,
   subscribe on the SSE handler. Smallest change to the abstraction.
2. Or, push real-time deltas through a database CDC (Turso change feed)
   instead of an explicit bus.

Either way, the `EventBus.subscribe/emit` interface stays the same; the
implementation switches.

## Tests / verification

The current bus has no integration test for cross-instance delivery because
there is only one instance. If the migration path is taken, add a test that
spins up two app processes and asserts an event emitted in process A reaches
a subscriber in process B.
