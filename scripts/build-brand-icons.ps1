$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'build-brand-icons.cjs')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
