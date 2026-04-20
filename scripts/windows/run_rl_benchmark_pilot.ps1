$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $root

$seeds = $env:RL_BENCHMARK_SEEDS
if (-not $seeds) { $seeds = '42' }

$episodes = $env:RL_BENCHMARK_EPISODES
if (-not $episodes) { $episodes = '10' }

$batchSize = $env:RL_BENCHMARK_BATCH_SIZE
if (-not $batchSize) { $batchSize = '64' }

$evalRatio = $env:RL_BENCHMARK_EVAL_RATIO
if (-not $evalRatio) { $evalRatio = '0.2' }

$peakHoursOnly = $env:RL_PEAK_HOURS_ONLY
if (-not $peakHoursOnly) { $peakHoursOnly = '1' }

$startDate = $env:RL_BENCHMARK_START_DATE
if (-not $startDate) { $startDate = '2026-03-20' }

$endDate = $env:RL_BENCHMARK_END_DATE
if (-not $endDate) { $endDate = '2026-03-24' }

$maxSegments = $env:RL_BENCHMARK_MAX_SEGMENTS
if (-not $maxSegments) { $maxSegments = '20' }

$output = $env:RL_BENCHMARK_OUTPUT
if (-not $output) { $output = 'rl_benchmark_pilot_summary.json' }

Write-Host '========================================'
Write-Host ' RL Benchmark Pilot'
Write-Host '========================================'
Write-Host " Seeds: $seeds"
Write-Host " Episodes: $episodes"
Write-Host " Batch size: $batchSize"
Write-Host " Eval ratio: $evalRatio"
Write-Host " Peak hours only: $peakHoursOnly"
Write-Host " Start date: $startDate"
Write-Host " End date: $endDate"
Write-Host " Max segments: $maxSegments"
Write-Host " Output: $output"
Write-Host '========================================'

$cmd = @(
    'docker', 'compose', 'exec', '-T', 'ai-core', 'python', '-m', 'scripts.run_rl_benchmark_pilot',
    '--seeds', $seeds,
    '--episodes', $episodes,
    '--batch-size', $batchSize,
    '--eval-ratio', $evalRatio,
    '--peak-hours-only', $peakHoursOnly,
    '--start-date', $startDate,
    '--end-date', $endDate,
    '--max-segments', $maxSegments,
    '--output', $output
)

& $cmd[0] $cmd[1..($cmd.Length - 1)]
if ($LASTEXITCODE -ne 0) {
    throw "RL benchmark pilot failed with exit code $LASTEXITCODE"
}

Write-Host '========================================'
Write-Host ' RL Benchmark Pilot Done'
Write-Host '========================================'
