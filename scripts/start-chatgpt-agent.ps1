$ErrorActionPreference = 'Stop'
foreach ($settingName in @('HARDFIRE_CONTROL_URL','HARDFIRE_CONTROL_TOKEN','CF_CONTROL_URL','CF_CONTROL_TOKEN','HARDFIRE_APP_PATH')) {
    $persistedValue = [Environment]::GetEnvironmentVariable($settingName, 'User')
    if ($persistedValue) { [Environment]::SetEnvironmentVariable($settingName, $persistedValue, 'Process') }
}
$agentSource = Join-Path $PSScriptRoot 'hardfire-chatgpt-agent.cjs'
$runtimeDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) '.runtime'
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
$nodePath = (Get-Command node -ErrorAction Stop).Source
$agentProcess = Start-Process -FilePath $nodePath -ArgumentList ('"' + $agentSource + '"') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDirectory 'chatgpt-agent.stdout.log') -RedirectStandardError (Join-Path $runtimeDirectory 'chatgpt-agent.log')
Write-Output ('HardFire ChatGPT agent process: ' + $agentProcess.Id)
