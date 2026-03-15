# AI Core - Traffic Forecasting, Congestion Prediction & Data Imputation Module

Module này là phần **AI/ML** cho dự án Traffic IOC - Kho dữ liệu và Điều hành giao thông thông minh, được phục vụ bởi Sở GTVT TP.HCM. Module cung cấp ba khả năng chính:

1. **Dự báo giao thông (Traffic Forecasting)** – Dự báo tốc độ 15 phút tới trên các tuyến đường (Feature B1).
2. **Dự báo tình trạng tắc nghẽn (Congestion Prediction)** – Sử dụng Reinforcement Learning để dự báo liệu 15 phút tới có xảy ra tắc nghẽn hay không (0/1).
3. **Clustering & Data Imputation** – Gom cụm các tuyến đường tương tự để dự báo/impute dữ liệu khi thiếu hoặc bị lỗi.

---

## 📋 Công việc liên quan trong dự án

| Feature | Mô tả | Trạng thái |
|:----------|:------|:----------|
| **B1** | Dự báo tốc độ giao thông 15 phút tới (Short-term Forecast) | Chưa triển khai |
| **B1-RL** | Dự báo tình trạng tắc nghẽn 15 phút tới bằng RL (Binary: congested/free) | Chưa triển khai |
| **B1-Clustering** | Gom cụm tuyến đường & impute dữ liệu thiếu dựa trên neighbors | Chưa triển khai |
| **B3** | Bản đồ rủi ro động (Dynamic Risk Map) – có thể sử dụng dự báo | Chưa triển khai |

---

## ✅ Những gì đã thực hiện

- ✅ Tạo cấu trúc module AI độc lập trong `ai-core/`.
- ✅ Tách `requirements.txt` thành 3 file (runtime, dev, ml) để tối ưu tốc độ cài đặt.
- ✅ Chuẩn bị thư mục `models/` để lưu pre-trained models (gitignored).
- ✅ Thiết kế hướng khởi chạy qua Docker Compose cùng hệ thống tổng.
- ✅ Hybrid workflow (Local + Docker) cho development nhanh.
- ⏳ **Cần thực hiện:** Triển khai logic API, training pipelines, model inference.

---

## 📦 Dependencies & Installation

Module sử dụng 3 file requirements tách biệt:
- **`requirements.txt`** - Runtime dependencies (~200MB, 2-3 phút)
- **`requirements-dev.txt`** - Testing & linting tools (~50MB, 1-2 phút)
- **`requirements-ml.txt`** - ML/DL packages (~3-4GB, 15-20 phút)

Chi tiết xem: **[REQUIREMENTS.md](REQUIREMENTS.md)**  
Workflow development: **[HYBRID_WORKFLOW.md](HYBRID_WORKFLOW.md)**

---

## 📁 Cấu trúc thư mục (Đề xuất)

