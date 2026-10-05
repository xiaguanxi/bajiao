Add-Type -AssemblyName System.IO.Compression.FileSystem
$ErrorActionPreference='Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$taskJdk=(Get-ChildItem .tools -Directory -Filter 'jdk-*' | Select-Object -First 1).FullName
$env:JAVA_HOME=$taskJdk
$taskSignature=& '.tools/android-sdk/build-tools/35.0.0/apksigner.bat' verify --verbose 'artifacts/Vocast-debug.apk'
if($LASTEXITCODE -ne 0){throw 'APK signature verification failed'}
$taskSignature | Set-Content 'artifacts/device-e2e/apk-signature.txt'
$taskArchive=[System.IO.Compression.ZipFile]::OpenRead((Resolve-Path 'artifacts/Vocast-debug.apk'))
$taskKeys=@{}
try{
 foreach($taskName in @('MINIMAX_KEY','MIMO_KEY')){
  $taskValue=[Environment]::GetEnvironmentVariable($taskName,'Process')
  if(-not $taskValue){$taskValue=[Environment]::GetEnvironmentVariable($taskName,'User')}
  if(-not $taskValue){$taskValue=[Environment]::GetEnvironmentVariable($taskName,'Machine')}
  if(-not $taskValue){throw 'Test key unavailable for APK scan'}
  $taskKeys[$taskName]=$taskValue
 }
 $taskCount=0
 foreach($taskEntry in $taskArchive.Entries){
  $taskStream=$taskEntry.Open();$taskMemory=New-Object System.IO.MemoryStream
  try{
   $taskStream.CopyTo($taskMemory)
   $taskText=[Text.Encoding]::UTF8.GetString($taskMemory.ToArray())
   foreach($taskName in $taskKeys.Keys){if($taskText.Contains($taskKeys[$taskName])){throw ('API key embedded: '+$taskName)}}
   $taskCount++
  }finally{$taskStream.Dispose();$taskMemory.Dispose()}
 }
 @{pass=$true;entriesScanned=$taskCount;plaintextApiKeysEmbedded=$false;apkSha256=(Get-FileHash 'artifacts/Vocast-debug.apk' -Algorithm SHA256).Hash.ToLower();signatureVerified=$true} | ConvertTo-Json | Set-Content 'artifacts/device-e2e/apk-key-scan.json'
 Write-Output 'PASS APK signature and embedded API key scan'
}finally{$taskArchive.Dispose();$taskKeys.Clear()}
