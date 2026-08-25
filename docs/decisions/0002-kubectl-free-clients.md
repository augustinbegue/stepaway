# 0002. The clients are kubectl-free and the backend owns the lifecycle

- Date: 2026-08-24
- Status: accepted

## Decision

The CLI is a pure HTTP client of the backend. It holds one URL and one bearer
token. It contains no kubectl call and it assumes no kubeconfig.

The backend owns the lifecycle of a session from end to end: create, restore,
launch, stream, archive and destroy. It talks to the API server through its
own ServiceAccount, over the REST API and the WebSocket exec subprotocol.

## Context

The first version drove the cluster from the laptop with kubectl. That design
requires cluster credentials on every laptop and it blocks a future web
interface, because a browser has no kubectl.

## Consequences

- A user needs no cluster access. Only the person who installs the chart uses
  kubectl.
- The `/v1` surface is the single contract. The future web interface is the
  second consumer of it, and the CLI is only the first.
- The backend is a required component. There is no direct path any more.
- The laptop keeps everything that touches the laptop: capture, consent, the
  env picker and the docker quiesce.
- The CLI does not manage a port-forward. A user without an Ingress runs
  `kubectl port-forward` and points `--server` at localhost.
