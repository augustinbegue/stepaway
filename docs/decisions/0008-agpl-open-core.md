# 0008. AGPL open core, and where the boundary is

- Date: 2026-08-24
- Status: accepted

## Context

Stepaway needs one control plane, not two. A closed control plane with an open
client splits the contract and it makes self-hosted use a second-class path.

## Decision

The whole control plane is in this public repository under AGPL-3.0:

- `cli/`, the client,
- `server/`, the backend and the `/v1` contract,
- `packages/core`, the shared logic,
- `charts/stepaway`, the Helm chart,
- `feature/` and `builder/`, the environment build path.

The `/v1` surface in `packages/core/src/api.ts` is the technical boundary. A
hosted product is a deployment of this same backend behind an identity layer.
The bearer token is the seam where such a layer attaches.

This record covers the technical scope only.

## Consequences

- A self-hosted install has the full feature set of the control plane.
- Any change to the API contract is a public change and it needs a version
  answer from `/v1/version`.
- Multi-user identity is not in this contract. The bearer token authenticates
  one installation, not a person.
- The feature and the builder are usable outside stepaway, which keeps them
  honest as standalone artifacts.
