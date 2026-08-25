---
name: stepaway
description: Use when the user wants to move this live coding session to their cluster runner, watch it work there, or bring it back — phrases like "hand this off", "step away", "push this session to my runner", "move this to the cloud and keep going", "what's it doing", "pull it back", "bring my session home", "what's the status of the handoff", "kill that runner". Drives the `stepaway` CLI (auth/push/peek/pull/status/destroy/doctor).
---

# stepaway

`stepaway` moves this session — the repo, the uncommitted work, the transcript,
the project's env files and database volumes — from this machine to a runner pod
on the user's own Kubernetes cluster, starts the agent there unattended, and
brings it all back. The CLI does the work; your job is to run it from the project
root and relay what it says accurately.

Each handoff gets its own pod **and** PVC. Commits land on the PVC and survive a
crash; the working tree does not. Say that plainly when it matters.

## Before anything: auth

The CLI is a pure HTTP client of the user's stepaway backend. It needs two things
stored once per machine, both done by `stepaway auth`: the backend URL + bearer
token (saved to `~/.config/stepaway/config.json`), and the user's Claude token
(sent to the backend, never stored locally).

`stepaway auth` is interactive (browser sign-in) — **do not** run it yourself in
the background. If a command fails with "no backend configured" or the backend
reports a missing Claude token, tell the user to run

```
stepaway auth --server <url> --server-token <token>
```

in their own terminal (the URL and token come from the Helm chart's NOTES.txt),
and stop there. There is no kubectl on this machine and none is needed.

## Handing off (push)

1. Work out the goal to continue with: whatever the user just stated, or, if they
   did not state one, a one-or-two sentence summary of the task currently in
   progress. Confirm that summary with the user in your reply.
2. From the project root, run via Bash:

   ```
   stepaway push --yes --goal "<the goal>" --session <this session id>
   ```

   Pass `--session` when you know this session's id, so the right transcript
   travels. Add `--server` only if the user named a specific backend.
3. `--yes` skips the interactive prompt, so **you** are the consent step. Relay
   the consent summary the command prints, verbatim-in-substance:
   - what moves: branch, dirty file count and the largest files, the session,
     **which env files are carried and how many variables each holds** (never the
     values), **which containers will be stopped** and which volumes travel, the
     setup command, and that the agent will run autonomously;
   - what does NOT: gitignored files, skipped env files, orphan containers, and
     that docker volumes never come back;
   - the `environment:` line — the runner image, a devcontainer that will be
     built and cached on the cluster, or the generic image.

   `--yes` also means the CLI does not run the interactive env picker: it carries
   every declared env file unless `.stepaway.json` says otherwise. **List those
   files in chat before pushing** and let the user object. If the user has not
   clearly asked to hand off, show them the plan and ask first.
4. If push is **blocked** on unsatisfied variables, do not try to work around it.
   Report the missing names and offer the two fixes the CLI names: carry the file
   that defines them, or add `env.overrideVars` to `.stepaway.json`. A blocked or
   declined push deletes the (still empty) runner for you — nothing was uploaded.
5. Report that the agent is running unattended, and the `stepaway peek -f` /
   `stepaway pull` next steps. Tell the user the cloud is now the source of truth
   for this project.

Notes:
- If the project has no `.devcontainer/devcontainer.json`, authoring one is a
  valuable first commit: it becomes the runner's environment on the next push
  (built once on the cluster, cached by content hash after that), and the first
  push with a new one sits in state `building` for a few minutes.
- Env values are never printed by the CLI. Do not go read `.env` yourself to
  "check" — that would put secrets in this transcript.
- Pushing stops the project's containers briefly and restarts them. Say so before
  running, not after.
- Do not hand-roll `curl` against the API or `git bundle`. Use the CLI.

## Watching it (peek)

```
stepaway peek          # everything so far
stepaway peek -f       # follow live
```

Renders the runner's transcript: assistant prose plus one `⚙ ToolName` line per
tool call. Use the non-following form when the user asks "what's it doing" — `-f`
never returns on its own.

## Bringing it back (pull)

Run from the project root:

```
stepaway pull
```

- If it refuses because the local tree is dirty, **do not** add `--overwrite` on
  your own. Show the user which local files would be replaced
  (`git status --porcelain`) and ask them to choose: commit/stash locally, or
  re-run with `--overwrite` (which lets the runner's state win).
- A successful pull deletes the pod and its PVC. Say that, and repeat that the
  runner's docker volumes are gone with it.
- Report the `claude --resume <id>` command it prints.

## Status and cleanup

`stepaway status` (add `--json` to parse it) says whether this project is handed
off, to which backend and session id, and the run **state** — one of `building`
(devcontainer env image being built, before the pod exists), `pending`,
`restoring`, `ready`, `running`, `done`, `failed`. Lead with that state when the
user asks how it is going: `done` means the run finished, `failed` means it did
not, and `stepaway peek` says why. With no handoff it lists every session the
backend is running.

`stepaway destroy` deletes the pod and PVC **without** bringing anything home.
Only run it when the user explicitly wants to abandon the work, and tell them
`stepaway pull` is the non-destructive option first.

## When something is wrong

Run `stepaway doctor` and report the FAIL lines verbatim.
