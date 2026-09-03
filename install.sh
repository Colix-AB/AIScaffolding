#!/usr/bin/env bash
# Copy the AIScaffolding template into a target repository.
#
#   ./install.sh /path/to/your/repo
#
# Existing files are never overwritten: a conflicting file is written alongside
# with a .aiscaffolding-new suffix so you can diff and merge it yourself.

set -euo pipefail

TARGET="${1:-}"
SRC="$(cd "$(dirname "$0")" && pwd)/template"

if [ -z "$TARGET" ]; then
  echo "usage: $0 /path/to/your/repo" >&2
  exit 2
fi

if [ ! -d "$TARGET" ]; then
  echo "error: $TARGET is not a directory" >&2
  exit 1
fi

if [ ! -d "$TARGET/.git" ]; then
  echo "warning: $TARGET does not look like a git repository (no .git)" >&2
fi

copied=0
skipped=0

copy_one() {
  local rel="$1"
  local from="$SRC/$rel"
  local to="$TARGET/$rel"

  mkdir -p "$(dirname "$to")"

  if [ -e "$to" ]; then
    cp "$from" "$to.aiscaffolding-new"
    echo "  exists, wrote alongside: $rel.aiscaffolding-new"
    skipped=$((skipped + 1))
  else
    cp "$from" "$to"
    echo "  + $rel"
    copied=$((copied + 1))
  fi
}

echo "Installing AIScaffolding into $TARGET"
echo

cd "$SRC"
while IFS= read -r rel; do
  copy_one "${rel#./}"
done < <(find . -type f ! -name ".DS_Store" | sort)

echo
echo "Copied $copied file(s), $skipped already existed."
echo
cat <<'NEXT'
Next steps (see docs/customizing.md):

  1. Create the issue labels:            docs/issue-tracking.md
  2. Find every decision to make:        grep -rn "<[A-Z]" CLAUDE.md .claude/skills/
  3. Rewrite for your stack:             .claude/skills/stack-conventions/SKILL.md
  4. Delete the gates that don't apply:  CLAUDE.md §8 (single host), the flag skills
  5. Add to .gitignore:                  .worktrees/  and  .claude/dev-notes/
  6. Try it:                             "create an issue for <something small>", then "ship #<N>"
NEXT
