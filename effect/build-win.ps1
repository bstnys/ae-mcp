# Builds Page Turn Pro for Windows x64 and installs it into After Effects.
#   powershell -ExecutionPolicy Bypass -File effect\build-win.ps1 C:\path\to\AfterEffectsSDK
# Needs Visual Studio 2019+ (or Build Tools) with "Desktop development with C++", CMake and Python 3.
param([Parameter(Mandatory = $true)][string]$SdkRoot)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$header = Get-ChildItem -Path $SdkRoot -Recurse -Filter AE_Effect.h -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '[\\/]Examples[\\/]Headers[\\/]AE_Effect\.h$' } | Select-Object -First 1
if (-not $header) { throw "Could not find Examples\Headers\AE_Effect.h under $SdkRoot" }
$examples = Split-Path -Parent (Split-Path -Parent $header.FullName)
Write-Host "SDK: $examples"

foreach ($tool in 'cmake', 'python') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is not on PATH" }
}

$build = Join-Path $here 'build-win'
cmake -S $here -B $build -A x64 "-DAE_SDK=$examples"
if ($LASTEXITCODE) { throw 'CMake configure failed' }
cmake --build $build --config Release --target PageTurnPro
if ($LASTEXITCODE) { throw 'Build failed' }
$aex = Join-Path $build 'Release\PageTurnPro.aex'
Write-Host "Built $aex"

$ae = Get-ChildItem 'C:\Program Files\Adobe' -Directory -Filter 'Adobe After Effects*' -ErrorAction SilentlyContinue |
    Sort-Object Name | Select-Object -Last 1
if (-not $ae) { Write-Host 'After Effects not found; copy the .aex into its Support Files\Plug-ins folder.'; exit 0 }
$dest = Join-Path $ae.FullName 'Support Files\Plug-ins\PageTurnPro'
# Program Files needs admin rights: copy from an elevated shell (one UAC prompt).
$cmd = "New-Item -ItemType Directory -Force -Path '$dest' | Out-Null; Copy-Item -Force '$aex' '$dest'"
Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile', '-Command', $cmd
if (Test-Path (Join-Path $dest 'PageTurnPro.aex')) {
    Write-Host "Installed to $dest. Restart After Effects; the effect is under Effect > Distort > Page Turn Pro."
} else {
    Write-Host "Copy $aex into $dest yourself (the copy did not happen)."
}