```
ai-core/
├── Dockerfile                          # Build image Python + ML libraries
├── README.md                           # File này
├── requirements.txt                    # Python dependencies
├── .env.example                        # Template biến môi trường
├── models/                             # Pre-trained models (gitignored)
│   ├── traffic_forecast/
│   │   └── lstm_model.pkl              # LSTM/Random Forest model cho dự báo tốc độ
│   ├── congestion_rl/
│   │   └── dqn_agent.pt                # DQN/PPO RL model cho dự báo tắc nghẽn
│   └── clustering/
│       ├── kmeans_model.pkl            # K-Means clustering model (K=5-10 clusters)
│       └── scaler.pkl                  # StandardScaler để normalize features
├── cache/                              # Cache dữ liệu tạm (gitignored)
│   └── baseline_predictions.json       # Kết quả baseline để so sánh
│
└── src/
    ├── __init__.py                     # Package marker
    │
    ├── main.py                         # CLI entrypoint (typer)
    │
    ├── core/                           # ══ TẦNG 1: FOUNDATION ══
    │   ├── __init__.py
    │   ├── config.py                   # Load env variables → Settings (pydantic)
    │   ├── database.py                 # SQLAlchemy connection để fetch dữ liệu ETL
    │   ├── logger.py                   # Logging setup
    │   └── exceptions.py               # Custom exceptions
    │
    ├── schemas/                        # ══ TẦNG 2: DATA CONTRACTS ══
    │   ├── __init__.py
    │   ├── forecast_schema.py          # ForecastRequest, ForecastResponse
    │   └── congestion_rl_schema.py     # CongestionPredictionRequest, CongestionPredictionResponse
    │
    ├── features/                       # ══ TẦNG 3: FEATURE ENGINEERING ══
    │   ├── __init__.py
    │   ├── traffic_features.py         # Extract features từ fact_traffic_flow
    │   ├── temporal_features.py        # Time-based features (hour, day, season)
    │   └── sliding_window.py           # Chuỗi thời gian → Window features
    │
    ├── forecast/                       # ══ TẦNG 4: TRAFFIC FORECASTING ══
    │   ├── __init__.py
    │   ├── base_forecaster.py          # ABC: BaseForecastModel
    │   ├── lstm_forecaster.py          # LSTM model wrapper
    │   ├── random_forest_forecaster.py # Random Forest wrapper
    │   ├── ensemble_forecaster.py      # Ensemble (trung bình 2+ models)
    │   └── training.py                 # Train/validation pipeline (future)
    │
    ├── rl/                             # ══ TẦNG 5: REINFORCEMENT LEARNING ══
    │   ├── __init__.py
    │   ├── base_agent.py               # ABC: BaseRLAgent (DQN, PPO, etc.)
    │   ├── dqn_agent.py                # DQN (Deep Q-Network) agent
    │   ├── ppo_agent.py                # PPO (Proximal Policy Optimization) agent
    │   ├── congestion_env.py           # Gym environment cho congestion prediction
    │   ├── experience_replay.py        # Replay buffer cho training
    │   └── training.py                 # RL training pipeline (future)
    │
    ├── clustering/                     # ══ TẦNG 6: CLUSTERING & DATA IMPUTATION ══
    │   ├── __init__.py
    │   ├── base_clusterer.py           # ABC: BaseClusterer
    │   ├── kmeans_clusterer.py         # K-Means clustering wrapper
    │   ├── dbscan_clusterer.py         # DBSCAN clustering (density-based)
    │   ├── feature_extractor.py        # Extract features cho clustering (geometry, avg speed, etc.)
    │   ├── similarity_matcher.py       # Tìm similar segments từ cluster
    │   ├── imputation.py               # Fill missing data dựa trên nearest neighbors
    │   └── training.py                 # Clustering training pipeline (future)
    │
    ├── api/                            # ══ TẦNG 7: API LAYER ══
    │   ├── __init__.py
    │   ├── app.py                      # FastAPI app
    │   ├── routes/
    │   │   ├── __init__.py
    │   │   ├── forecast.py             # POST /api/v1/forecast → dự báo tốc độ
    │   │   ├── congestion.py           # POST /api/v1/congestion-prediction → dự báo tắc nghẽn
    │   │   └── clustering.py           # POST /api/v1/impute-missing-data → fill dữ liệu thiếu
    │   └── dependencies.py             # Shared dependencies (models, DB session)
    │
    ├── utils/                          # ══ TẦNG 8: UTILITIES ══
    │   ├── __init__.py
    │   ├── metrics.py                  # MAE, RMSE, MAPE (evaluation metrics)
    │   ├── data_loader.py              # Query fact_traffic_flow từ DB
    │   └── preprocessing.py            # Normalization, outlier detection
    │
    └── tests/                          # ══ TẦNG 9: UNIT TESTS ══
        ├── __init__.py
        ├── test_forecast.py            # Unit tests cho forecasting
        ├── test_congestion_rl.py       # Unit tests cho RL congestion prediction
        ├── test_clustering.py          # Unit tests cho clustering & imputation
        ├── test_features.py            # Unit tests cho feature engineering
        └── conftest.py                 # Pytest fixtures
```

### Tóm tắt cấu trúc

| Thư mục | Mục đích | Ghi chú |
|:----------|:---------|:--------|
| `core/` | Cấu hình, database, logging | Không import models/forecasters |
| `schemas/` | Pydantic models cho request/response | Type validation |
| `features/` | Feature engineering từ dữ liệu gốc | Pure functions, unit-testable |
| `forecast/` | Các mô hình dự báo | LSTM, Random Forest, Ensemble |
| `rl/` | Reinforcement Learning: DQN, PPO, Environment | Binary congestion prediction |
| `clustering/` | K-Means, DBSCAN + Imputation | Fill missing data dựa trên neighbors |
| `api/` | FastAPI endpoints | RESTful API server |
| `utils/` | Các hàm tiện ích | Metrics, data loading, preprocessing |
| `tests/` | Unit & integration tests | Pytest |

---

## 🚀 Chạy module

### 1) Chạy bằng Docker (Khuyến nghị cho Production)

Từ thư mục gốc `traffic-ioc/`:

