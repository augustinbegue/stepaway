# stepaway

Move a live Claude Code session — repo, uncommitted work, transcript, env files,
database volumes, project config — from your laptop to a runner pod on your own
Kubernetes cluster, and back. Close the lid; the agent keeps going.

The CLI is a pure HTTP client of the **stepaway backend**, which you install on
your cluster once with the Helm chart. Your laptop needs no kubectl, no
kubeconfig, and no npm runtime dependencies — just a URL and a token.

## Install

On the cluster, once (this is the only step that needs kubectl):

```sh
helm repo add stepaway https://stepaway.dev/charts
helm install stepaway stepaway/stepaway --namespace stepaway --create-namespace
# NOTES.txt prints the backend URL and the one command that reads the bearer token
```

On each laptop:

```sh
npm i -g https://stepaway.dev/stepaway.tgz
stepaway auth --server https://stepaway.example.com --server-token <token>
stepaway doctor            # local checks + the backend's own diagnostics
```

Requires Node >= 20, `git`, `tar`, `bash`. That is the whole client-side list.

No ingress? Run `kubectl port-forward svc/stepaway 8080:80 -n stepaway` yourself
and point `--server` at `http://127.0.0.1:8080`; the API is URL-first and the CLI
does not manage port-forwards.

## Quickstart

```sh
cd ~/code/my-project
stepaway auth --server <url> --server-token <token>   # once — see "Auth" below
stepaway push                       # consent summary, then hands off and starts the agent
stepaway peek -f                    # watch it work
stepaway pull                       # bring code + transcript home, delete the pod
```

Install the Claude Code skill so you can just say "hand this off":

```sh
stepaway skill install              # -> ~/.claude/skills/stepaway
```

## Auth

`stepaway auth` does two things.

1. **Points this machine at a backend.** `--server <url>` and `--server-token
   <token>` (both prompted for if omitted on a terminal) are verified with an
   authenticated `GET /v1/version`, then written to
   `~/.config/stepaway/config.json` (`XDG_CONFIG_HOME` respected) with mode
   `600`. That file is machine-scoped and holds a credential — it is never the
   project's `.stepaway.json`.
2. **Stores your Claude token on the backend.** It runs `claude setup-token`
   locally (you complete the sign-in in your browser), lifts the token out of
   the output, and `PUT`s it to `/v1/claude-token`. The backend owns the k8s
   Secret; runner pods read it as `CLAUDE_CODE_OAUTH_TOKEN`.

The Claude token never touches your disk here and is never printed. Nothing is
copied out of `~/.claude`, and no Keychain is read. Re-run `stepaway auth` any
time to rotate either credential; `--token <value>` skips the interactive flow if
you already have one.

`push` refuses to run until a backend is configured, and the backend refuses to
launch a run until the Claude token is stored.

## One pod per session

Each `push` creates its own pod **and** PVC named `stepaway-<first 8 hex of the
session id>`, labelled `stepaway.dev/session=<full id>`:

| path | backing | survives a pod crash |
|---|---|---|
| `/repo/<proj>.git` | per-session PVC (longhorn, 2 Gi) | **yes** — every commit |
| `/work/<proj>` | emptyDir working tree, `.git` is a *file* pointing at the git dir | no |

That split is the durability contract, and the agent is told about it in its
system prompt: *commit locally after each coherent unit of work — the repository
survives crashes, the working tree does not.*

By default the pod runs `node:22-bookworm-slim` (boot-installs git, tmux and
`@anthropic-ai/claude-code`, ~1 min cold) next to a privileged `docker:dind`
sidecar, so the project's compose stack can run on the runner. A project with a
devcontainer or an explicit `image` gets that instead — see "Runner
environment".

A successful `pull` deletes both pod and PVC. `stepaway destroy` does the same
for a handoff you want to abandon.

## Runner environment

What the session pod actually runs is resolved per push, first match wins:

1. **`"image": "<ref>"` in `.stepaway.json`** — your image, run as-is. Nothing is
   built; you own what is in it.
