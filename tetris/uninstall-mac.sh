#!/usr/bin/env bash
# Removes the AE Tetris panel. Leaves PlayerDebugMode as is, since other extensions may rely on it.
set -euo pipefail
rm -rf "$HOME/Library/Application Support/Adobe/CEP/extensions/com.aemcp.tetris"
echo "Removed. Restart After Effects."
