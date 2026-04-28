# Module Reuse Map 01-06 (Refactor Kickoff)

Mục tiêu: ánh xạ chi tiết từng notebook 01-06 sang module/script hiện có trong `src/` và `scripts/`, để refactor theo chuẩn notebook-thin (notebook chỉ orchestration).

## Quy ước trạng thái

- `reused-now`: có thể gọi trực tiếp ngay từ notebook.
- `wrap-needed`: có code sẵn nhưng chưa có hàm orchestration gọn cho notebook, nên tạo wrapper module mỏng.
- `new-module-needed`: chưa có module phù hợp, cần bổ sung mới trước khi notebook-thin hoàn chỉnh.

## Notebook 01 - Data Extraction & Feature Engineering

### Reuse map

| Notebook step | Module/symbol hiện có | Trạng thái | Input chính | Output chính |
|---|---|---|---|---|
| Lấy danh sách segment theo corridor | `src.data_access.warehouse_repository.get_segments_in_corridor` | reused-now | `corridor_id` | `list[int] segment_ids` |
| Load dữ liệu thô từ warehouse | `src.data_access.warehouse_repository.load_warehouse_rows_by_segments` | reused-now | `segment_ids`, `start_date`, `end_date` | `DataFrame` raw |
| Ưu tiên DataMart + fallback warehouse | `src.utils.data_loader.load_bulk_segment_data` | reused-now | `segment_ids`, `start_date`, `end_date`, `peak_hours_only` | `dict[segment_key, DataFrame]` đã xử lý |
| Xử lý feature/clean/interpolate theo segment | `src.utils.segment_processing.process_single_segment` / `process_bulk_dataframe` | reused-now | `DataFrame` raw | `DataFrame` processed theo contract |
| Chuẩn hóa traffic features và label từ DW | `src.features.traffic_features.extract_traffic_features` | reused-now | `DataFrame` | `DataFrame` có `traffic_index` + kiểm soát `congestion_level` |

### Gap cần đóng

| Gap | Lý do | Đề xuất module mới |
|---|---|---|
| ETL orchestration cho notebook 01 hiện chưa có 1 hàm duy nhất | Notebook đang phải viết SQL/logic dài trong cell | `src/pipelines/notebook01_etl.py` với hàm `run_notebook01_etl(config) -> Path` |
| Chưa có flow chuẩn cho trường hợp không cung cấp corridor_ids (chỉ theo date range) | API hiện tại chủ yếu theo segment/corridor | Thêm helper `resolve_segment_ids(config)` trong `src/pipelines/notebook01_etl.py` |
| Chưa có report schema/checks thống nhất cho notebook | Hiện kiểm tra rải rác trong cell | Thêm `validate_notebook01_output(df) -> dict` |

## Notebook 02 - Hybrid Resampling & CTGAN

### Reuse map

| Notebook step | Module/symbol hiện có | Trạng thái | Input chính | Output chính |
|---|---|---|---|---|
| Config class-balance | `src.rl.data_balance.pipeline.ClassBalanceConfig` | reused-now | tham số cap/transition/duplicate/CTGAN | config object |
| Chạy full balancing pipeline | `src.rl.data_balance.pipeline.build_balanced_dataset` | reused-now | `DataFrame`, `ClassBalanceConfig` | `balanced_df`, `BalanceReport` |
| Chạy từ parquet input | `src.rl.data_balance.pipeline.build_balanced_dataset_from_path` | reused-now | `input_path`, `config` | parquet output + report |
| Sanity check vật lý | `src.rl.data_balance.pipeline.physics_sanity_check` | reused-now | `DataFrame` synthetic | `DataFrame` filtered + stats |
| CLI tương đương production | `src.rl.data_balance.build_balanced_dataset.main` | reused-now | args CLI | parquet + json report |

### Gap cần đóng

| Gap | Lý do | Đề xuất module mới |
|---|---|---|
| Notebook cần summary plots/class drift report thuận tiện | Pipeline hiện có report dict/json, chưa có plotting helper | `src/rl/data_balance/reporting.py` (plot class before/after, dropped reasons) |

