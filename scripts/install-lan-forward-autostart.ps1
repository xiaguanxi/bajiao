<#
.SYNOPSIS
    安装开机自启任务，使 http://192.168.31.24:8787/ 在每次开机后自动生效。

.DESCRIPTION
    注册一个计划任务，以 SYSTEM 身份在系统启动时延迟 60 秒执行
    ensure-lan-forward.ps1。
    延迟是因为 DHCP 地址需要时间分配，等 IP 就绪再绑定才能可靠生效。

.PARAMETER Uninstall
    移除已安装的计划任务。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\install-lan-forward-autostart.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\install-lan-forward-autostart.ps1 -Uninstall
#>
[CmdletBinding()]
param(
    [switch]$Uninstall,
    [int]$Port = 8787
)

$ErrorActionPreference = 'Stop'
$TaskName = "Bajiao-LanForward-$Port"
# Retain the old name only to migrate or uninstall an existing task.
$LegacyTaskName = 'Vocast-LanForward-8787'
$scriptPath = Join-Path $PSScriptRoot 'ensure-lan-forward.ps1'

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal $id).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
    Write-Host "[lan-forward][ERROR] 需要管理员权限。" -ForegroundColor Red
    Write-Host ""
    Write-Host "  右键开始菜单 -> PowerShell(管理员) -> 执行："
    Write-Host "  powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit 1
}

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $LegacyTaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "[lan-forward][OK] 已移除计划任务 $TaskName" -ForegroundColor Green
    exit 0
}

if (-not (Test-Path $scriptPath)) {
    Write-Host "[lan-forward][ERROR] 找不到 $scriptPath" -ForegroundColor Red
    exit 1
}

# SYSTEM 权限 + 最高权限，确保能改 netsh 和防火墙
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
# 开机后延迟 60 秒，给 DHCP 分配地址留出时间
$trigger  = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = 'PT60S'
$action   = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`" -Port $Port"

Register-ScheduledTask -TaskName $TaskName `
    -Action $action -Trigger $trigger -Principal $principal `
    -Description "确保 ${Port} 端口的局域网转发在开机后自动生效" `
    -Force | Out-Null

# Remove the previous task only after its replacement was registered successfully.
Unregister-ScheduledTask -TaskName $LegacyTaskName -Confirm:$false -ErrorAction SilentlyContinue

Write-Host "[lan-forward][OK] 已安装计划任务 $TaskName（SYSTEM，开机后 60 秒执行）" -ForegroundColor Green
Write-Host ""
Write-Host "现在立即执行一次修复："
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$scriptPath`" -Port $Port"
Write-Host ""
Write-Host "卸载："
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Uninstall"
