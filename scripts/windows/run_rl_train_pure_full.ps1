$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $root

$episodes = $env:RL_EPISODES
if (-not $episodes) { $episodes = '50' }

$seed = $env:RL_SEED
if (-not $seed) { $seed = '42' }

$outputMetrics = $env:RL_METRICS_OUT
if (-not $outputMetrics) { $outputMetrics = 'rl_metrics_pure_full.json' }

$outputHistory = $env:RL_HISTORY_OUT
if (-not $outputHistory) { $outputHistory = 'rl_history_pure_full.pkl' }

$checkpointPath = $env:RL_CHECKPOINT_PATH
if (-not $checkpointPath) { $checkpointPath = 'best_rl_agent_pure_full.pt' }

Write-Host '========================================'
Write-Host ' RL Full Pure Training'
Write-Host '========================================'
Write-Host " Episodes: $episodes"
Write-Host " Seed: $seed"
Write-Host " Metrics: $outputMetrics"
Write-Host " History: $outputHistory"
Write-Host " Checkpoint: $checkpointPath"
Write-Host '========================================'

$cmd = @(
    'docker', 'compose', 'exec', '-T', 'ai-core', 'python', '-m', 'scripts.run_rl_train_pure_full'
)

& $cmd[0] $cmd[1..($cmd.Length - 1)]
if ($LASTEXITCODE -ne 0) {
    throw "RL full pure training failed with exit code $LASTEXITCODE"
}

Write-Host '========================================'
Write-Host ' RL Full Pure Training Done'
Write-Host '========================================'