2. **`.devcontainer/devcontainer.json`** (or a bare `.devcontainer.json`) — the
   files under `.devcontainer/` are hashed (sha256, first 16 hex, over sorted
   relative paths + contents) and shipped with the session-create call as a
   ≤1 MiB tar.gz. The backend builds `stepaway-env:env-<hash>` in the cluster
   registry with the devcontainer CLI, always merging the `stepaway` devcontainer
   feature (claude, tmux, git, jq, bun), and boots the pod from the result.
3. **The generic runner image** (`node:22-bookworm-slim` + boot-install).

The boot script stays idempotent in all three cases (`command -v claude ||
install`), so any image works — a prepared one is just fast.

The devcontainer path needs the chart's registry component
(`registry.enabled=true`, node-reachable via `registry.host` — see the chart's
values). If the backend has no registry configured, push warns and falls through
to the generic image rather than failing.

A cold build is a real k8s Job: the **first** push with a given devcontainer
config sits in state `building` for a few minutes (the CLI says so, and
`stepaway status` shows `building`). Every later push with the same content is a
registry cache hit and starts immediately. Change the devcontainer, get a new
hash, pay the build once more.

If the project has no devcontainer, writing one is a good first commit for the
agent to make — it becomes the runner env from the next push on.

## What moves, and what does not

**Moves:** all git branches and tags (`git bundle`), modified + untracked files,
staged deletions, **one** session transcript, `.claude/` and `CLAUDE.md`, the
project's declared env files, and the project's compose volumes.

**Does not move:** gitignored files other than the carried env files, running
processes, anything on your docker daemon outside the project's compose project,
and — on the way back — the runner's docker volumes, which die with the pod.

Transcripts are rewritten on the way: every `cwd` is remapped to the destination
path, the file is stored under the destination's slug, and trailing phantom turns
from a previously failed `--resume` are trimmed (`POC.md` R1/R4).

Agent worktrees (`.claude/worktrees/`, `.codex/worktrees/`) never travel — they
are throwaway checkouts of the same repo. Add your own prefixes with
`excludeGlobs`.

### Env files

Declared env files (compose `env_file:` entries plus gitignored `.env*`) are
**carried whole** by default. On an interactive push with no remembered choice,
stepaway lists them and lets you drop files or name variables to exclude, then
remembers the decision in `.stepaway.json`. Values are never printed, never land
in the manifest, and arrive mode 600.

Push then does a hard-fail preflight: every variable name your compose file and
`.env.example` declare must be satisfied by a carried file, an `overrideVars`
entry, or the runner's own environment. If any are missing, the push is
**blocked** with the list — silently booting a service against a blank password
is the worst possible handoff outcome (`POC.md` D4).

### Services (docker)

If the project has a compose file and your local docker daemon is reachable,
push will:

1. list exactly which containers it is about to stop, in the consent summary;
2. after you accept, `docker stop -t 30` them, tar each compose volume from the
   stopped state, and record the image digests (images never travel);
3. **restart your local containers** — you get your laptop back with its
   database running;
4. on the runner: recreate the volumes, `docker compose pull`, `up -d`.

A container that will not stop in 30 s has its volumes refused rather than torn,
and the refusal is recorded. Containers with no compose definition are listed as
not-carried. No compose file or no docker: skipped cleanly.

### Setup

After the env files land and before the agent starts, stepaway runs the `setup`
command from `.stepaway.json`, or an autodetected one: `bun.lock`/`bun.lockb` →
`bun install`, `pnpm-lock.yaml` → `pnpm i`, `yarn.lock` → `yarn`,
`package-lock.json` → `npm ci`. A failure warns loudly and still launches — the
agent can usually fix it.

The runner boots with node, npm and bun on PATH, so any of those setup commands
works out of the box.

## Run and observe

`push` ends with `POST /v1/sessions/:id/run`, and the backend starts the
unattended run on the runner. The CLI sends one thing: the instruction — your
`--goal`, or a default that tells the agent to review the last few turns and
continue. Permission-mode probing and the commit-locally system prompt are the
backend's defaults now, so a cluster upgrade can change them without a CLI
release.

