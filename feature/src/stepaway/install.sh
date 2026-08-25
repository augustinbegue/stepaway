#!/usr/bin/env bash
# stepaway devcontainer feature: installs the toolchain a stepaway session
# expects. Runs as root at image build time (devcontainer features always do).
# Every step is idempotent so re-running (or running on an image that already
# ships some of these) is a no-op.
set -euo pipefail

log() { echo "[stepaway-feature] $*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "[stepaway-feature] must run as root" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

APT_UPDATED=0
apt_update_once() {
  if [ "$APT_UPDATED" -eq 0 ]; then
    apt-get update -y
    APT_UPDATED=1
  fi
}

apt_install() {
  # Only touches apt for packages that are actually missing.
  local missing=()
  local pkg
  for pkg in "$@"; do
    if ! dpkg -s "$pkg" >/dev/null 2>&1; then
      missing+=("$pkg")
    fi
  done
  if [ ${#missing[@]} -eq 0 ]; then
    log "apt packages already present: $*"
    return 0
  fi
  log "installing apt packages: ${missing[*]}"
  apt_update_once
  apt-get install -y --no-install-recommends "${missing[@]}"
}

if ! command -v apt-get >/dev/null 2>&1; then
  echo "[stepaway-feature] only Debian/Ubuntu-based images are supported" >&2
  exit 1
fi

# --- base tools -------------------------------------------------------------
apt_install ca-certificates curl git jq procps tmux unzip

# --- node -------------------------------------------------------------------
# Needed for claude (npm package). Skipped entirely when the base image or an
# earlier feature (ghcr.io/devcontainers/features/node) already provides it.
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  log "node already present: $(node --version)"
else
  log "installing node 22 via NodeSource"
  apt_install gnupg
  apt_update_once
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  APT_UPDATED=0 # NodeSource's setup script adds a repo; refresh the index.
  apt_install nodejs
fi

# --- claude code ------------------------------------------------------------
if command -v claude >/dev/null 2>&1; then
  log "claude already present: $(claude --version 2>/dev/null || echo unknown)"
else
  log "installing @anthropic-ai/claude-code"
  npm install -g --no-audit --no-fund @anthropic-ai/claude-code
fi

# --- bun --------------------------------------------------------------------
# Installed with the official installer into /usr/local/bun so it is available
# to every user in the container, then symlinked onto the default PATH.
if command -v bun >/dev/null 2>&1; then
  log "bun already present: $(bun --version)"
else
  log "installing bun"
  export BUN_INSTALL=/usr/local/bun
  curl -fsSL https://bun.sh/install | bash
  ln -sf "$BUN_INSTALL/bin/bun" /usr/local/bin/bun
  ln -sf "$BUN_INSTALL/bin/bunx" /usr/local/bin/bunx
  chmod -R a+rX "$BUN_INSTALL"
fi

# --- cleanup ----------------------------------------------------------------
if [ "$APT_UPDATED" -eq 1 ]; then
  rm -rf /var/lib/apt/lists/*
fi

log "done: node=$(node --version 2>/dev/null || echo -) bun=$(bun --version 2>/dev/null || echo -) claude=$(command -v claude || echo -)"
