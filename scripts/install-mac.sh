#!/usr/bin/env bash
# Installs the Claude Bridge panel for After Effects and the ae-mcp server on macOS.
# Re-running is safe.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
EXT_ROOT="$HOME/Library/Application Support/Adobe/CEP/extensions"
EXT_LINK="$EXT_ROOT/com.aemcp.bridge"

echo "1/3  Linking the panel into $EXT_ROOT"
mkdir -p "$EXT_ROOT"
ln -sfn "$REPO/extension" "$EXT_LINK"

echo "2/3  Allowing unsigned CEP extensions (PlayerDebugMode)"
for v in 11 12 13; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1
done

echo "3/3  Installing MCP server dependencies"
(cd "$REPO/server" && npm install --omit=dev --no-audit --no-fund)

NODE="$(command -v node)"
SERVER="$REPO/server/src/index.js"
cat <<MSG

Done. Next steps:

  1. Restart After Effects, then open Window > Extensions > Claude Bridge.
     The panel should show a green dot and "Claude 연결 대기 중".

  2. Register the MCP server with Claude:

     Claude Code:
       claude mcp add after-effects -- "$NODE" "$SERVER"

     Claude Desktop (~/Library/Application Support/Claude/claude_desktop_config.json):
       "mcpServers": {
         "after-effects": { "command": "$NODE", "args": ["$SERVER"] }
       }

  Optional: add  "env": { "AE_MCP_ALLOW_RUN_JSX": "1" }  to enable the ae_run_jsx tool.
MSG
