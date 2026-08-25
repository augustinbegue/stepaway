# Architecture decision records

Each record holds one decision. The format is short: Context, Decision,
Consequences.

The date of a record is the date of the decision, not the date of the text.

| id | title | date | status |
|---|---|---|---|
| [0001](./0001-one-pod-one-session.md) | One pod is one session, and the PVC is the durable half | 2026-08-23 | accepted |
| [0002](./0002-kubectl-free-clients.md) | The clients are kubectl-free and the backend owns the lifecycle | 2026-08-24 | accepted |
| [0003](./0003-state-in-annotations.md) | The state lives in Kubernetes annotations | 2026-08-24 | accepted |
| [0004](./0004-devcontainer-as-env-spec.md) | devcontainer.json is the canonical environment specification | 2026-08-25 | accepted |
| [0005](./0005-in-cluster-registry-subchart.md) | The registry is an opt-in subchart | 2026-08-25 | accepted |
| [0006](./0006-always-unattended-runs.md) | Runs are always unattended | 2026-08-23 | accepted |
| [0007](./0007-docker-carry-volumes.md) | The docker carry moves volumes, not images | 2026-08-23 | accepted |
| [0008](./0008-agpl-open-core.md) | AGPL open core, and where the boundary is | 2026-08-24 | accepted |

## How to add a record

1. Copy the structure of an existing record.
2. Give it the next free number and a short slug.
3. Write the three sections in Simplified Technical English.
4. Add one row to the table above.

Do not edit an accepted record to reverse it. Write a new record and mark the
old one as superseded.
