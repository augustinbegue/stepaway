#!/usr/bin/env bash
# stepaway devcontainer builder.
#
# Contract (frozen, SPEC-v0.3):
#   /spec           the captured .devcontainer files (Secret mount, read-only)
#   $IMAGE_REF      full ref to build and push, e.g. reg.example.com/stepaway-env:env-<hash>
#   $REGISTRY_HOST  registry to log into (host[:port], no scheme)
#   $REGISTRY_USER / $REGISTRY_PASS
#   $STEPAWAY_FEATURE  OCI ref of the stepaway devcontainer feature, merged into every build
#   $DOCKER_HOST    dind sidecar, default tcp://127.0.0.1:2375
#
# The server surfaces the tail of this log on failure, so every failure path
# ends with a single self-contained line explaining what went wrong.
set -euo pipefail

WORKDIR=/workspace/build
DOCKER_HOST="${DOCKER_HOST:-tcp://127.0.0.1:2375}"
export DOCKER_HOST
DIND_TIMEOUT="${DIND_TIMEOUT:-120}"

log() { echo "[builder] $*"; }
die() {
  echo "[builder] FAILED: $*" >&2
  exit 1
}

# --- inputs -----------------------------------------------------------------
[ -n "${IMAGE_REF:-}" ] || die "IMAGE_REF is not set"
[ -n "${REGISTRY_HOST:-}" ] || die "REGISTRY_HOST is not set"
[ -n "${REGISTRY_USER:-}" ] || die "REGISTRY_USER is not set"
[ -n "${REGISTRY_PASS:-}" ] || die "REGISTRY_PASS is not set"
[ -d /spec ] || die "/spec is not mounted; nothing to build"

# --- wait for the dind sidecar ---------------------------------------------
log "waiting for docker at $DOCKER_HOST (timeout ${DIND_TIMEOUT}s)"
deadline=$(( $(date +%s) + DIND_TIMEOUT ))
until docker version >/dev/null 2>&1; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    die "docker daemon at $DOCKER_HOST did not become ready within ${DIND_TIMEOUT}s (dind sidecar not running?)"
  fi
  sleep 2
done
log "docker ready: $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo unknown)"

# --- registry login ---------------------------------------------------------
if ! printf '%s' "$REGISTRY_PASS" |
  docker login "$REGISTRY_HOST" --username "$REGISTRY_USER" --password-stdin >/dev/null; then
  # Never echo the credential itself; the server ships this log tail to users.
  die "docker login to $REGISTRY_HOST as $REGISTRY_USER failed (bad credentials, or the registry is not reachable from this pod)"
fi
log "logged in to $REGISTRY_HOST as $REGISTRY_USER"

# --- normalise the workspace folder ----------------------------------------
# The devcontainer CLI looks for <folder>/.devcontainer/devcontainer.json or
# <folder>/.devcontainer.json. /spec may arrive in either layout (and, as a
# Secret mount, is read-only and made of symlinks), so everything is copied
# into a scratch dir first and then arranged into the canonical layout.
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
cp -rL /spec/. "$WORKDIR"/ 2>/dev/null || die "could not copy /spec into $WORKDIR"

# Optional transport form: a single tarball of the .devcontainer files.
for tarball in "$WORKDIR"/*.tgz "$WORKDIR"/*.tar.gz; do
  [ -f "$tarball" ] || continue
  log "extracting $(basename "$tarball")"
  tar -xzf "$tarball" -C "$WORKDIR" || die "could not extract $(basename "$tarball")"
  rm -f "$tarball"
done

if [ -f "$WORKDIR/.devcontainer/devcontainer.json" ]; then
  log "layout: .devcontainer/devcontainer.json"
elif [ -f "$WORKDIR/.devcontainer.json" ]; then
  log "layout: bare .devcontainer.json"
elif [ -f "$WORKDIR/devcontainer.json" ]; then
  # Flattened delivery (Secret keys cannot contain "/"): promote it.
  log "layout: flat devcontainer.json, promoting to .devcontainer/"
  mkdir -p "$WORKDIR/.devcontainer"
  for f in "$WORKDIR"/*; do
    [ -e "$f" ] || continue
    [ "$f" = "$WORKDIR/.devcontainer" ] && continue
    mv "$f" "$WORKDIR/.devcontainer/"
  done
else
  die "no devcontainer.json found in /spec (looked for .devcontainer/devcontainer.json, .devcontainer.json, devcontainer.json)"
fi

# --- build ------------------------------------------------------------------
FEATURE_REF="${STEPAWAY_FEATURE:-ghcr.io/augustinbegue/stepaway-feature/stepaway:0}"
log "building $IMAGE_REF (feature: $FEATURE_REF)"
if ! devcontainer build \
  --workspace-folder "$WORKDIR" \
  --image-name "$IMAGE_REF" \
  --additional-features "{\"$FEATURE_REF\":{}}"; then
  die "devcontainer build failed for $IMAGE_REF (see the build output above)"
fi

# --- push -------------------------------------------------------------------
log "pushing $IMAGE_REF"
docker push "$IMAGE_REF" || die "docker push of $IMAGE_REF to $REGISTRY_HOST failed"

log "OK: $IMAGE_REF built and pushed"
