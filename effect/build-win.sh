#!/bin/bash
# Cross-compiles the Windows x64 Page Turn Pro (.aex) on macOS or Linux with MinGW-w64.
#   ./effect/build-win.sh /path/to/AfterEffectsSDK
# Needs CMake, Python 3 and MinGW-w64 (brew install mingw-w64, or apt install mingw-w64).
# Copy build-win/PageTurnPro.aex to the Windows PC, into
#   C:\Program Files\Adobe\Adobe After Effects 20xx\Support Files\Plug-ins\PageTurnPro\
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

cmake -S "$here" -B "$here/build-win" -DAE_SDK="$examples" -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_TOOLCHAIN_FILE="$here/win/mingw-w64.cmake"
cmake --build "$here/build-win" --config Release --target PageTurnPro
echo "Built $here/build-win/PageTurnPro.aex"
