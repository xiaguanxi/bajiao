param()
$ErrorActionPreference='Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$env:ANDROID_HOME=(Resolve-Path .tools/android-sdk).Path
& .tools/android-sdk/emulator/emulator.exe -accel-check
if($LASTEXITCODE -ne 0) { throw 'Android hardware acceleration is unavailable. Enable Windows Hypervisor Platform and restart.' }
Start-Process -FilePath (Resolve-Path .tools/android-sdk/emulator/emulator.exe) -ArgumentList @('-avd','VocastTest','-no-audio','-no-snapshot','-gpu','software','-feature','-Vulkan') -WindowStyle Normal
