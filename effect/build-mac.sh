#!/bin/bash
# Builds Page Turn Pro and installs it into After Effects' Plug-ins folder.
#   ./effect/build-mac.sh /path/to/AfterEffectsSDK      (the folder you unzipped from Adobe)
# Needs Xcode command line tools (xcode-select --install) and CMake (brew install cmake).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
sdk_root="${1:-${AE_SDK_ROOT:-}}"
if [ -z "$sdk_root" ]; then
  echo "Usage: $0 /path/to/AfterEffectsSDK" >&2
  exit 1
fi
header="$(find "$sdk_root" -path '*/Examples/Headers/AE_Effect.h' -print -quit)"
if [ -z "$header" ]; then
  echo "Could not find Examples/Headers/AE_Effect.h under $sdk_root" >&2
  exit 1
fi
examples="$(dirname "$(dirname "$header")")"
echo "SDK: $examples"

cmake -S "$here" -B "$here/build" -DAE_SDK="$examples" -DCMAKE_BUILD_TYPE=Release
cmake --build "$here/build" --config Release --target PageTurnPro

bundle="$here/build/PageTurnPro.plugin"
ae_app="$(ls -d /Applications/Adobe\ After\ Effects\ 20* 2>/dev/null | sort | tail -1)"
if [ -n "$ae_app" ]; then
  dest="$ae_app/Plug-ins/PageTurnPro"
  mkdir -p "$dest"
  rm -rf "$dest/PageTurnPro.plugin"
  cp -R "$bundle" "$dest/"
  echo "Installed to $dest. Restart After Effects; the effect is under Effect > Distort > Page Turn Pro."
else
  echo "Built $bundle. Copy it into your After Effects Plug-ins folder."
fi
