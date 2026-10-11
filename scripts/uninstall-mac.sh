#!/usr/bin/env bash
# Removes the Claude Bridge panel link and its config. Leaves PlayerDebugMode as is,
# since other extensions may rely on it (disable with: defaults delete com.adobe.CSXS.12 PlayerDebugMode).
set -euo pipefail
rm -f "$HOME/Library/Application Support/Adobe/CEP/extensions/com.aemcp.bridge"
rm -rf "$HOME/Library/Application Support/ae-mcp"
echo "Removed. Also remove the after-effects entry from your Claude MCP config."
