# 0003. The state lives in Kubernetes annotations

- Date: 2026-08-24
- Status: accepted

## Context

The backend needs a state per session: `building`, `pending`, `restoring`,
`ready`, `running`, `done` or `failed`. A database adds an operational
component and a second source of truth. Memory alone does not survive a
restart of the backend.

## Decision

The state lives in the annotations of the Kubernetes object of the session,
under the prefix `stepaway.dev/`.

- Before the pod exists, in state `building`, the annotations live on the PVC.
- After the pod exists, the annotations live on the pod, which is then
  authoritative.
- The backend writes every state. No client writes a state.
- Two edges are derived lazily by a probe on read and then persisted: the edge
  from `pending` to `ready`, and the edge from `running` to `done` or
  `failed`.

## Consequences

- The backend is stateless. A restart re-derives every session from the
  cluster.
- `kubectl describe` shows the truth of a session, which helps an operator.
- The size of an annotation limits what the state may hold. The `detail` field
  is a short line and it is truncated.
- A write is an API call, so the backend must not write a state in a hot loop.
- Two objects hold a state for a short moment after the pod starts. The reader
  prefers the pod.