## Notebook 03 - ML Training & Preprocessing Artifacts

### Reuse map

| Notebook step | Module/symbol hiện có | Trạng thái | Input chính | Output chính |
|---|---|---|---|---|
| Entrypoint train baseline | `scripts.run_ml_train.main` | reused-now | env/config trong script | checkpoint + preprocessing + metrics |
| Build dataloaders + preprocessing | `src.ml.data.dataset.prepare_dataloaders` | reused-now | `DataFrame` train | `train_loader`, `val_loader`, `scaler`, `encoders` |
| Train loop supervised | `src.ml.training.loop.train_model` | reused-now | model + loaders + hyperparams | `history`, `summary` |
| Artifact paths chuẩn | `src.ml.artifacts.get_ml_checkpoint_path/get_ml_preprocessing_path/get_ml_metrics_path` | reused-now | `run_id` | path output chuẩn |

### Gap cần đóng

| Gap | Lý do | Đề xuất module mới |
|---|---|---|
| `run_ml_train.py` hiện script-centric, khó gọi hàm thuần từ notebook | Notebook vẫn phải gọi subprocess hoặc copy config | Tách logic thành `src/ml/training/pipeline.py` với `run_supervised_training(config) -> TrainingOutputs` |
| Chưa có config dataclass cho ML run | Hyperparams rải trong script | Thêm `MLTrainingConfig` trong module pipeline mới |

## Notebook 04 - Environment & Model Prototyping

### Reuse map

| Notebook step | Module/symbol hiện có | Trạng thái | Input chính | Output chính |
|---|---|---|---|---|
| Build dataset cho prototype | `src.ml.data.dataset.TrafficDataset` | reused-now | `DataFrame`, `window_size`, `target_offset_steps` | dataset windows |
| Env RL chuẩn | `src.rl.environments.traffic_env.TrafficForecastingEnv` | reused-now | dataloader + reward settings | gym env |
| Agent/model RL chuẩn | `src.rl.agents.dqn_agent.DQNAgent` | reused-now | vocab sizes + checkpoint opts | policy/target nets + replay |
| Prototype eval nhanh | `src.rl.inference.evaluator.evaluate_policy_net` | reused-now | `policy_net`, `dataloader` | metrics dict |

### Gap cần đóng

| Gap | Lý do | Đề xuất module mới |
|---|---|---|
| Notebook 04 cần 1 lệnh smoke test thống nhất (shape/dtype/device) | Hiện phải tự ghép nhiều dòng code | `src/rl/prototyping/smoke_test.py` với `run_rl_smoke_test(config) -> dict` |

## Notebook 05 - Double DQN Training Loop

### Reuse map

| Notebook step | Module/symbol hiện có | Trạng thái | Input chính | Output chính |
|---|---|---|---|---|
| Train RL trung tâm | `src.rl.training.runner.run_rl_training` | reused-now | `mode`, `RLTrainingConfig` | checkpoint/history/metrics |
| Config train RL | `src.rl.training.runner.RLTrainingConfig` | reused-now | dates, corridors, eps, lr, balancing flags | config object |
| Script pure mode | `scripts.run_rl_train_pure.main` | reused-now | `--profile`, `--device`, `--horizon` | artifacts RL mode pure |
| Script warmstart mode | `scripts.run_rl_train_warmstart.main` | reused-now | env vars + config cứng trong script | artifacts RL mode warmstart |
| Artifact paths RL chuẩn | `src.rl.artifacts.*` | reused-now | `mode`, `run_id` | checkpoint/history/metrics paths |

### Gap cần đóng

| Gap | Lý do | Đề xuất module mới |
|---|---|---|
| Notebook-friendly API để chạy pure/warmstart bằng 1 hàm thống nhất | Hiện tách script pure/warmstart và env var | `src/rl/training/notebook_api.py` với `run_rl(mode, config_overrides)` |
| Warmstart precheck (baseline checkpoint + preprocessing artifact) | Check hiện tản mạn trong notebook/script | Thêm `validate_warmstart_inputs()` trong `notebook_api.py` |

