#!/usr/bin/env bash
# Binds a macOS App Shortcut to After Effects' "Claude Console" menu item
# (Window > Extensions > Claude Console). Restart After Effects afterwards.
#
# Usage: ./scripts/set-console-shortcut.sh [keys]
#   keys use macOS notation: ^ Ctrl, ~ Option, $ Shift, @ Cmd. Default: ^~c (Ctrl+Option+C)
#   Remove with: ./scripts/set-console-shortcut.sh --remove
set -euo pipefail

KEYS="${1:-^~c}"
found=0
for app in /Applications/Adobe\ After\ Effects*/Adobe\ After\ Effects*.app; do
  [ -d "$app" ] || continue
  case "$app" in *"Render Engine"*) continue ;; esac
  bid="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Contents/Info.plist")"
  if [ "$KEYS" = "--remove" ]; then
    defaults delete "$bid" NSUserKeyEquivalents 2>/dev/null || true
  else
    defaults write "$bid" NSUserKeyEquivalents -dict-add "Claude Console" "$KEYS"
  fi
  echo "  $(basename "$app") ($bid): $(defaults read "$bid" NSUserKeyEquivalents 2>/dev/null | tr -s ' \n' ' ')"
  found=1
done

if [ "$found" = 0 ]; then
  echo "After Effects was not found in /Applications." >&2
  echo "Set it by hand: System Settings > Keyboard > Keyboard Shortcuts > App Shortcuts > +," >&2
  echo "choose After Effects, menu title \"Claude Console\"." >&2
  exit 1
fi
