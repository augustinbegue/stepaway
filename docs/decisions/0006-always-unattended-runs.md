# 0006. Runs are always unattended

- Date: 2026-08-23
- Status: accepted

## Context

The purpose of a handoff is a closed laptop. An interactive attach makes the
user the bottleneck again and it needs a terminal protocol through the
backend.

## Decision

After the restore and the setup, the backend always launches the agent in a
detached tmux session with `claude -p --resume`.

- The instruction is the text of `--goal`, or a default instruction that tells
  the agent to review the last turns and to continue the task.
- The launch appends the guidance to commit locally after each coherent unit
  of work.
- The backend probes the installed CLI and it picks the strongest supported
  automatic permission mode. Otherwise it uses
  `--dangerously-skip-permissions` and it returns a warning.
- The output goes to `/work/.stepaway/run.log`. A wrapper writes the exit
  marker that moves the state to `done` or to `failed`.
- Observation is read-only, through `stepaway peek` and the transcript route.

## Consequences

- The agent acts without a prompt on the runner. The consent screen states
  this fact before anything moves.
- A failed setup does not stop the launch, because the agent can often repair
  it.
- Interactive attach is not a product feature.
