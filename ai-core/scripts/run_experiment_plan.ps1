$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$aiCore = Resolve-Path (Join-Path $root '..')
$reportsDir = Join-Path $aiCore 'reports'
$runsDir = Join-Path $reportsDir 'runs'
if (-not (Test-Path $runsDir)) { New-Item -ItemType Directory -Path $runsDir | Out-Null }

function Invoke-Run {
    param(
        [string]$RunId,
        [hashtable]$EnvMap
    )

    $metricsPathContainer = "/app/reports/runs/$RunId.metrics.json"
    $logPathContainer = "/app/reports/runs/$RunId.log"

    $envArgs = @('-e', "RUN_ID=$RunId", '-e', "METRICS_OUT=$metricsPathContainer")
    foreach ($k in $EnvMap.Keys) {
        $envArgs += @('-e', "$k=$($EnvMap[$k])")
    }

    Write-Host "=== RUN $RunId START ==="
    $cmd = @('docker-compose', 'exec') + $envArgs + @('ai-core', 'sh', '-lc', "python -m src.ml.train | tee $logPathContainer")
    & $cmd[0] $cmd[1..($cmd.Length-1)]
    if ($LASTEXITCODE -ne 0) {
        throw "Run $RunId failed with exit code $LASTEXITCODE"
    }
    Write-Host "=== RUN $RunId DONE ==="

    $metricsHost = Join-Path $runsDir "$RunId.metrics.json"
    if (-not (Test-Path $metricsHost)) {
        throw "Metrics file not found for ${RunId}: $metricsHost"
    }
    return Get-Content $metricsHost -Raw | ConvertFrom-Json
}

function Get-BestPhase1Run {
    param([array]$results)
    return $results | Sort-Object { [double]$_.summary.best_val_f1 } -Descending | Select-Object -First 1
}

function Update-PlanReport {
    param(
        [string]$PlanPath,
        [hashtable]$Rows,
        [string]$Phase2Selected,
        [string]$FinalSelected
    )

    $content = Get-Content $PlanPath -Raw

    foreach ($runId in $Rows.Keys) {
        $r = $Rows[$runId]
        $row = "| $runId | $($r.best_epoch) | $([math]::Round($r.best_val_f1, 4)) | $([math]::Round($r.best_val_acc, 4)) | $([math]::Round($r.best_val_loss, 4)) | $([math]::Round($r.train_val_gap, 4)) | $([math]::Round($r.minority_recall_45, 4)) | $([math]::Round($r.avg_time_per_epoch_sec, 1)) | $($r.conclusion) |"
        $pattern = "\| $runId \|.*"
        $content = [regex]::Replace($content, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $row })
    }

    $summaryBlock = @"

## Ket qua thuc thi tu dong
- Phase 1 best: $Phase2Selected
- Phase 2 selected run: $Phase2Selected
- Final selected run: $FinalSelected
"@

    if ($content -match '## Ket qua thuc thi tu dong') {
        $content = [regex]::Replace($content, '## Ket qua thuc thi tu dong[\s\S]*$', $summaryBlock.Trim())
    } else {
        $content += "`r`n" + $summaryBlock
    }

    Set-Content -Path $PlanPath -Value $content -Encoding UTF8
}

$phase1 = @(
    @{ id='A0'; env=@{ USE_WEIGHTED_SAMPLER='0'; USE_CLASS_WEIGHTS='1'; CLASS_WEIGHT_CLIP_MIN='0.0'; CLASS_WEIGHT_CLIP_MAX='100000'; LOSS_TYPE='ce'; TRAIN_EPOCHS='30'; PATIENCE='5'; BATCH_SIZE='256'; LEARNING_RATE='0.001'; WEIGHT_DECAY='0.0001'; DROPOUT_RATE='0.2'; LABEL_SMOOTHING='0.0'; USE_LR_SCHEDULER='0' } },
    @{ id='A2'; env=@{ USE_WEIGHTED_SAMPLER='1'; USE_CLASS_WEIGHTS='0'; LOSS_TYPE='ce'; TRAIN_EPOCHS='30'; PATIENCE='5'; BATCH_SIZE='256'; LEARNING_RATE='0.001'; WEIGHT_DECAY='0.0001'; DROPOUT_RATE='0.2'; LABEL_SMOOTHING='0.0'; USE_LR_SCHEDULER='0' } },
    @{ id='A4'; env=@{ USE_WEIGHTED_SAMPLER='1'; USE_CLASS_WEIGHTS='1'; CLASS_WEIGHT_CLIP_MIN='0.8'; CLASS_WEIGHT_CLIP_MAX='12'; LOSS_TYPE='ce'; TRAIN_EPOCHS='30'; PATIENCE='5'; BATCH_SIZE='256'; LEARNING_RATE='0.001'; WEIGHT_DECAY='0.0001'; DROPOUT_RATE='0.2'; LABEL_SMOOTHING='0.0'; USE_LR_SCHEDULER='0' } }
)

