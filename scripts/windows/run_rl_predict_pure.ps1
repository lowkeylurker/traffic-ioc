$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $root

$modelPath = $env:RL_MODEL_PATH
if (-not $modelPath) { $modelPath = 'best_rl_agent_pure_full.pt' }

$artifactsPath = $env:RL_ARTIFACTS_PATH
if (-not $artifactsPath) { $artifactsPath = 'rl_pure_preprocessing_artifacts_full.pkl' }

$requestTime = $env:RL_REQUEST_TIME
if (-not $requestTime) { $requestTime = '2026-04-07 18:00:00' }

$segmentIds = $env:RL_SEGMENT_IDS
if (-not $segmentIds) { $segmentIds = '857844920435081278' }

Write-Host '========================================'
Write-Host ' RL Pure Prediction Demo'
Write-Host '========================================'
Write-Host " Model: $modelPath"
Write-Host " Artifacts: $artifactsPath"
Write-Host " Request time: $requestTime"
Write-Host " Segment IDs: $segmentIds"
Write-Host '========================================'

$cmd = @(
    'docker', 'compose', 'exec', '-T', 'ai-core', 'python', '-m', 'scripts.run_rl_inference_demo'
)

& $cmd[0] $cmd[1..($cmd.Length - 1)]
if ($LASTEXITCODE -ne 0) {
    throw "RL pure prediction demo failed with exit code $LASTEXITCODE"
}

Write-Host '========================================'
Write-Host ' RL Pure Prediction Demo Done'
Write-Host '========================================'
