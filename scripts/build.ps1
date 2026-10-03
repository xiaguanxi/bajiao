param([switch]$Release)
$ErrorActionPreference='Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if (-not $env:JAVA_HOME) { $env:JAVA_HOME=(Get-ChildItem .tools -Directory -Filter 'jdk-*' | Select-Object -First 1).FullName }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME=Join-Path (Get-Location) '.tools/android-sdk' }
$gradle=Join-Path (Get-Location) '.tools/gradle-8.11.1/bin/gradle.bat'
$target=if($Release){'assembleRelease'}else{'assembleDebug'}
& $gradle $target lintDebug --console=plain
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (-not $Release) { Copy-Item app/build/outputs/apk/debug/app-debug.apk artifacts/Vocast-debug.apk -Force }
