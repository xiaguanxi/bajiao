$ErrorActionPreference='Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$taskJdk=(Get-ChildItem .tools -Directory -Filter 'jdk-*' | Select-Object -First 1).FullName
$taskClasses=Join-Path (Get-Location) 'artifacts/device-e2e/touch-classes'
$taskDex=Join-Path (Get-Location) 'artifacts/device-e2e/touch-dex'
New-Item -ItemType Directory -Path $taskClasses,$taskDex -Force | Out-Null
& "$taskJdk/bin/javac.exe" -cp '.tools/android-sdk/platforms/android-35/android.jar' -d $taskClasses 'tests/DeviceTouch.java'
if($LASTEXITCODE -ne 0){throw 'Touch helper compilation failed'}
$env:JAVA_HOME=$taskJdk
& '.tools/android-sdk/build-tools/35.0.0/d8.bat' --min-api 26 --lib '.tools/android-sdk/platforms/android-35/android.jar' --output $taskDex "$taskClasses/DeviceTouch.class"
if($LASTEXITCODE -ne 0){throw 'Touch helper dex build failed'}
& '.tools/android-sdk/platform-tools/adb.exe' push "$taskDex/classes.dex" '/data/local/tmp/vocast-touch.dex'
if($LASTEXITCODE -ne 0){throw 'Touch helper installation failed'}
