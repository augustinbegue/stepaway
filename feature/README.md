# stepaway devcontainer feature

`ghcr.io/augustinbegue/stepaway-feature/stepaway`

Installs the toolchain a [stepaway](https://stepaway.dev) session expects
inside a devcontainer: Claude Code, tmux, git, jq, procps, curl, unzip, bun
(and node, if the base image does not already ship it).

stepaway merges this feature into every devcontainer image it builds, so you
do not have to reference it yourself. It is published separately because it is
useful standalone — adding it to your own `devcontainer.json` makes local
`devcontainer up` and the stepaway runner converge on the same environment:

```jsonc
{
  "image": "mcr.microsoft.com/devcontainers/base:bookworm",
  "features": {
    "ghcr.io/augustinbegue/stepaway-feature/stepaway:0": {}
  }
}
```

Requirements: a Debian/Ubuntu-based image (apt-get). No options; everything it
installs is skipped when already present, so it composes with
`ghcr.io/devcontainers/features/node` and friends.

Source: `feature/src/stepaway`. Published to GHCR by `.github/workflows/ci.yml`
on push to `main`.
