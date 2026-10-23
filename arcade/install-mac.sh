#!/usr/bin/env bash
# Installs the AE Arcade panel (Tetris, Breakout) for After Effects on macOS. Re-running is safe.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)/extension"
EXT_ROOT="$HOME/Library/Application Support/Adobe/CEP/extensions"
DEST="$EXT_ROOT/com.aemcp.arcade"

echo "1/2  Copying the panel to $DEST"
mkdir -p "$EXT_ROOT"
rm -rf "$DEST" "$EXT_ROOT/com.aemcp.tetris"   # the older Tetris-only panel is replaced by this one
cp -R "$SRC" "$DEST"

echo "2/2  Allowing unsigned CEP extensions (PlayerDebugMode)"
for v in 9 10 11 12 13; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1
done

echo
echo "Done. Restart After Effects, then open Window > Extensions > AE Arcade."