```bash
# Khởi chạy toàn bộ hệ thống (bao gồm PostgreSQL, backend, ai-core, ...)
docker-compose up -d

# Chỉ khởi chạy ai-core service
docker-compose up -d ai-core

# Xem logs
docker-compose logs -f ai-core
```

### 2) Chạy trực tiếp (Phát triển)

```bash
# 1. Tạo virtual environment
python -m venv venv
source venv/Scripts/activate  # Windows: venv\Scripts\activate

# 2. Cài dependencies
pip install -r requirements.txt

# 3. Cấu hình biến môi trường (copy từ .env.example nếu có)
cp .env.example .env
# Chỉnh sửa .env với các giá trị thực tế

# 4. Chạy với CLI (typer)
python src/main.py --help

# 5. Chạy API server (FastAPI)
uvicorn src.api.app:app --host 0.0.0.0 --port 5000 --reload
```

### 3) Chạy Unit Tests

```bash
# Chạy tất cả tests
pytest src/tests/ -v

# Chạy một test file cụ thể
pytest src/tests/test_forecast.py -v

# Chạy tests với coverage
pytest src/tests/ --cov=src --cov-report=html
```

---

## 🔧 Biến môi trường (Environment Variables)

Tạo file `.env` hoặc `.env.local` tại `ai-core/`:

```bash
# ═══════════════════════════════════════════════════
# DATABASE (để fetch dữ liệu từ Data Warehouse)
# ═══════════════════════════════════════════════════
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=traffic_ioc
DB_SCHEMA=public

# ═══════════════════════════════════════════════════
# API SERVICE
# ═══════════════════════════════════════════════════
AI_SERVICE_HOST=0.0.0.0
AI_SERVICE_PORT=5000
AI_LOG_LEVEL=INFO

# ═══════════════════════════════════════════════════
# MODEL PATHS
# ═══════════════════════════════════════════════════
MODEL_PATH=./models
FORECAST_MODEL_PATH=./models/traffic_forecast/lstm_model.pkl
RL_CONGESTION_MODEL_PATH=./models/congestion_rl/dqn_agent.pt
CLUSTERING_MODEL_PATH=./models/clustering/kmeans_model.pkl
SCALER_PATH=./models/clustering/scaler.pkl

# ═══════════════════════════════════════════════════
# FORECAST CONFIG
# ═══════════════════════════════════════════════════
FORECAST_HORIZON=15              # Số phút để dự báo (15 phút)
FORECAST_HISTORY_WINDOW=480      # Số phút dữ liệu lịch sử (8 giờ)
FORECAST_ENSEMBLE_ENABLED=true   # Dùng ensemble hay single model

# ═══════════════════════════════════════════════════
# REINFORCEMENT LEARNING CONFIG
# ═══════════════════════════════════════════════════
RL_ALGORITHM=dqn                 # Thuật toán RL: dqn hoặc ppo
RL_CONGESTION_THRESHOLD=0.6      # Ngưỡng TI để xác định tắc nghẽn (TI >= 0.6 = congested)
RL_HISTORY_WINDOW=180            # Số phút dữ liệu lịch sử cho RL input (3 giờ)
RL_PREDICTION_HORIZON=15         # Dự báo tắc nghẽn sau N phút nữa (15 phút)
RL_EPSILON=0.1                   # Exploration rate (epsilon-greedy)

# ═══════════════════════════════════════════════════
# CLUSTERING & IMPUTATION CONFIG
# ═══════════════════════════════════════════════════
CLUSTERING_ALGORITHM=kmeans      # Thuật toán clustering: kmeans hoặc dbscan
CLUSTERING_N_CLUSTERS=8          # Số cluster (K-Means)
CLUSTERING_DBSCAN_EPS=0.5        # Epsilon cho DBSCAN
CLUSTERING_DBSCAN_MIN_SAMPLES=5  # Min samples cho DBSCAN
CLUSTERING_FEATURES=geometry,avg_speed,peak_hour_ratio  # Features cho clustering
IMPUTATION_METHOD=knn            # Phương pháp imputation: knn hoặc cluster_mean
IMPUTATION_K_NEIGHBORS=5         # Số neighbors cho KNN imputation
```

---

## 💻 API Endpoints (Design Preview)

### 1. Forecast Endpoint – POST `/api/v1/forecast`

**Request:**
```json
{
  "segment_id": 1234,
  "current_time": "2026-03-06T10:30:00Z",
  "forecast_horizon": 60,
  "include_confidence": true
}
```

