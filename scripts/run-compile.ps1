
$taskJdk = (Get-ChildItem .tools -Directory -Filter 'jdk-*' | Select-Object -First 1).FullName
$env:JAVA_HOME = $taskJdk
$env:ANDROID_HOME = (Resolve-Path .tools/android-sdk).Path
.\gradlew.bat compileDebugJavaWithJavac

