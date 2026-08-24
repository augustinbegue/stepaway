/**
 * Runner-side docker restore. Reads the volume tars the capture carried,
 * recreates the named volumes, then `compose pull` + `up -d` in the restored
 * working tree. Degrades to a no-op when there is nothing to do.
 *
 * Lives in core because both sides need it: the CLI executed it over kubectl in
 * v0.1, the backend execs it over the k8s WebSocket API in v0.2.
 *
 * Usage: <script> <capture_dir> <work_tree> <compose_file>
 */
export const DOCKER_RESTORE_SH = String.raw`
set -uo pipefail
IN="$1"
WT="$2"
COMPOSE="$3"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker: not installed on the runner; skipping services"
  exit 0
fi
if ! docker info >/dev/null 2>&1; then
  echo "docker: daemon not reachable on the runner; skipping services"
  exit 0
fi

if [ -d "$IN/volumes" ]; then
  for tarball in "$IN"/volumes/*.tar.gz; do
    [ -f "$tarball" ] || continue
    vol=$(basename "$tarball" .tar.gz)
    docker volume create "$vol" >/dev/null 2>&1 || true
    if docker run --rm -i -v "$vol":/v alpine tar xzf - -C /v < "$tarball"; then
      echo "restored volume $vol"
    else
      echo "WARN: could not restore volume $vol"
    fi
  done
fi

if [ -n "$COMPOSE" ] && [ -f "$WT/$COMPOSE" ]; then
  cd "$WT"
  docker compose -f "$COMPOSE" pull  || echo "WARN: docker compose pull failed"
  if docker compose -f "$COMPOSE" up -d; then
    echo "services up"
  else
    echo "WARN: docker compose up -d failed; the agent can retry"
  fi
fi
`;
