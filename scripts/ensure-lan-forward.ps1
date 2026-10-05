<#
.SYNOPSIS
    确保 http://192.168.31.24:8787/ 等价于 http://127.0.0.1:8787/，且重启后自动生效。

.DESCRIPTION
    背景：本机 192.168.31.24 由路由器 DHCP 固定分配。
    netsh interface portproxy 的监听由 IP Helper (iphlpsvc) 在服务启动时读取
    注册表创建，而 iphlpsvc 启动早于 WLAN 拿到 DHCP 地址，绑定会静默失败。
    表现是：注册表里规则还在，但 192.168.31.24:8787 上没有任何 socket 监听。

    本脚本：
      1. 轮询等待目标 IPv4 真正出现在网卡上（解决开机时序问题）
      2. 删除并重建 portproxy 规则，强制 IP Helper 重新绑定
      3. 确保防火墙入站规则存在（局域网其他机器可访问）
      4. 校验监听是否真的建立，失败则重启 iphlpsvc 再试

.PARAMETER ListenIp
    要暴露的局域网地址。默认自动探测本机 WLAN 的 IPv4。

.PARAMETER Port
    端口，默认 8787。

.PARAMETER TargetIp
    后端地址，默认 127.0.0.1。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\ensure-lan-forward.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\ensure-lan-forward.ps1 -Port 9000
#>
[CmdletBinding()]
param(
    [string]$ListenIp,
    [int]$Port = 8787,
    [string]$TargetIp = '127.0.0.1'
)

$ErrorActionPreference = 'Stop'
$TimeoutSec = 90

function Write-Step { param([string]$Message) Write-Host "[lan-forward] $Message" }
function Write-Fail { param([string]$Message) Write-Host "[lan-forward][ERROR] $Message" -ForegroundColor Red }
function Write-Ok   { param([string]$Message) Write-Host "[lan-forward][OK] $Message" -ForegroundColor Green }

# 需要管理员权限：netsh portproxy 与防火墙规则都在 HKLM
function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal $id).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

# 检查指定 IP 是否已经绑定到某块网卡
function Test-IpReady {
    param([string]$Ip)
    # 必须用 @() 强制成数组：PS 5.1 下单个 CIM 对象的 .Count 返回 $null
    $addrs = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
               Where-Object { $_.IPAddress -eq $Ip })
    return ($addrs.Count -gt 0)
}

# 探测本机局域网 IPv4：优先非回环、非 169.254、非虚拟网卡的地址
function Get-LanIPv4 {
    $candidates = @(Get-NetIPConfiguration -ErrorAction SilentlyContinue |
        Where-Object { $_.NetAdapter.Status -eq 'Up' -and $_.IPv4Address } |
        ForEach-Object { $_.IPv4Address.IPAddress } |
        Where-Object {
            $_ -and $_ -notlike '127.*' -and $_ -notlike '169.254.*' -and $_ -notlike '198.18.*'
        } | Sort-Object -Unique)
    return $candidates | Select-Object -First 1
}

# portproxy 规则是否已按预期存在
function Test-Rule {
    param([string]$Ip, [int]$P)
    $rows = netsh interface portproxy show all | Out-String
    return $rows -match [regex]::Escape("$Ip") -and $rows -match [regex]::Escape("$P")
}

# 192.168.31.24:P 上是否存在 LISTENING 套接字
function Test-Listening {
    param([string]$Ip, [int]$P)
    $hit = netstat -ano -p tcp | Select-String -SimpleMatch "${Ip}:${P}"
    return [bool]($hit | Where-Object { $_ -match 'LISTENING' })
}

# ---------------------------------------------------------------- 主流程

if (-not (Test-Admin)) {
    Write-Fail "需要管理员权限。请以管理员身份运行 PowerShell 后重试。"
    Write-Host ""
    Write-Host "  右键开始菜单 -> PowerShell(管理员) -> 执行："
    Write-Host "  powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit 1
}

if (-not $ListenIp) { $ListenIp = Get-LanIPv4 }
if (-not $ListenIp) {
    Write-Fail "未能自动探测到局域网 IPv4，请用 -ListenIp 显式指定。"
    exit 1
}
Write-Step "监听地址 $ListenIp ，后端 ${TargetIp}:$Port"

# --- 1. 等待网卡拿到 IP（开机时序问题的核心修复）---
Write-Step "等待 $ListenIp 就绪..."
$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
    if (Test-IpReady -Ip $ListenIp) { break }
    Start-Sleep -Seconds 2
}
if (-not (Test-IpReady -Ip $ListenIp)) {
    Write-Fail "等待 ${ListenIp} 超时（${TimeoutSec}s）。请确认 WLAN 已连接。"
    exit 1
}
Write-Ok "IPv4 已就绪"

# --- 2. 确保 IP Helper 运行 ---
$svc = Get-Service iphlpsvc -ErrorAction SilentlyContinue
if (-not $svc) {
    Write-Fail "找不到 IP Helper (iphlpsvc) 服务，portproxy 不可用。"
    exit 1
}
if ($svc.StartType -eq 'Disabled') {
    Set-Service iphlpsvc -StartupType Automatic
    Write-Ok "iphlpsvc 启动类型设为 Automatic"
}
if ($svc.Status -ne 'Running') { Start-Service iphlpsvc }
Write-Ok "iphlpsvc 运行中（$($svc.StartType)）"

# --- 3. 重建 portproxy 规则（先删后加，强制重新绑定）---
netsh interface portproxy delete v4tov4 `
    listenaddress=$ListenIp listenport=$Port | Out-Null
netsh interface portproxy add v4tov4 `
    listenaddress=$ListenIp listenport=$Port `
    connectaddress=$TargetIp connectport=$Port | Out-Null
Write-Ok "portproxy 规则已写入: ${ListenIp}:${Port} -> ${TargetIp}:${Port}"

# 规则写入后 IP Helper 不会立刻建监听，给它一点时间
Start-Sleep -Seconds 2

# --- 4. 确保监听真的建立，否则重启 IP Helper ---
if (-not (Test-Listening -Ip $ListenIp -P $Port)) {
    Write-Step "监听尚未建立，重启 iphlpsvc ..."
    Restart-Service iphlpsvc -Force
    Start-Sleep -Seconds 3
}
if (Test-Listening -Ip $ListenIp -P $Port) {
    Write-Ok "监听已建立: ${ListenIp}:${Port}"
} else {
    Write-Fail "监听仍未建立。请检查其他程序是否占用了 ${ListenIp}:${Port}。"
    exit 1
}

# --- 5. 防火墙入站放行（局域网其他机器要能访问）---
$ruleName = "lan-forward $ListenIp`:$Port"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound `
        -Action Allow -Protocol TCP -LocalPort $Port `
        -Profile Any -RemoteAddress LocalSubnet | Out-Null
    Write-Ok "防火墙入站规则已创建（仅限 LocalSubnet）"
} else {
    Write-Ok "防火墙入站规则已存在"
}

# --- 6. 后端存活校验 ---
try {
    $null = Invoke-WebRequest -Uri "http://${TargetIp}:$Port/" -TimeoutSec 5 -UseBasicParsing
    Write-Ok "后端 http://${TargetIp}:$Port/ 响应正常"
} catch {
    Write-Step "后端 http://${TargetIp}:$Port/ 当前无响应（$($_.Exception.Message)）。"
    Write-Step "转发规则已就绪，等服务起来后即可访问。"
}

Write-Host ""
Write-Ok "完成。现在局域网内可用 http://${ListenIp}:$Port/ 访问，重启后自动生效。"
