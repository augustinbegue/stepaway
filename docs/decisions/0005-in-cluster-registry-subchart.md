# 0005. The registry is an opt-in subchart

- Date: 2026-08-25
- Status: accepted

## Context

The devcontainer path needs a place for the built environment images. An
external registry adds a credential that the user must supply. A custom
registry component adds code that stepaway must maintain.

## Decision

The chart depends on the well-known `twuni/docker-registry` subchart under the
key `registry`. The value `registry.enabled` is false by default.

- The chart mints a random user and password, and it preserves them across an
  upgrade.
- The chart wires three consumers: the pull Secret of the session pods, the
  push credentials of the build Jobs, and the basic auth of the manifest
  checks of the backend.
- The value `registry.host` is required, and it must resolve for the nodes.
- An empty `REGISTRY_HOST` disables the devcontainer path.

## Consequences

- A default install stays small. It has no registry and no PVC for images.
- The kubelet pulls the image of a session pod, so a cluster DNS name does not
  work. The supported topology is one public DNS name with TLS.
- Garbage collection is a manual operation with `registry garbage-collect`.
- The failure mode is explicit. A missing registry falls back to the generic
  base with a warning, and it never fails a push in silence.