**Response:**
```json
{
  "segment_id": 1234,
  "forecast_time": "2026-03-06T10:30:00Z",
  "predictions": [
    {
      "timestamp": "2026-03-06T10:45:00Z",
      "predicted_speed": 35.5,
      "confidence": 0.92,
      "predicted_los": "C"
    },
    {
      "timestamp": "2026-03-06T11:00:00Z",
      "predicted_speed": 32.2,
      "confidence": 0.88,
      "predicted_los": "D"
    }
  ],
  "model_version": "lstm_v2.1.0"
}
```

### 2. Congestion Prediction Endpoint – POST `/api/v1/congestion-prediction`

**Request:**
```json
{
  "segment_id": 1234,
  "current_time": "2026-03-06T10:30:00Z",
  "prediction_horizon": 15,
  "include_confidence": true
}
```

**Response:**
```json
{
  "segment_id": 1234,
  "current_time": "2026-03-06T10:30:00Z",
  "prediction_time": "2026-03-06T10:45:00Z",
  "will_be_congested": true,
  "congestion_probability": 0.87,
  "predicted_traffic_index": 0.72,
  "predicted_los": "E",
  "confidence_score": 0.89,
  "model_version": "dqn_rl_v1.0.0"
}
```

### 3. Data Imputation Endpoint – POST `/api/v1/impute-missing-data`

**Request:**
```json
{
  "missing_segments": [1234, 5678, 9012],
  "current_time": "2026-03-06T10:30:00Z",
  "imputation_type": "speed"
}
```

**Response:**
```json
{
  "current_time": "2026-03-06T10:30:00Z",
  "imputed_data": [
    {
      "segment_id": 1234,
      "imputed_speed": 28.5,
      "source_cluster": 2,
      "similar_segments": [1235, 1236, 1240],
      "confidence": 0.82,
      "imputation_method": "knn",
      "reason": "Data missing from sensor"
    },
    {
      "segment_id": 5678,
      "imputed_speed": 42.1,
      "source_cluster": 5,
      "similar_segments": [5679, 5680, 5681],
      "confidence": 0.88,
      "imputation_method": "cluster_mean",
      "reason": "Data missing from sensor"
    }
  ],
  "total_imputed": 2,
  "model_version": "kmeans_v1.2.0"
}
```

---

## 🧠 Mô hình & Thuật toán (Current Design)

### Traffic Forecasting

- **Input features:** Dữ liệu lịch sử tốc độ (8h qua), thời gian, thời tiết, sự cố ghi nhận.
- **Models:**
  - **LSTM (Long Short-Term Memory):** Xử lý chuỗi thời gian với mối phụ thuộc dài hạn.
  - **Random Forest:** Baseline alternative, nhanh và không yêu cầu tuning phức tạp.
  - **Ensemble:** Trung bình dự báo từ 2+ models để tăng độ ổn định.
- **Output:** Dự báo tốc độ cho 60 phút tới (15p intervals) + Level of Service (LOS).

### Congestion Prediction (Reinforcement Learning)

- **Input features:** Dữ liệu lịch sử tốc độ (3 giờ qua), Traffic Index, LOS, thời gian, thời tiết.
- **Models:**
  - **DQN (Deep Q-Network):** Học policy để dự báo tắc nghẽn qua Q-learning.
  - **PPO (Proximal Policy Optimization):** Policy gradient method cho training ổn định hơn.
  - **Environment:** Custom Gym environment mô phỏng trạng thái giao thông.
- **Output:** Binary prediction (congested/free) cho 15 phút tới + xác suất & độ tin cậy.
- **Threshold:** Dùng `RL_CONGESTION_THRESHOLD` (mặc định TI >= 0.6 = congested).

### Clustering & Data Imputation

- **Feature Engineering cho Clustering:**
  - Hình học (geometry): độ dài, hướng, độ cong đường
  - Tốc độ lịch sử: avg speed, peak hour speed, night speed
  - Thống kê giao thông: congestion frequency, incident count
  - Đặc tính hạ tầng: lane count, speed limit

- **Clustering Algorithms:**
  - **K-Means:** Nhanh, phù hợp cho grouping đơn giản (8-10 clusters)
  - **DBSCAN:** Density-based, phát hiện outliers, linh hoạt hơn

- **Imputation Methods:**
  - **KNN Imputation:** Tìm K neighbors gần nhất trong cluster, lấy trung bình tốc độ
  - **Cluster Mean:** Fill bằng giá trị trung bình của toàn cluster
  - **Weighted Average:** Tính trọng số dựa trên similarity

- **Use Cases:**
  - Sensor bị lỗi/offline → fill dữ liệu từ similar segments
  - Dữ liệu bị null/anomaly → replace bằng cluster mean
  - New segment chưa có dữ liệu → infer từ nearby segments
  - Cross-validation: so sánh predicted vs actual khi sensor online trở lại

