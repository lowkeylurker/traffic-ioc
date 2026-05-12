# RL Feature + Label Migration Task (0-5)

## 1. Muc tieu
Chuyen toan bo pipeline RL ve bo feature moi theo tai lieu [docs/DIEU_CHINH_FEATURE.md](docs/DIEU_CHINH_FEATURE.md), dong thoi doi nhan huan luyen tu 4 lop (0-3) ve 6 lop (0-5) su dung truc tiep `congestion_level` tu `fact_traffic_flow`.

## 2. Pham vi thay doi
- Module: `ai-core`.
- Du lieu dau vao: DataMart/Warehouse query cho RL.
- Feature contract: dynamic/static/categorical cho model, dataset, env, training, inference.
- Label contract: target = `congestion_level`, gia tri hop le 0..5.
- Khong thay doi API ben ngoai tru khi can cap nhat schema output de phan anh 6 lop.

## 3. Dinh nghia contract moi (bat buoc)
### 3.1 Dynamic features (window 12 x 6)
- `current_speed_kmh`
- `traffic_index`
- `delay_seconds`
- `quality_flag`
- `speed_ratio` (moi)
- `speed_delta` (moi)

Loai bo:
- `pcu_volume`

### 3.2 Static model features (vector 1D x 7)
- `default_lane_count`
- `free_flow_speed_kmh` (rename tu `static_free_flow`)
- `time_sin`
- `time_cos`
- `is_one_way` (moi)
- `is_business_hours` (moi)
- `is_weekend` (moi)

### 3.3 Categorical features (ID)
- `tomtom_frc` (thay `osm_highway_type`)
- `ward_district_id` (thay `district`)
- `weather_key` (thay `weather_severity`)
- `shift_code`
- `day_of_week`

### 3.4 Label
- `TARGET_COL = congestion_level`
- Class space: `0,1,2,3,4,5`
- `NUM_CLASSES = 6`
- Cam collapse ve 4 lop trong training/inference moi.

## 4. Ke hoach implementation A-Z
## Phase A - Data extraction va preprocessing
- [ ] A1. Cap nhat query lay du lieu RL de bo sung filter:
  - [ ] `WHERE is_closed = false`
- [ ] A2. Tinh feature moi tai tang query hoac pandas:
  - [ ] `speed_ratio = current_speed_kmh / NULLIF(free_flow_speed_kmh, 0)`
  - [ ] `speed_delta = current_speed_kmh - LAG(current_speed_kmh)` theo `segment_key`, `timestamp`
  - [ ] `ward_district_id` tu cap (`ward`, `district`) (uu tien map ID on dinh)
- [ ] A3. Dam bao co cac cot static moi:
  - [ ] `is_one_way`
  - [ ] `is_business_hours`
  - [ ] `is_weekend`
- [ ] A4. Chot target tu source:
  - [ ] map `target_label <- congestion_level`
  - [ ] validate domain target trong [0..5]
- [ ] A5. Xu ly missing/outlier:
  - [ ] chia cho 0 trong `speed_ratio`
  - [ ] gia tri dau tien cua `speed_delta` (fill 0 hoac strategy thong nhat)

## Phase B - Feature contract va dataset wiring
- [ ] B1. Cap nhat [src/ml/feature_contract.py](src/ml/feature_contract.py):
  - [ ] `DYNAMIC_FEATURE_COLS`
  - [ ] `STATIC_MODEL_FEATURE_COLS`
  - [ ] `STATIC_SCALER_FEATURE_COLS`
  - [ ] `CATEGORICAL_FEATURE_COLS`
  - [ ] `TARGET_COL`, `NUM_CLASSES`, `CLASS_MAPPING`
- [ ] B2. Cap nhat preprocessing/scaler:
  - [ ] [src/utils/preprocessing.py](src/utils/preprocessing.py)
  - [ ] bo cot cu, them cot moi dung thu tu
- [ ] B3. Cap nhat segment processing:
  - [ ] [src/utils/segment_processing.py](src/utils/segment_processing.py)
  - [ ] agg logic cho cot moi
  - [ ] interpolation/fill strategy cho dynamic/static/categorical moi
- [ ] B4. Cap nhat dataset/dataloader:
  - [ ] [src/ml/data/dataset.py](src/ml/data/dataset.py)
  - [ ] dam bao tensor shape khop contract moi

