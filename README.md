# stepaway

Close your laptop. Your agent keeps working.

Stepaway moves a **live Claude Code session** — repo, uncommitted work, session
transcript, env files, database volumes, project config — from your laptop to a
runner pod on your own Kubernetes cluster, and back. The agent picks up
mid-task with everything it had: the dirty refactor, the seeded database, the
resolved secrets, the full conversation.

Website: [stepaway.dev](https://stepaway.dev)

## How it works

```
laptop                          your cluster
──────                          ────────────
stepaway push  ──── HTTPS ───►  stepaway backend (this repo, server/)
  capture: git bundle,            creates 1 pod + PVC per session,
  dirty files, transcript,        restores everything, starts the
  env files, docker volumes       agent unattended in tmux

stepaway peek -f  ◄── SSE ────  live transcript
stepaway pull     ◄── tar ────  code + transcript home; pod deleted
```

- **1 pod = 1 session.** Commits land on a per-session PVC and survive pod
  crashes; the working tree is disposable by design, and the agent is told so.
- **Consent-first.** Push prints exactly what moves (and what doesn't) before
  anything leaves your machine. Env var *names* are analyzed, values are never
  printed, and missing vars block the push instead of booting services against
  blank config.
- **Docker carry.** Compose services are gracefully stopped, their volumes
  travel (images are re-pulled by digest), and your laptop's containers are
  restarted right after capture.
- **kubectl-free clients.** The laptop needs a URL and a token. Only the Helm
  chart install touches cluster credentials.

## Install

Cluster (once):

```sh
helm repo add stepaway https://stepaway.dev/charts
helm install stepaway stepaway/stepaway -n stepaway --create-namespace
# NOTES.txt prints the backend URL + the command that reads your bearer token
```

Laptop:

```sh
npm i -g https://stepaway.dev/stepaway.tgz
stepaway auth --server <url> --server-token <token>
cd ~/code/my-project && stepaway push
```

## Repo layout

| dir | what |
|---|---|
| `cli/` | the `stepaway` CLI (zero runtime deps, Node ≥ 20) |
| `server/` | in-cluster backend — Bun + Hono, direct k8s API, the `/v1` REST+SSE surface |
| `packages/core` | shared logic: API contract, transcript reader, capture/restore, pod templates |
| `charts/stepaway` | Helm chart: backend, RBAC, opt-in quotas/limits/network policies |

## Development

```sh
bun install
bun run typecheck
bun test server/test
cd cli && bun run build && bun run test:e2e   # CLI against a mock backend
```

## License

[AGPL-3.0](./LICENSE). The hosted cloud offering (stepaway.cloud) is built on
this open core.
