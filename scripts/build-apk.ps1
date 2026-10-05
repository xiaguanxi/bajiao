$taskJdk = (Get-ChildItem .tools -Directory -Filter 'jdk-*' | Select-Object -First 1).FullName
$env:JAVA_HOME = $taskJdk
$env:ANDROID_HOME = (Resolve-Path .tools/android-sdk).Path
.\gradlew.bat assembleDebug
if ($LASTEXITCODE -eq 0) {
    if (-not (Test-Path artifacts)) { New-Item -ItemType Directory -Path artifacts }
    Copy-Item app/build/outputs/apk/debug/app-debug.apk artifacts/Vocast-debug.apk -Force
    Write-Host 'SUCCESS: APK built and copied to artifacts/Vocast-debug.apk'
} else {
    Write-Host 'FAILED: assembleDebug failed with code' $LASTEXITCODE
}
