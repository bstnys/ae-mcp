#!/usr/bin/env bash
# Installs the AE Tetris panel for After Effects on macOS. Re-running is safe.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)/extension"
EXT_ROOT="$HOME/Library/Application Support/Adobe/CEP/extensions"
DEST="$EXT_ROOT/com.aemcp.tetris"

echo "1/2  Copying the panel to $DEST"
mkdir -p "$EXT_ROOT"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"

echo "2/2  Allowing unsigned CEP extensions (PlayerDebugMode)"
for v in 9 10 11 12 13; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1
done

echo
echo "Done. Restart After Effects, then open Window > Extensions > AE Tetris."