---

## 📊 Tích hợp với các module khác

### Data Pipeline (`data-pipeline/`)
- **Fetch data:** AI-Core query `fact_traffic_flow`, `dim_segment`, `dim_corridor`, `dim_weather` từ PostgreSQL.
- **Baseline speeds:** Sử dụng `v_segment_avg_speed_baseline` (Materialized View) từ data-pipeline.

### Backend API (`backend/`)
- **Invoke:** Backend gọi `/api/v1/forecast` từ AI-Core để lấy dự báo.
- **Receive:** Backend cập nhật results vào database nếu cần lưu trữ.

### Frontend (`frontend/`)
- **Display:** Hiển thị kết quả dự báo tốc độ & dự báo tắc nghẽn trên bản đồ, heatmap, graph.
- **Alert:** Cảnh báo nếu RL model dự báo sẽ có tắc nghẽn trong 15 phút tới.

---

## 📌 Trạng thái hiện tại

| Module | Trạng thái | Ghi chú |
|:---------|:----------:|:--------|
| **forecast_service.py** | ⏳ Placeholder | Cần triển khai LSTM + Random Forest models |
| **RL Congestion Predictor** | ⏳ Placeholder | Cần triển khai DQN/PPO agents |
| **Clustering** | ⏳ Placeholder | Cần triển khai K-Means + DBSCAN + Imputation |
| **API layer** | ⏳ Chưa có | Cần FastAPI routes + integration tests |
| **RL Environment** | ⏳ Chưa có | Cần custom Gym environment |
| **Clustering Models** | ⏳ Chưa có | Cần training dữ liệu + fit K-Means |
| **Docker** | ✅ Sẵn sàng | Dockerfile đã cấu hình |

---

## 🔗 Tài liệu liên quan

- **Project Specs:** `openspec/project.md` – Tổng quan dự án, features, tech stack
- **Data Pipeline:** `data-pipeline/specs/` – Schema, ETL logic, data contracts
- **Backend API:** `backend/README.md` – API endpoints, integration
- **Frontend:** `frontend/README.md` – UI, data visualization

---

## 📚 Tham khảo & Best Practices

1. **Traffic Forecasting:**
   - Highway Capacity Manual (HCM) 2010 – LOS calculations
   - LSTM for time series: https://keras.io/examples/timeseries/timeseries_forecasting_for_weather_forecasting/
   - Ensemble methods: Scikit-learn docs

2. **Reinforcement Learning:**
   - DQN paper: Deep Reinforcement Learning with Experience Replay (Mnih et al., 2013)
   - PPO paper: Proximal Policy Optimization Algorithms (Schulman et al., 2017)
   - OpenAI Gym: https://gymnasium.farama.org/
   - Stable-baselines3: https://stable-baselines3.readthedocs.io/

3. **Clustering & Imputation:**
   - K-Means: https://scikit-learn.org/stable/modules/clustering.html#k-means
   - DBSCAN: https://scikit-learn.org/stable/modules/clustering.html#dbscan
   - KNN Imputation: https://scikit-learn.org/stable/modules/impute.html#nearest-neighbors
   - Similarity metrics: Euclidean, Cosine, Haversine distance

4. **Code Quality:**
   - Python: PEP 8 style guide
   - Type hints: mypy static type checking
   - Testing: pytest, fixtures, mocking

---

## 🤝 Hướng phát triển tiếp theo

- [ ] Triển khai feature engineering từ `fact_traffic_flow`
- [ ] Training LSTM + Random Forest models trên dữ liệu TP.HCM
- [ ] Xây dựng custom Gym environment cho RL training
- [ ] Training DQN/PPO agents trên dữ liệu giao thông lịch sử
- [ ] Fit K-Means clustering & DBSCAN trên segment features
- [ ] Implement KNN + cluster_mean imputation methods
- [ ] Validate clustering quality (silhouette score, davies-bouldin index)
- [ ] Setup continuous integration (CI/CD) cho model retraining
- [ ] Dashboard monitoring dự báo tắc nghẽn & model performance
- [ ] Monitor imputation accuracy: so sánh predicted vs actual sau khi sensor online
- [ ] A/B testing: So sánh RL vs traditional methods (Logistic Regression, Random Forest)
- [ ] A/B testing: So sánh imputation methods (KNN vs Cluster Mean vs Weighted Avg)
- [ ] Hyperparameter tuning cho RL agents & Clustering algorithms

---

**Last Updated:** March 2026
**Version:** 2.0