$rows = @{}
$phase1Results = @()
foreach ($run in $phase1) {
    $result = Invoke-Run -RunId $run.id -EnvMap $run.env
    $summary = $result.summary
    $summary | Add-Member -NotePropertyName conclusion -NotePropertyValue 'phase1-completed' -Force
    $rows[$run.id] = $summary
    $phase1Results += $result
}

$bestPhase1 = Get-BestPhase1Run -results $phase1Results
$bestRunId = [string]$bestPhase1.run_id

$phase2Run = if ($bestRunId -eq 'A2') {
    @{ id='B2'; env=@{ USE_WEIGHTED_SAMPLER='1'; USE_CLASS_WEIGHTS='0'; LOSS_TYPE='focal'; FOCAL_GAMMA='1.5'; TRAIN_EPOCHS='30'; PATIENCE='5'; BATCH_SIZE='256'; LEARNING_RATE='0.001'; WEIGHT_DECAY='0.0001'; DROPOUT_RATE='0.2'; LABEL_SMOOTHING='0.0'; USE_LR_SCHEDULER='0' } }
} else {
    @{ id='B3'; env=@{ USE_WEIGHTED_SAMPLER='1'; USE_CLASS_WEIGHTS='1'; CLASS_WEIGHT_CLIP_MIN='0.8'; CLASS_WEIGHT_CLIP_MAX='12'; LOSS_TYPE='cb_focal'; FOCAL_GAMMA='1.5'; CB_BETA='0.9999'; TRAIN_EPOCHS='30'; PATIENCE='5'; BATCH_SIZE='256'; LEARNING_RATE='0.001'; WEIGHT_DECAY='0.0001'; DROPOUT_RATE='0.2'; LABEL_SMOOTHING='0.0'; USE_LR_SCHEDULER='0' } }
}

$phase2Result = Invoke-Run -RunId $phase2Run.id -EnvMap $phase2Run.env
$phase2Summary = $phase2Result.summary
$phase2Summary | Add-Member -NotePropertyName conclusion -NotePropertyValue 'phase2-completed' -Force
$rows[$phase2Run.id] = $phase2Summary

$c1 = @{ id='C1'; env=@{ USE_WEIGHTED_SAMPLER='1'; USE_CLASS_WEIGHTS='1'; CLASS_WEIGHT_CLIP_MIN='0.8'; CLASS_WEIGHT_CLIP_MAX='12'; LOSS_TYPE='ce'; TRAIN_EPOCHS='30'; PATIENCE='5'; BATCH_SIZE='256'; LEARNING_RATE='0.001'; WEIGHT_DECAY='0.0001'; DROPOUT_RATE='0.3'; LABEL_SMOOTHING='0.0'; USE_LR_SCHEDULER='0' } }
$c2 = @{ id='C2'; env=@{ USE_WEIGHTED_SAMPLER='1'; USE_CLASS_WEIGHTS='1'; CLASS_WEIGHT_CLIP_MIN='0.8'; CLASS_WEIGHT_CLIP_MAX='12'; LOSS_TYPE='ce'; TRAIN_EPOCHS='30'; PATIENCE='5'; BATCH_SIZE='256'; LEARNING_RATE='0.001'; WEIGHT_DECAY='0.0005'; DROPOUT_RATE='0.3'; LABEL_SMOOTHING='0.05'; USE_LR_SCHEDULER='1'; SCHEDULER_PATIENCE='2'; SCHEDULER_FACTOR='0.5' } }

$c1Result = Invoke-Run -RunId $c1.id -EnvMap $c1.env
$c1Summary = $c1Result.summary
$c1Summary | Add-Member -NotePropertyName conclusion -NotePropertyValue 'phase3-completed' -Force
$rows[$c1.id] = $c1Summary

$c2Result = Invoke-Run -RunId $c2.id -EnvMap $c2.env
$c2Summary = $c2Result.summary
$c2Summary | Add-Member -NotePropertyName conclusion -NotePropertyValue 'phase3-completed' -Force
$rows[$c2.id] = $c2Summary

$executed = @($phase1Results + $phase2Result + $c1Result + $c2Result)
$bestFinal = $executed | Sort-Object { [double]$_.summary.best_val_f1 } -Descending | Select-Object -First 1
$bestFinalId = [string]$bestFinal.run_id

if ($rows.ContainsKey($bestFinalId)) {
    $rows[$bestFinalId].conclusion = 'selected-final-best'
}

$planPath = Join-Path $reportsDir 'ML_EXPERIMENT_PLAN.md'
Update-PlanReport -PlanPath $planPath -Rows $rows -Phase2Selected $phase2Run.id -FinalSelected $bestFinalId

Write-Host "=== ALL EXPERIMENTS COMPLETED ==="
Write-Host "Best final run: $bestFinalId"
