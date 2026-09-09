#!/usr/bin/env bash
# Keep the backend fork in step with upstream mesamirh/MovieBox-Tui.
#
# Upstream ships fast (weekly releases). Our fork adds the additive `server/`
# crate on top of upstream; merging upstream/main keeps provider scrapers and
# media handling current. Conflicts, when they occur, are limited to files we
# patched upstream — resolve them before pushing.
set -euo pipefail
cd "$(dirname "$0")/../MovieBox-Tui"

if ! git diff --quiet; then
  echo "MovieBox-Tui has uncommitted changes — commit or stash them first." >&2
  exit 1
fi

git fetch upstream main
LOCAL=$(git rev-parse origin/main)
UPSTREAM=$(git rev-parse upstream/main)
if [ "$LOCAL" = "$UPSTREAM" ]; then
  echo "Already up to date with upstream/main ($(git log -1 --oneline origin/main))."
  exit 0
fi

echo "Merging upstream/main:"
git log --oneline "$LOCAL..$UPSTREAM" | sed 's/^/  /'
git merge --no-edit upstream/main

echo
echo "Verify the backend still builds and passes:"
echo "  cd MovieBox-Tui/server && cargo check"
echo
echo "Then push the merged fork:"
echo "  cd MovieBox-Tui && git push origin main"
