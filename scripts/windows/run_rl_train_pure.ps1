param(
    [ValidateSet('fast', 'balanced', 'full')]
    [string]$TrainingPreset = 'balanced',
    [ValidateSet('0', '1')]
    [string]$UseGpu = '1'
)

$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $root

function Set-EnvDefault {
    param(
        [string]$Name,
        [string]$Value
    )
    if (-not (Get-Item -Path "Env:$Name" -ErrorAction SilentlyContinue)) {
        Set-Item -Path "Env:$Name" -Value $Value
    }
}

# Common defaults
Set-EnvDefault -Name 'RL_USE_GPU' -Value $UseGpu
if ($UseGpu -eq '1') {
    Set-EnvDefault -Name 'RL_DEVICE' -Value 'cuda'
}
else {
    Set-EnvDefault -Name 'RL_DEVICE' -Value 'cpu'
}
Set-EnvDefault -Name 'RL_SEED' -Value '42'
Set-EnvDefault -Name 'RL_EVAL_RATIO' -Value '0.2'
Set-EnvDefault -Name 'RL_USE_DOUBLE_DQN' -Value '1'
Set-EnvDefault -Name 'RL_USE_CLASS_AWARE_REWARD' -Value '1'
Set-EnvDefault -Name 'RL_REWARD_SCALE' -Value '1.0'
Set-EnvDefault -Name 'RL_REWARD_CLIP' -Value '25.0'

switch ($TrainingPreset) {
    'fast' {
        Set-EnvDefault -Name 'RL_RUN_ID' -Value 'pure_fast_gpu'
        Set-EnvDefault -Name 'RL_EPISODES' -Value '30'
        Set-EnvDefault -Name 'RL_MAX_STEPS_PER_EPISODE' -Value '4000'
        Set-EnvDefault -Name 'RL_MAX_SEGMENTS' -Value '80'
        Set-EnvDefault -Name 'RL_BATCH_SIZE' -Value '96'
        Set-EnvDefault -Name 'RL_EPSILON_START' -Value '1.0'
        Set-EnvDefault -Name 'RL_EPSILON_DECAY' -Value '0.985'
        Set-EnvDefault -Name 'RL_EPSILON_MIN' -Value '0.10'
        Set-EnvDefault -Name 'RL_LEARNING_RATE' -Value '0.0002'
        Set-EnvDefault -Name 'RL_REPLAY_CAPACITY' -Value '200000'
        Set-EnvDefault -Name 'RL_WARMUP_STEPS' -Value '5000'
        Set-EnvDefault -Name 'RL_TARGET_UPDATE' -Value '8'
        Set-EnvDefault -Name 'RL_EARLY_STOP_PATIENCE' -Value '5'
        Set-EnvDefault -Name 'RL_EARLY_STOP_EVAL_INTERVAL' -Value '3'
        Set-EnvDefault -Name 'RL_EARLY_STOP_WARMUP_EPISODES' -Value '10'
        Set-EnvDefault -Name 'RL_EARLY_STOP_MIN_DELTA' -Value '0.002'
    }
    'balanced' {
        Set-EnvDefault -Name 'RL_RUN_ID' -Value 'pure_balanced_gpu'
        Set-EnvDefault -Name 'RL_EPISODES' -Value '100'
        Set-EnvDefault -Name 'RL_MAX_STEPS_PER_EPISODE' -Value '6000'
        Set-EnvDefault -Name 'RL_MAX_SEGMENTS' -Value '0'
        Set-EnvDefault -Name 'RL_BATCH_SIZE' -Value '128'
        Set-EnvDefault -Name 'RL_EPSILON_START' -Value '1.0'
        Set-EnvDefault -Name 'RL_EPSILON_DECAY' -Value '0.98'
        Set-EnvDefault -Name 'RL_EPSILON_MIN' -Value '0.08'
        Set-EnvDefault -Name 'RL_LEARNING_RATE' -Value '0.00015'
        Set-EnvDefault -Name 'RL_REPLAY_CAPACITY' -Value '250000'
        Set-EnvDefault -Name 'RL_WARMUP_STEPS' -Value '8000'
        Set-EnvDefault -Name 'RL_TARGET_UPDATE' -Value '8'
        Set-EnvDefault -Name 'RL_EARLY_STOP_PATIENCE' -Value '8'
        Set-EnvDefault -Name 'RL_EARLY_STOP_EVAL_INTERVAL' -Value '2'
        Set-EnvDefault -Name 'RL_EARLY_STOP_WARMUP_EPISODES' -Value '20'
        Set-EnvDefault -Name 'RL_EARLY_STOP_MIN_DELTA' -Value '0.002'
    }
    'full' {
        Set-EnvDefault -Name 'RL_RUN_ID' -Value 'pure_full_gpu'
        Set-EnvDefault -Name 'RL_EPISODES' -Value '140'
        Set-EnvDefault -Name 'RL_MAX_STEPS_PER_EPISODE' -Value '8000'
        Set-EnvDefault -Name 'RL_MAX_SEGMENTS' -Value '0'
        Set-EnvDefault -Name 'RL_BATCH_SIZE' -Value '128'
        Set-EnvDefault -Name 'RL_EPSILON_START' -Value '1.0'
        Set-EnvDefault -Name 'RL_EPSILON_DECAY' -Value '0.985'
        Set-EnvDefault -Name 'RL_EPSILON_MIN' -Value '0.06'
        Set-EnvDefault -Name 'RL_LEARNING_RATE' -Value '0.00012'
        Set-EnvDefault -Name 'RL_REPLAY_CAPACITY' -Value '300000'
        Set-EnvDefault -Name 'RL_WARMUP_STEPS' -Value '10000'
        Set-EnvDefault -Name 'RL_TARGET_UPDATE' -Value '8'
        Set-EnvDefault -Name 'RL_EARLY_STOP_PATIENCE' -Value '10'
        Set-EnvDefault -Name 'RL_EARLY_STOP_EVAL_INTERVAL' -Value '2'
        Set-EnvDefault -Name 'RL_EARLY_STOP_WARMUP_EPISODES' -Value '24'
        Set-EnvDefault -Name 'RL_EARLY_STOP_MIN_DELTA' -Value '0.0015'
    }
}

Write-Host '========================================'
Write-Host ' RL Pure Training Preset Launcher'
Write-Host '========================================'
Write-Host " Preset: $TrainingPreset"
Write-Host " Use GPU: $UseGpu"
Write-Host " Run ID: $env:RL_RUN_ID"
Write-Host " Episodes: $env:RL_EPISODES"
Write-Host " Max steps/episode: $env:RL_MAX_STEPS_PER_EPISODE"
Write-Host " Batch size: $env:RL_BATCH_SIZE"
Write-Host " Epsilon decay: $env:RL_EPSILON_DECAY"
Write-Host " Early-stop patience: $env:RL_EARLY_STOP_PATIENCE"
Write-Host '========================================'

powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'run_rl_train_pure_full.ps1') -Preset $TrainingPreset
