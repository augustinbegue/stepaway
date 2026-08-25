# Security

This document gives the trust boundaries, the secrets, the permissions and the
safety posture of stepaway.

## Trust boundaries

There are three zones. The diagram in
[overview.md](./overview.md) shows them.

| boundary | crosses it | never crosses it |
|---|---|---|
| laptop to backend | the capture stream, variable **names**, the Claude token, the goal text | a kubeconfig, cluster credentials, the values of the variables in any report |
| backend to runner pod | exec commands, the capture stream, the Claude token as an env var | the bearer token of the backend, the registry password |
| cluster to external registries | image pulls of the server, the builder and the feature | any content of a project |

The laptop holds one URL and one bearer token. The laptop never holds a
cluster credential. Only the person who installs the chart uses kubectl.

## Secrets inventory

| secret | who mints it | where it lives | who reads it |
|---|---|---|---|
| bearer token | the chart, at install | Secret in the release namespace | the backend, and the CLI over HTTPS |
| Claude token | `claude setup-token` on the laptop | Secret `stepaway-auth` | the runner pod, as `CLAUDE_CODE_OAUTH_TOKEN` |
| registry credentials | the chart | Secret `stepaway-registry-auth`, keys `username`, `password` and `htpasswd` | the backend, the build Jobs, the registry |
| registry pull credentials | the chart | dockerconfigjson Secret `stepaway-registry-pull` | the kubelet, as an `imagePullSecrets` entry of the session pod |
| env spec files | the backend, per build | Secret `stepaway-envspec-<hash8>` | the build Job, at `/spec` |
| env files of the project | the CLI, inside the capture | the work tree of the runner, mode 600 | the agent on the runner |

Rules for these secrets:

- The CLI sends the Claude token in memory only. It writes no temporary file
  and it uses no argv.
- The backend base64-encodes the token in memory and it writes it straight to
  the API server.
- The chart preserves the bearer token and the registry password across an
  upgrade. A regenerate flag rotates them.
- The backend deletes an env spec Secret when the build ends.

## The env value rule

The values of the environment variables of a project never leave the laptop
except inside the capture stream.

- The consent screen prints file names and variable counts, never a value.
- The route `GET /v1/sessions/:id/env-names` takes names and answers with
  names.
- The `detail` field of a failed session carries a log tail, never a value.
- No manifest, no annotation and no chart object contains a value.

Warning: Do not paste an env value into an issue, a goal text or a commit
message. These travel in plain text.

## RBAC

The chart creates one namespace-scoped Role. There is no ClusterRole and there
is no cross-namespace access. Sessions live in the release namespace, next to
the backend.

| resource | verbs |
|---|---|
| `pods` | get, list, watch, create, delete, patch |
| `pods/exec` | get, create |
| `pods/log` | get |
| `persistentvolumeclaims` | get, list, create, delete, patch |
| `secrets` | get, create, patch, delete |
| `batch/jobs` | get, list, watch, create, delete |
| `events` | create, patch |

The verb `get` on `pods/exec` is required for the WebSocket exec path. Without
it, every exec of the backend fails with 403.

## Tar safety

Stepaway moves archives in both directions. The posture has two layers:

1. GNU tar 1.29 and later strips or refuses `..` members and absolute member
   paths by default. The base images of the runner and of the builder ship
   this tar.
2. The builder scans the listing of the archive first and it refuses symlink
   and hardlink members. A symlink member is never legitimate in an env spec,
   and tar writes **through** such a link on a later extract step.

Warning: Re-check `tar --version` after any bump of a base image. A base image
with busybox tar or with bsdtar weakens layer 1 in silence.

## Permissions of the autonomous agent

Every run is unattended. See
[ADR 0006](../decisions/0006-always-unattended-runs.md).

The backend probes the installed Claude Code CLI and it picks the strongest
supported automatic permission mode. When no such mode exists, it falls back
to `--dangerously-skip-permissions` and it returns a warning in the
`RunResponse`.

The consequence is direct: the agent on the runner acts without a prompt. Treat
a runner pod as a machine that runs arbitrary code from the project and from
the agent.

Two controls limit the blast radius:

- The Role is namespace-scoped, and the runner pod holds no ServiceAccount
  token of the backend.
- The chart offers an opt-in NetworkPolicy that denies ingress to the runner
  pods except from the backend. The value `networkPolicy.runnerEgress`
  restricts the egress.

Warning: Verify that your CNI enforces NetworkPolicy. Several CNIs accept the
object and enforce nothing.

The dind sidecar is privileged. A cluster that refuses privileged containers
must set `runner.dind.enabled` to false. Sessions then have no docker daemon,
and a capture with a compose project cannot restore it.

The opt-in `quotas` and `limitRange` values bound the count and the size of
the runner pods.
