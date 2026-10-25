#!/usr/bin/env bash
# Copies the Hangul Typewriter panel into every installed After Effects' ScriptUI Panels folder.
# Re-running is safe. Restart After Effects afterwards, then open Window > HangulTypewriter.jsx.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO/hangul-typewriter/HangulTypewriter.jsx"
found=0

for app in /Applications/Adobe\ After\ Effects*/; do
  [ -d "$app/Scripts" ] || continue
  dest="$app/Scripts/ScriptUI Panels"
  found=1
  if mkdir -p "$dest" 2>/dev/null && cp "$SRC" "$dest/"; then
    echo "Installed: $dest/HangulTypewriter.jsx"
  else
    echo "Needs admin rights for $dest"
    sudo mkdir -p "$dest"
    sudo cp "$SRC" "$dest/"
    echo "Installed: $dest/HangulTypewriter.jsx"
  fi
done

if [ "$found" = 0 ]; then
  echo "After Effects not found in /Applications." >&2
  exit 1
fi
echo "Restart After Effects, then open Window > HangulTypewriter.jsx."
