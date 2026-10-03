param([string]$Script = 'tests/live.cjs')
$ErrorActionPreference = 'Stop'
foreach ($keyName in @('MINIMAX_KEY','MIMO_KEY')) {
    $keyValue = [Environment]::GetEnvironmentVariable($keyName,'Process')
    if (-not $keyValue) { $keyValue = [Environment]::GetEnvironmentVariable($keyName,'User') }
    if (-not $keyValue) { $keyValue = [Environment]::GetEnvironmentVariable($keyName,'Machine') }
    if (-not $keyValue) { throw "$keyName is not configured" }
    [Environment]::SetEnvironmentVariable($keyName,$keyValue,'Process')
}
try { & node $Script; exit $LASTEXITCODE } finally {
    [Environment]::SetEnvironmentVariable('MINIMAX_KEY',$null,'Process')
    [Environment]::SetEnvironmentVariable('MIMO_KEY',$null,'Process')
}
