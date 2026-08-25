# 0007. The docker carry moves volumes, not images

- Date: 2026-08-23
- Status: accepted

## Context

An agent that continues a task often needs the seeded database of the project.
Images are large and they are already available from a registry. Volume data
is small and it exists only on the laptop.

## Decision

The docker carry has this scope and shape:

- Scope is the compose project of the repository only. The compose file is at
  the root of the repository, or the value `composeFile` names it.
- The consent screen lists exactly which containers stop. The CLI runs
  `docker stop -t 30`.
- The CLI tars the volumes from the stopped state. It refuses to carry a
  container that does not stop in time, and it records the refusal.
- The manifest records the image digests. The runner runs
  `docker compose pull`, restores the volumes and runs `docker compose up -d`.
- The CLI restarts the containers on the laptop after the capture.
- A project without a compose file, or a laptop without docker, skips this
  step cleanly.

## Consequences

- The transfer stays small and the restore is exact for the data.
- A stop of the local services is required for a consistent copy. The consent
  gate covers it, and the restart contract limits the disruption.
- Undeclared containers do not travel. The manifest lists them.
- The volumes do not come home on a pull, and the pull output states it.
