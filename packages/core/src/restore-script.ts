/**
 * Local restore (the `pull` direction) — ported from scripts/restore.sh with
 * the PoC findings baked in:
 *   - target path is an explicit argument (no jq, no implicit same-path rule);
 *   - transcripts are stored under the slug of the TARGET path (R1). The cwd
 *     rewrite and the phantom-tail trim happen in the CLI before transport, so
 *     this script only has to place files;
 *   - restore into an existing repo fetches to FETCH_HEAD + hard resets (P5 fix).
 * No credential handling: v0.1 auth lives in a k8s Secret, not in the payload.
 *
 * Usage: <script> <capture_dir> <target_project_dir> <branch> <target_slug>
 */
export const RESTORE_SH = String.raw`
set -euo pipefail
IN="$(cd "$1" && pwd)"
PROJ="$2"
BRANCH="$3"
SLUG="$4"

# 1. repo
mkdir -p "$PROJ"
cd "$PROJ"
if [ ! -e .git ]; then
  git clone -q "$IN/repo.bundle" .
  git checkout -q "$BRANCH" 2>/dev/null || git checkout -qb "$BRANCH"
else
  git fetch -q "$IN/repo.bundle" "$BRANCH"
  git checkout -q "$BRANCH" 2>/dev/null || git checkout -qb "$BRANCH"
  git reset -q --hard FETCH_HEAD
fi

# 2. dirty + untracked overlay; apply deletions
tar xzf "$IN/dirty.tar.gz" -C "$PROJ"
if [ -f "$IN/deleted-files.txt" ]; then
  while IFS= read -r f; do [ -n "$f" ] && rm -f "$PROJ/$f"; done < "$IN/deleted-files.txt"
fi

# 3. project config
[ -f "$IN/project-config.tar.gz" ] && tar xzf "$IN/project-config.tar.gz" -C "$PROJ" || true

# 4. session transcripts under the slug of the RESTORED path
mkdir -p "$HOME/.claude/projects/$SLUG"
cp "$IN/sessions/"*.jsonl "$HOME/.claude/projects/$SLUG/" 2>/dev/null || true

echo "restored -> $PROJ"
`;

/**
 * Runner-side restore — the separate-git-dir layout that makes durability
 * legible (spec §2):
 *
 *   /repo/<proj>.git   PVC-backed, holds every object and ref
 *   /work/<proj>       emptyDir working tree whose `.git` is a FILE pointing
 *                      at the git dir above
 *
 * Only git objects are durable, by construction: if the pod dies, the commits
 * survive on the PVC and the uncommitted tree does not — which is exactly what
 * the launch system prompt tells the agent.
 *
 * Env files are placed here too (mode 600) so `setup` and `docker compose up`
 * see them.
 *
 * Usage: <script> <capture_dir> <git_dir> <work_tree> <branch> <target_slug>
 */
export const RESTORE_RUNNER_SH = String.raw`
set -euo pipefail
IN="$(cd "$1" && pwd)"
GITDIR="$2"
WT="$3"
BRANCH="$4"
SLUG="$5"

# kubectl cp preserves the laptop's uid; the runner is a single-user disposable
# pod, so ownership checks only get in the way.
git config --global --add safe.directory '*'

mkdir -p "$(dirname "$GITDIR")" "$WT"

# 1. git dir on the PVC
FRESH=0
if [ ! -d "$GITDIR" ]; then
  git clone -q --bare "$IN/repo.bundle" "$GITDIR"
  FRESH=1
fi
git --git-dir="$GITDIR" config core.bare false
git --git-dir="$GITDIR" config core.worktree "$WT"
git --git-dir="$GITDIR" config core.logallrefupdates true

# 2. working tree on the emptyDir, pointing at the PVC git dir via a .git FILE
printf 'gitdir: %s\n' "$GITDIR" > "$WT/.git"
if [ "$FRESH" = "0" ]; then
  # a second push onto the same session: fetch to FETCH_HEAD, then hard-reset
  # (fetching straight into a checked-out branch is refused by git)
  git --git-dir="$GITDIR" --work-tree="$WT" fetch -q "$IN/repo.bundle" "$BRANCH"
fi
git --git-dir="$GITDIR" --work-tree="$WT" checkout -f "$BRANCH" 2>/dev/null \
  || git --git-dir="$GITDIR" --work-tree="$WT" checkout -f -b "$BRANCH"
if [ "$FRESH" = "0" ]; then
  git --git-dir="$GITDIR" --work-tree="$WT" reset -q --hard FETCH_HEAD
fi

# 3. dirty + untracked overlay; apply deletions
tar xzf "$IN/dirty.tar.gz" -C "$WT"
if [ -f "$IN/deleted-files.txt" ]; then
  while IFS= read -r f; do [ -n "$f" ] && rm -f "$WT/$f"; done < "$IN/deleted-files.txt"
fi

# 4. project config
[ -f "$IN/project-config.tar.gz" ] && tar xzf "$IN/project-config.tar.gz" -C "$WT" || true

# 5. carried env files, mode 600
if [ -d "$IN/envfiles" ]; then
  (cd "$IN/envfiles" && tar cf - .) | (cd "$WT" && tar xf -)
  (cd "$IN/envfiles" && find . -type f -print) | while IFS= read -r f; do
    rel=$(printf '%s' "$f" | sed 's|^\./||')
    chmod 600 "$WT/$rel" 2>/dev/null || true
  done
fi

# 6. session transcript under the slug of the RESTORED path
mkdir -p "$HOME/.claude/projects/$SLUG"
mkdir -p /work/.stepaway 2>/dev/null || true
cp "$IN/sessions/"*.jsonl "$HOME/.claude/projects/$SLUG/" 2>/dev/null || true

# 7. sanity: the split layout must look like an ordinary repo from the tree
cd "$WT"
git status --porcelain >/dev/null

echo "restored -> $WT (git dir $GITDIR)"
`;
