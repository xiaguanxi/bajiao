#Requires -RunAsAdministrator
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
# Enable only the Windows Hypervisor Platform needed by Android Emulator.
# The user restarts Windows manually after saving other work.
$feature=Get-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform
if($feature.State -ne 'Enabled') {
    Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -All -NoRestart | Out-Host
}
& bcdedit.exe /set hypervisorlaunchtype auto
if($LASTEXITCODE -ne 0) { throw 'Failed to enable the hypervisor at Windows startup.' }
Write-Host 'Windows Hypervisor Platform is enabled. Save your work and restart Windows manually.'
Write-Host 'After restarting, return to the 芭蕉 chat to continue actual emulator click testing.'