## Phase C - RL env, agent, training, evaluation
- [ ] C1. Cap nhat RL environment:
  - [ ] [src/rl/environments/traffic_env.py](src/rl/environments/traffic_env.py)
  - [ ] observation space theo so feature moi
  - [ ] action space = 6 class
- [ ] C2. Cap nhat model/agent neu state_dim thay doi:
  - [ ] [src/rl/agents/dqn_agent.py](src/rl/agents/dqn_agent.py)
  - [ ] checkpoint compatibility policy (khong reuse checkpoint 4 class)
- [ ] C3. Cap nhat training runner/loop:
  - [ ] [src/rl/training/runner.py](src/rl/training/runner.py)
  - [ ] [src/rl/training/loop.py](src/rl/training/loop.py)
  - [ ] rebalance logic phu hop 6 class
- [ ] C4. Cap nhat evaluator/metrics:
  - [ ] [src/rl/inference/evaluator.py](src/rl/inference/evaluator.py)
  - [ ] confusion matrix va per-class metrics cho 6 class

## Phase D - Inference/API integration
- [ ] D1. Cap nhat RL inference pipeline:
  - [ ] [src/rl/inference.py](src/rl/inference.py)
  - [ ] [src/rl/corridor_inference.py](src/rl/corridor_inference.py)
  - [ ] [src/rl/inference/predictor.py](src/rl/inference/predictor.py)
- [ ] D2. Cap nhat schema/response neu can:
  - [ ] [src/schemas](src/schemas) lien quan congestion level 0..5
- [ ] D3. Dam bao fallback/business message map dung 6 muc do.

## Phase E - Migration artifacts va compatibility
- [ ] E1. Version hoa artifact:
  - [ ] tao duong dan artifact moi (vi du `*_v2_6class`)
  - [ ] tranh ghi de artifact 4 class cu
- [ ] E2. Chot rule backward compatibility:
  - [ ] model 4-class -> khong nap cho runtime moi
  - [ ] neu can, giu 2 profile de rollout an toan

## Phase F - Test plan va nghiem thu
- [ ] F1. Unit tests (feature engineering)
  - [ ] test `speed_ratio`, `speed_delta`, `ward_district_id`
  - [ ] test filter `is_closed=false`
- [ ] F2. Contract tests
  - [ ] assert danh sach cot, thu tu cot, shape tensor
  - [ ] assert target domain [0..5]
- [ ] F3. Training smoke test
  - [ ] chay 1 training ngan (so episode nho)
  - [ ] verify khong crash, metrics co 6 class
- [ ] F4. Inference smoke test
  - [ ] output congestion level nam trong [0..5]
  - [ ] latency/throughput khong regress nghiem trong
- [ ] F5. Regression checks
  - [ ] compare macro-F1, weighted-F1, per-class recall
  - [ ] dac biet theo doi class 4,5 de tranh underfit

## 5. Tieu chi hoan thanh (Definition of Done)
- [ ] Toan bo pipeline train/infer dung contract feature moi.
- [ ] Label huan luyen va danh gia su dung `congestion_level` 0..5.
- [ ] Tat ca test contract + smoke pass.
- [ ] Khong con reference active den bo cot cu (`pcu_volume`, `static_free_flow`, `district`, `osm_highway_type`, `weather_severity`) trong RL pipeline moi.
- [ ] Tai lieu huong dan train/infer duoc cap nhat.

## 6. Rui ro chinh va giam thieu
- Rui ro: Lech phan phoi class 4-5 qua it.
  - Giam thieu: class-aware weighting + rebalance theo 6 class + theo doi per-class recall.
- Rui ro: Drift do doi feature contract.
  - Giam thieu: version artifact + migration guard + contract tests.
- Rui ro: Missing cot moi tu source.
  - Giam thieu: preflight check schema truoc train/infer, fail-fast ro rang.

## 7. Thu tu thuc thi de xuat
1. Phase A
2. Phase B
3. Phase C
4. Phase D
5. Phase E
6. Phase F

## 8. Ghi chu implementation quan trong
- Khong hardcode secret; tiep tuc dung env vars.
- Uu tien thay doi nho, co test kem theo moi block thay doi.
- Moi thay doi contract phai cap nhat cung luc: feature_contract -> preprocessing -> dataset -> env -> agent -> inference.
- Neu can giu route cu, them co `model_profile` de phan tach 4-class va 6-class trong giai doan transition.
