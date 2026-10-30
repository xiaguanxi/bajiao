param([switch]$Visible)
$ErrorActionPreference='Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$env:ANDROID_HOME=(Resolve-Path .tools/android-sdk).Path
& .tools/android-sdk/emulator/emulator.exe -accel-check
if($LASTEXITCODE -ne 0) { throw 'Android hardware acceleration is unavailable. Enable Windows Hypervisor Platform and restart.' }
$emulatorArgs=@('-avd','BajiaoTest','-no-audio','-no-snapshot','-gpu','swiftshader_indirect','-feature','-Vulkan','-no-metrics')
if(-not $Visible){$emulatorArgs+= '-no-window'}
Start-Process -FilePath (Resolve-Path .tools/android-sdk/emulator/emulator.exe) -ArgumentList $emulatorArgs -WindowStyle Hidden -RedirectStandardOutput 'artifacts/emulator-e2e.log' -RedirectStandardError 'artifacts/emulator-e2e-errors.log'