`stepaway status` shows the backend's own run state — `[building →] pending →
restoring → ready → running → done | failed` — which is the field to trust.
`building` only appears on the devcontainer path, before the pod exists.

`stepaway peek` renders the session transcript from `GET /v1/sessions/:id/
transcript` — assistant prose verbatim, one `⚙ ToolName` line per tool call, no
payload dumps. `-f` follows it over SSE.

## Config

`.stepaway.json` in the project root (all flags override it):

```json
{
  "remotePathBase": "/work",
  "composeFile": "compose.yaml",
  "excludeGlobs": [],
  "setup": null,
  "image": null,
  "env": {
    "carryFiles": [".env", ".env.local"],
    "excludeVars": ["STRIPE_LIVE_KEY"],
    "overrideVars": { "DATABASE_URL": "postgres://localhost/dev" }
  }
}
```

`image` pins the runner image and skips the devcontainer path entirely (see
"Runner environment"). `overrideVars` holds values, so stepaway never writes that key itself — only
`carryFiles` and `excludeVars` are remembered from the picker. Keep
`.stepaway.json` out of git if you put secrets in `overrideVars`.

Add `"server": "https://other.example.com"` to `.stepaway.json` to point one
project at a different backend. Precedence for the endpoint is
`--server` > `.stepaway.json` > `~/.config/stepaway/config.json`; the bearer
token is only ever `--server-token` > the global config.

Global flags: `--server <url>`, `--server-token <value>`, `--session <id>`,
`--remote-base <path>`, `--json`, `--verbose`.

`push` and `pull` show phase-level progress with spinners on a terminal;
`--verbose` adds the per-phase detail (the backend's restore/setup report,
docker chatter, stack traces). With `--yes`, `--json`, or no TTY
they fall back to plain line output, so the skill and CI see the same text
they always did.

## Handoff semantics

After a push, the runner is the source of truth. `push` leaves
`.git/stepaway-baton.json` recording the backend URL and session id the work
went to. `pull` uses it, and
if your local tree is dirty it warns and requires `--overwrite` before letting
the runner's state replace local changes. With no baton and a dirty tree, `pull`
refuses outright. The baton is removed on a successful pull or destroy.

## Commands

| command | what it does |
|---|---|
| `stepaway auth` | point this machine at a backend, then store your Claude token there |
| `stepaway push [dir]` | capture, consent summary, restore on a fresh pod, run unattended |
| `stepaway peek [dir]` | render the runner's transcript (`-f` to follow) |
| `stepaway pull [dir]` | download the runner's archive, restore here, delete pod + PVC |
| `stepaway status [dir]` | is this project handed off, where, which session, what run state |
| `stepaway destroy [dir]` | abandon a handoff: delete pod + PVC |
| `stepaway doctor [dir]` | local + backend PASS/FAIL preflight, exit 1 if push would fail |
| `stepaway init [dir]` | write `.stepaway.json` |
| `stepaway skill install` | install the Claude Code skill |

## The API

The CLI speaks the frozen v1 surface in `packages/core/src/api.ts` and nothing
else:

| endpoint | used by |
|---|---|
| `POST/GET /v1/sessions`, `GET/DELETE /v1/sessions/:id` | push, status, pull, destroy |
| `POST /v1/sessions/:id/capture` | push (streamed tar upload, `?setup=<cmd>`) |
| `POST /v1/sessions/:id/run` | push |
| `GET /v1/sessions/:id/transcript` (`?follow=1` SSE) | peek |
| `GET /v1/sessions/:id/archive` | pull (streamed download) |
| `GET /v1/sessions/:id/env-names?names=…` | push (D4 preflight, names only) |
| `PUT /v1/claude-token` | auth |
| `GET /v1/diagnostics`, `GET /v1/version` | doctor, every command's skew check |

Every call carries `Authorization: Bearer <token>`; errors are JSON
`{error, detail}` and are printed as one line. The CLI warns on a minor version
skew against the backend and refuses to run on a major one.

## Build from source

```sh
bun run build            # -> dist/stepaway.js
node dist/stepaway.js --help
bun run test:e2e         # drives the real CLI against a mock backend, no cluster
```

## License

AGPL-3.0-only.