## Notebook 06 - Evaluation, Error Analysis, XAI, Latency

### Reuse map

| Notebook step | Module/symbol hiện có | Trạng thái | Input chính | Output chính |
|---|---|---|---|---|
| Per-class metrics + confusion matrix | `src.rl.inference.evaluator.evaluate_policy_net` | reused-now | policy net + eval dataloader | `accuracy`, `macro_f1`, `per_class_metrics`, `confusion_matrix` |
| Batch inference cho request thật | `src.rl.inference.predictor.RLTrafficPredictor` + `forecast_for_request` | reused-now | model/artifacts + segment list + request_time | DataFrame dự báo |
| ML baseline inference | `src.ml.inference.predictor.TrafficPredictor` | reused-now | model/artifacts + window data | class prediction + confidence |
| Latency benchmark thực địa | `scripts.experimental.benchmark_datamart.main` | reused-now | args CLI benchmark | latency stats + summary |
| So sánh run RL | `scripts.experimental.compare_rl_runs.main` | reused-now | metrics json files | report so sánh |

### Gap cần đóng

| Gap | Lý do | Đề xuất module mới |
|---|---|---|
| Fatal errors / near-miss metrics chưa có module chuẩn | Notebook 06 yêu cầu metrics vận hành đặc thù | `src/rl/evaluation/ops_metrics.py` (fatal_5_to_0, fatal_5_to_1, near_miss_rate) |
| PR/Recall lớp hiếm (4/5) chưa có helper thống nhất | Hiện phải tự viết notebook code | `src/rl/evaluation/pr_metrics.py` |
| SHAP cho mô hình hiện chưa có module trong `src/` | Chưa có API XAI chuẩn dùng lại | `src/rl/evaluation/xai.py` (optional dependency guard) |
| Report tổng hợp markdown/html chưa có builder | Notebook hiện tự in rời rạc | `src/rl/evaluation/report_builder.py` |

## Refactor kickoff theo thứ tự ưu tiên

1. Refactor ngay Notebook 02, 05, 03 vì đã có module/script reusable rõ nhất (`reused-now` cao).
2. Tạo wrapper module cho Notebook 01 và 04 để loại bỏ logic dài trong cell.
3. Đóng gap Notebook 06 bằng bộ module evaluation (`ops_metrics`, `pr_metrics`, `xai`, `report_builder`).
4. Sau mỗi notebook, thêm test smoke cho wrapper/new module trước khi chỉnh notebook tiếp theo.

## Đề xuất interface tối thiểu cho các module mới

```python
# src/pipelines/notebook01_etl.py
from dataclasses import dataclass
from pathlib import Path

@dataclass
class Notebook01ETLConfig:
    start_date: str
    end_date: str
    corridor_ids: list[int]
    output_path: str
    peak_hours_only: bool = True


def run_notebook01_etl(config: Notebook01ETLConfig) -> Path:
    ...
```

```python
# src/rl/training/notebook_api.py
from src.rl.training.runner import RLTrainingConfig

def run_rl(mode: str, config: RLTrainingConfig) -> dict:
    """Run training and return key output paths + summary metrics."""
    ...
```

```python
# src/rl/evaluation/ops_metrics.py
import numpy as np

def compute_ops_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    ...
```

## Checklist bắt đầu refactor ngay

- [ ] Notebook 01: thay SQL cell bằng gọi `run_notebook01_etl`.
- [ ] Notebook 02: thay toàn bộ resampling cell bằng `build_balanced_dataset_from_path`.
- [ ] Notebook 03: thay subprocess bằng gọi pipeline function (sau khi tách từ script).
- [ ] Notebook 04: thay pseudo-code bằng `run_rl_smoke_test`.
- [ ] Notebook 05: gọi `run_rl_training`/`notebook_api.run_rl` với mode pure/warmstart.
- [ ] Notebook 06: dùng module evaluation chuẩn, bỏ toàn bộ data giả lập rng.
