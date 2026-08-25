#!/usr/bin/env bash
# stepaway devcontainer builder.
#
# Contract (frozen, SPEC-v0.3):
#   $ENVSPEC_PATH   the captured .devcontainer files as a single tar.gz, inside
#                   the read-only /spec Secret mount. This is the ONLY accepted
#                   transport form.
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

# The frozen contract is one tarball at $ENVSPEC_PATH. The glob is a courtesy
# fallback for hand-run builds only, and says so loudly.
SPEC_TGZ="${ENVSPEC_PATH:-}"
if [ -z "$SPEC_TGZ" ]; then
  for candidate in /spec/*.tgz /spec/*.tar.gz; do
    [ -f "$candidate" ] || continue
    SPEC_TGZ="$candidate"
    log "WARNING: ENVSPEC_PATH is not set; falling back to $SPEC_TGZ (not the frozen contract)"
    break
  done
fi
[ -n "$SPEC_TGZ" ] || die "ENVSPEC_PATH is not set and no *.tgz was found in /spec; nothing to build"
[ -f "$SPEC_TGZ" ] || die "env spec tarball $SPEC_TGZ does not exist (is the env-spec Secret mounted at /spec?)"

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

# --- unpack the env spec ----------------------------------------------------
# Path traversal is refused twice over:
#   1. GNU tar >= 1.29 (what this image's base ships) strips/refuses ".." and
#      absolute member paths by default. PINNED ASSUMPTION: swapping the base
#      image for one with busybox tar or bsdtar would silently weaken this, so
#      any base-image bump must re-check `tar --version`.
#   2. symlink and hardlink members are refused outright below, because tar
#      happily writes *through* a symlink member on a later extract step,
#      which would let a spec plant a link to /etc and then overwrite it.
log "reading env spec from $SPEC_TGZ"
listing=$(tar -tvzf "$SPEC_TGZ") || die "could not read $SPEC_TGZ (not a gzip tar archive?)"
links=$(printf '%s\n' "$listing" | grep -E '^[lh]' || true)
if [ -n "$links" ]; then
  die "env spec contains symlink/hardlink members, which are never legitimate here: $(printf '%s' "$links" | tr '\n' ';')"
fi

# Fresh, empty extraction dir: no leftovers from a previous run, nothing from
# the Secret mount other than what the tarball itself carries.
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
tar -xzf "$SPEC_TGZ" -C "$WORKDIR" || die "could not extract $SPEC_TGZ into $WORKDIR"

# --- normalise the workspace folder ----------------------------------------
# The devcontainer CLI looks for <folder>/.devcontainer/devcontainer.json or
# <folder>/.devcontainer.json. The tarball may carry either layout, or a
# flattened one, so the extracted content is arranged into a canonical layout.
if [ -f "$WORKDIR/.devcontainer/devcontainer.json" ]; then
  log "layout: .devcontainer/devcontainer.json"
elif [ -f "$WORKDIR/.devcontainer.json" ]; then
  log "layout: bare .devcontainer.json"
elif [ -f "$WORKDIR/devcontainer.json" ]; then
  # Flattened delivery (Secret keys cannot contain "/"): promote it.
  log "layout: flat devcontainer.json, promoting to .devcontainer/"
  mkdir -p "$WORKDIR/.devcontainer"
  # find, not a glob: dotfiles (.dockerignore, .env, ...) must travel too.
  find "$WORKDIR" -mindepth 1 -maxdepth 1 ! -name .devcontainer -print0 |
    while IFS= read -r -d '' f; do
      mv "$f" "$WORKDIR/.devcontainer/" || exit 1
    done || die "could not promote flat spec files into $WORKDIR/.devcontainer"
else
  die "no devcontainer.json in $SPEC_TGZ (looked for .devcontainer/devcontainer.json, .devcontainer.json, devcontainer.json)"
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
