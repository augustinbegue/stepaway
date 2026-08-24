/**
 * Embedded capture script — the single source of truth for "what moves".
 * Ported from scripts/capture.sh (the validated PoC), with these v0.1 changes:
 *   - no `jq` dependency (macOS laptops don't reliably have it): raw facts are
 *     written to meta/ files and manifest.json is composed by the CLI;
 *   - NO credential capture at all (v0.1 auth is a k8s Secret, see podspec.ts);
 *   - exactly ONE transcript travels ($3, else the newest in the slug dir);
 *   - excluded path prefixes (agent worktrees) are dropped from the dirty
 *     capture and from the env-file scan.
 * Run identically on the laptop (via local bash) and on the runner (via exec).
 *
 * macOS bash 3.2: no mapfile, no associative arrays, no ${var,,}.
 *
 * Usage: <script> <project_dir> <out_dir> [session_id]
 * Env:   STEPAWAY_EXCLUDES  newline-separated path prefixes to drop
 */
export const CAPTURE_SH = String.raw`
set -euo pipefail
PROJ="$(cd "$1" && pwd)"
OUT="$2"
if [ $# -ge 3 ]; then SESSION="$3"; else SESSION=""; fi
mkdir -p "$OUT/sessions" "$OUT/meta"

EXCL="$OUT/meta/excludes.txt"
printenv STEPAWAY_EXCLUDES > "$EXCL" 2>/dev/null || : > "$EXCL"

# prefix-match a repo-relative path against the exclude list (bash 3.2 safe)
excluded() {
  while IFS= read -r pre; do
    [ -n "$pre" ] || continue
    case "$1" in
      "$pre"*) return 0 ;;
    esac
  done < "$EXCL"
  return 1
}

cd "$PROJ"
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)
HEAD=$(git rev-parse HEAD 2>/dev/null || echo none)
printf '%s\n' "$PROJ"   > "$OUT/meta/project-path"
printf '%s\n' "$BRANCH" > "$OUT/meta/branch"
printf '%s\n' "$HEAD"   > "$OUT/meta/head"
(claude --version 2>/dev/null || echo unknown) | head -1 > "$OUT/meta/claude-version"

# 1. all branches + tags
git bundle create "$OUT/repo.bundle" --all >/dev/null 2>&1

# 2. dirty + untracked (gitignored excluded); record deletions separately
git ls-files -mo --exclude-standard > "$OUT/dirty-files.txt.all"
git ls-files -d > "$OUT/deleted-files.txt" || true
# a modified-then-deleted file shows up in -m too; tar would abort on it
: > "$OUT/dirty-files.txt"
while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ -e "$f" ] || continue
  if excluded "$f"; then continue; fi
  printf '%s\n' "$f" >> "$OUT/dirty-files.txt"
done < "$OUT/dirty-files.txt.all"
rm -f "$OUT/dirty-files.txt.all"
if [ -s "$OUT/dirty-files.txt" ]; then
  tar czf "$OUT/dirty.tar.gz" -T "$OUT/dirty-files.txt"
else
  tar czf "$OUT/dirty.tar.gz" --files-from /dev/null
fi
# three largest dirty files, for the consent screen (name + bytes)
if [ -s "$OUT/dirty-files.txt" ]; then
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    sz=$(wc -c < "$f" 2>/dev/null | tr -d ' ')
    [ -n "$sz" ] || sz=0
    printf '%s\t%s\n' "$sz" "$f"
  done < "$OUT/dirty-files.txt" | sort -rn | head -3 > "$OUT/meta/largest-dirty.txt" || true
else
  : > "$OUT/meta/largest-dirty.txt"
fi

# 3. Claude Code session transcript for this cwd — exactly one.
#    Slug = absolute path with '/' and '.' replaced by '-'. Some CLI versions
#    slug slightly differently, so prefer an existing directory if one matches.
SLUG=""
for cand in \
  "$(printf '%s' "$PROJ" | sed 's|[/.]|-|g')" \
  "$(printf '%s' "$PROJ" | sed 's|/|-|g')" \
  "$(printf '%s' "$PROJ" | sed 's|[^a-zA-Z0-9]|-|g')"; do
  if [ -d "$HOME/.claude/projects/$cand" ]; then SLUG="$cand"; break; fi
done
[ -n "$SLUG" ] || SLUG="$(printf '%s' "$PROJ" | sed 's|[/.]|-|g')"
printf '%s\n' "$SLUG" > "$OUT/meta/slug"
SESS_DIR="$HOME/.claude/projects/$SLUG"
if [ -d "$SESS_DIR" ]; then
  if [ -n "$SESSION" ] && [ -f "$SESS_DIR/$SESSION.jsonl" ]; then
    cp "$SESS_DIR/$SESSION.jsonl" "$OUT/sessions/"
  else
    NEWEST=$(ls -t "$SESS_DIR"/*.jsonl 2>/dev/null | head -1 || true)
    if [ -n "$NEWEST" ] && [ -f "$NEWEST" ]; then cp "$NEWEST" "$OUT/sessions/"; fi
  fi
fi

# 4. project config
if [ -e .claude ] || [ -e CLAUDE.md ]; then
  tar czf "$OUT/project-config.tar.gz" \
    --exclude '.claude/worktrees' \
    $([ -e .claude ] && echo .claude) $([ -e CLAUDE.md ] && echo CLAUDE.md) 2>/dev/null || true
fi

# 5. required env var NAMES, derived declaratively — never values, never the shell env.
COMPOSE_FILE="$(printenv STEPAWAY_COMPOSE_FILE 2>/dev/null || true)"
if [ -z "$COMPOSE_FILE" ] || [ ! -f "$COMPOSE_FILE" ]; then
  COMPOSE_FILE=""
  for f in compose.yaml compose.yml docker-compose.yml docker-compose.yaml; do
    [ -f "$f" ] && COMPOSE_FILE="$f" && break
  done
fi
printf '%s\n' "$COMPOSE_FILE" > "$OUT/meta/compose-file"

: > "$OUT/meta/required-vars.raw"
: > "$OUT/meta/declared-env-files.raw"

# names from compose interpolation (dollar-brace VAR references)
if [ -n "$COMPOSE_FILE" ] && command -v docker >/dev/null 2>&1; then
  docker compose -f "$COMPOSE_FILE" config --variables 2>/dev/null \
    | awk 'NR>1{print $1}' >> "$OUT/meta/required-vars.raw" || true
fi

# fallback: literal dollar-brace references in the compose file
if [ -n "$COMPOSE_FILE" ]; then
  grep -oE '\$\{[A-Za-z_][A-Za-z0-9_]*' "$COMPOSE_FILE" 2>/dev/null \
    | sed 's/^\${//' >> "$OUT/meta/required-vars.raw" || true
fi

# names from env_file: entries (docker compose config --variables omits these)
if [ -n "$COMPOSE_FILE" ]; then
  awk '
      /^[[:space:]]*env_file:/ {
        line=$0
        sub(/^[^:]*:/,"",line)
        gsub(/[][]/,"",line); gsub(/,/," ",line)
        gsub(/"/,"",line); gsub(/'"'"'/,"",line)
        if (line ~ /[^[:space:]]/) { print line; next }
        inlist=1; next
      }
      inlist && /^[[:space:]]*-[[:space:]]*/ {
        line=$0
        sub(/^[[:space:]]*-[[:space:]]*/,"",line)
        gsub(/"/,"",line); gsub(/'"'"'/,"",line)
        print line; next
      }
      { inlist=0 }
    ' "$COMPOSE_FILE" | tr -s ' \t' '\n' | sed '/^$/d' > "$OUT/meta/env-files.raw" || true
  while IFS= read -r ef; do
    [ -n "$ef" ] && [ -f "$ef" ] || continue
    printf '%s\n' "$ef" >> "$OUT/meta/declared-env-files.raw"
    sed 's/#.*//' "$ef" | grep -E '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=' \
      | sed 's/=.*//; s/^[[:space:]]*//; s/[[:space:]]*$//; s/^export[[:space:]]*//' \
      >> "$OUT/meta/required-vars.raw" || true
  done < "$OUT/meta/env-files.raw"
  rm -f "$OUT/meta/env-files.raw"
fi

# names declared in .env.example (a declaration, not a captured value)
if [ -f .env.example ]; then
  sed 's/#.*//' .env.example | grep -E '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=' \
    | sed 's/=.*//; s/^[[:space:]]*//; s/[[:space:]]*$//; s/^export[[:space:]]*//' \
    >> "$OUT/meta/required-vars.raw" || true
fi

sort -u "$OUT/meta/required-vars.raw" | sed '/^$/d' > "$OUT/meta/required-vars.txt"
rm -f "$OUT/meta/required-vars.raw"

# 6. gitignored env files: candidates for the value carry (names only here).
{ git ls-files -o -i --exclude-standard \
  | grep -E '(^|/)(\.env(\..*)?$|[^/]*\.env)$' || true; } >> "$OUT/meta/declared-env-files.raw"

# compose says "./apps/web/.env", git ls-files says "apps/web/.env": same file.
# Normalise before sort -u or the picker shows (and carries) it twice.
: > "$OUT/meta/declared-env-files.txt"
sed -e 's|^\./||' -e 's|//*|/|g' "$OUT/meta/declared-env-files.raw" \
  | sort -u | sed '/^$/d' | while IFS= read -r f; do
  [ -f "$f" ] || continue
  case "$f" in
    *.env.example|.env.example) continue ;;
  esac
  if excluded "$f"; then continue; fi
  printf '%s\n' "$f" >> "$OUT/meta/declared-env-files.txt"
done
rm -f "$OUT/meta/declared-env-files.raw"

git ls-files -o -i --exclude-standard | wc -l | tr -d ' ' > "$OUT/meta/ignored-count"

echo "captured -> $OUT"
`;
