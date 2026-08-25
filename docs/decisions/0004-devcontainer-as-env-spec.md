# 0004. devcontainer.json is the canonical environment specification

- Date: 2026-08-25
- Status: accepted

## Context

A hardcoded runner image fits few projects. The alternatives were a matrix of
stack variants, an invented specification format, or an existing standard.

## Decision

The environment of a session resolves in three steps, and the first match
wins:

1. the value `image` in `.stepaway.json`, run as-is,
2. `.devcontainer/devcontainer.json` or `.devcontainer.json` in the
   repository, built and cached as an image,
3. the generic base `node:22-bookworm-slim`.

The built image is the main container of the session pod. Stepaway invents no
environment format and it ships no stack matrix.

Every build merges the stepaway devcontainer feature, which installs the
toolchain of a runner. The boot script stays idempotent in all three cases.

## Consequences

- A project that already uses devcontainers needs no stepaway-specific file.
- A project without a devcontainer keeps the generic base and pays the boot
  install. The default instruction of the agent suggests a `devcontainer.json`
  as a valuable first commit.
- Step 2 requires the registry component. Without it the backend warns and
  falls through to step 3.
- The feature is a separate open artifact and it works outside stepaway.
- The variant `dockerComposeFile` of the devcontainer specification is out of
  scope. Compose services keep the docker carry path.
