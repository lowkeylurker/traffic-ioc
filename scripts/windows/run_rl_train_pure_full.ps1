param(
    [ValidateSet('fast', 'balanced', 'full')]
    [string]$Preset = 'full'
)

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

$useGpu = $env:RL_USE_GPU
if (-not $useGpu) { $useGpu = '0' }

$rlDevice = $env:RL_DEVICE
if (-not $rlDevice) {
    if ($useGpu -eq '1') { $rlDevice = 'cuda' } else { $rlDevice = 'auto' }
}

$env:RL_DEVICE = $rlDevice

Write-Host '========================================'
Write-Host ' RL Full Pure Training'
Write-Host '========================================'
Write-Host " Profile: $Preset"
Write-Host " Episodes: $episodes"
Write-Host " Seed: $seed"
Write-Host " Metrics: $outputMetrics"
Write-Host " History: $outputHistory"
Write-Host " Checkpoint: $checkpointPath"
Write-Host " Use GPU: $useGpu"
Write-Host " RL_DEVICE: $rlDevice"
Write-Host '========================================'

$rlEnvNames = @(
    'RL_MODE',
    'RL_RUN_ID',
    'RL_START_DATE',
    'RL_END_DATE',
    'RL_CORRIDOR_IDS',
    'RL_PEAK_HOURS_ONLY',
    'RL_MAX_SEGMENTS',
    'RL_EVAL_RATIO',
    'RL_SEED',
    'RL_EPISODES',
    'RL_MAX_STEPS_PER_EPISODE',
    'RL_BATCH_SIZE',
    'RL_WINDOW_SIZE',
    'RL_GAMMA',
    'RL_EPSILON_START',
    'RL_EPSILON_MIN',
    'RL_EPSILON_DECAY',
    'RL_LEARNING_RATE',
    'RL_REPLAY_CAPACITY',
    'RL_WARMUP_STEPS',
    'RL_TARGET_UPDATE',
    'RL_USE_DOUBLE_DQN',
    'RL_USE_CLASS_AWARE_REWARD',
    'RL_REWARD_SCALE',
    'RL_REWARD_CLIP',
    'RL_EARLY_STOP_PATIENCE',
    'RL_EARLY_STOP_MIN_DELTA',
    'RL_EARLY_STOP_EVAL_INTERVAL',
    'RL_EARLY_STOP_WARMUP_EPISODES',
    'RL_DEVICE',
    'RL_CHECKPOINT_PATH',
    'RL_HISTORY_OUT',
    'RL_METRICS_OUT',
    'RL_ARTIFACTS_PATH',
    'RL_PRETRAINED_MODEL_PATH',
    'RL_PURE_ARTIFACTS_PATH'
)

$envArgs = @()
foreach ($name in $rlEnvNames) {
    $val = [Environment]::GetEnvironmentVariable($name)
    if ($null -ne $val -and $val -ne '') {
        $envArgs += @('-e', "$name=$val")
    }
}

$cmd = @()
if ($useGpu -eq '1') {
    $cmd = @(
        'docker', 'compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.gpu.yml', 'run', '--rm'
    )
    $cmd += $envArgs
    $cmd += @('ai-core', 'python', '-m', 'scripts.run_rl_train_pure', '--profile', $Preset, '--device', $rlDevice)
}
else {
    $cmd = @(
        'docker', 'compose', 'exec', '-T'
    )
    $cmd += $envArgs
    $cmd += @('ai-core', 'python', '-m', 'scripts.run_rl_train_pure', '--profile', $Preset, '--device', $rlDevice)
}

& $cmd[0] $cmd[1..($cmd.Length - 1)]
if ($LASTEXITCODE -ne 0) {
    throw "RL full pure training failed with exit code $LASTEXITCODE"
}

Write-Host '========================================'
Write-Host ' RL Full Pure Training Done'
Write-Host '========================================'
