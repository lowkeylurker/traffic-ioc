# 📦 DEPLOYMENT GUIDE - AI-CORE Service

## 📋 Tóm tắt những gì đã được hoàn thành

Tôi đã chuẩn bị đầy đủ environment configuration, Docker setup, và dependencies cho AI-Core service theo yêu cầu trong README.md.

---

## 📁 Files đã được tạo/cập nhật

### 1. **requirements.txt** ✅
   - File: `ai-core/requirements.txt`
   - Nội dung: 
     - ✅ FastAPI + Uvicorn (Web framework)
     - ✅ PyTorch (Deep Learning)
     - ✅ scikit-learn (Machine Learning)
     - ✅ numpy, pandas (Data processing)
     - ✅ gymnasium (Reinforcement Learning)
     - ✅ stable-baselines3 (RL algorithms)
     - ✅ SQLAlchemy + psycopg2 (Database)
     - ✅ Pydantic (Data validation)
     - ✅ typer (CLI framework)
     - ✅ pytest + pytest-cov (Testing)
     - ✅ matplotlib, seaborn, plotly (Visualization)
     - ✅ structlog (Logging)
   - **Total: 45+ packages** với versions cụ thể

### 2. **Dockerfile** ✅
   - File: `ai-core/Dockerfile`
   - Features:
     - ✅ Base: Python 3.9-slim (lightweight)
     - ✅ System dependencies (build-essential, libpq-dev, git)
     - ✅ Environment variables (PYTHONUNBUFFERED, etc.)
     - ✅ Layer caching optimization
     - ✅ Model directories creation
     - ✅ Health check endpoint
     - ✅ Port exposure: 5000
     - ✅ Default command: `uvicorn src.api.app:app --host 0.0.0.0 --port 5000`

### 3. **docker-compose.yml** ✅
   - File: `docker-compose.yml` (root)
   - Cập nhật ai-core service:
     - ✅ Build context: `./ai-core`
     - ✅ Port: 5000 (thay vì 8000)
     - ✅ Command: `uvicorn src.api.app:app --host 0.0.0.0 --port 5000 --reload`
     - ✅ Volumes: app code + models directory
     - ✅ Environment variables từ .env
     - ✅ Health check (curl /health-check)
     - ✅ Depends on: postgres (healthy)
     - ✅ Networks: traffic-network
   - Redis: Optional (profiles: with-redis)

### 4. **.env.example (ai-core)** ✅
   - File: `ai-core/.env.example`
   - Variables:
     - Database: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_SCHEMA
     - API Service: AI_SERVICE_HOST, AI_SERVICE_PORT, AI_LOG_LEVEL
     - Model Paths: FORECAST_MODEL_PATH, RL_CONGESTION_MODEL_PATH, etc.
     - Forecast Config: FORECAST_HORIZON, FORECAST_HISTORY_WINDOW, etc.
     - RL Config: RL_ALGORITHM, RL_CONGESTION_THRESHOLD, etc.
     - Clustering Config: CLUSTERING_ALGORITHM, IMPUTATION_METHOD, etc.
     - Optional: REDIS_HOST, REDIS_PORT

### 5. **.env (ai-core)** ✅
   - File: `ai-core/.env`
   - **Ready for development** với values mặc định
   - DB_HOST=postgres (for Docker Compose)
   - AI_SERVICE_PORT=5000
   - ENVIRONMENT=development, DEBUG=true

### 6. **.env.example (root)** ✅
   - File: `.env.example` (root)
   - Unified environment configuration cho toàn project
   - Bao gồm: Database, Redis, Data-Pipeline, AI-Core, Backend, Frontend, Project Info

### 7. **START.md** ✅
   - File: `START.md`
   - Cập nhật guide:
     - Full Stack setup (Database + AI-Core + Backend + Frontend)
     - AI-Core standalone setup (FastAPI development)
     - Service verification (health checks)
     - Common issues & troubleshooting

---

## 🚀 Cách sử dụng

### Option 1: Docker (Recommended for Production)

```bash
# 1. Clone config từ template
cp .env.example .env

# 2. Start all services
docker-compose up -d

# 3. Verify AI-Core is running
curl http://localhost:5000/health-check

# 4. View API docs
open http://localhost:5000/docs

# 5. Check logs
docker-compose logs -f ai-core
```

### Option 2: Local Development (FastAPI)

```bash
cd ai-core

# Setup Python environment
python -m venv venv
source venv/Scripts/activate  # or: venv\Scripts\activate on Windows

# Install dependencies
pip install -r requirements.txt

# Copy config
cp .env.example .env

# Run tests
pytest src/tests/ -v

# Start API server
uvicorn src.api.app:app --host 0.0.0.0 --port 5000 --reload
```

### Option 3: Docker with Specific Port

```bash
# If port 5000 is already in use
docker-compose up -d -e AI_SERVICE_PORT=5001
```

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker Compose Network                  │
│                    (traffic-network bridge)                 │
└─────────────────────────────────────────────────────────────┘
         
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │ PostgreSQL   │  │   Redis      │  │Data-Pipeline │
    │   :5432      │  │  :6379       │  │   :8001      │
    │   (primary)  │  │  (optional)  │  │   (CLI)      │
    └──────────────┘  └──────────────┘  └──────────────┘
           △                                    │
           │                                    │
           └────────────────┬───────────────────┘
                            │
                    ┌───────▼────────┐
                    │   AI-CORE      │
                    │   :5000        │
                    │ (FastAPI)      │
                    │                │
                    │  - Forecasting │
                    │  - RL Congestion
                    │  - Clustering  │
                    └────────────────┘
```

---

## 🔧 Key Environment Variables

| Variable | Mock Value | Purpose |
|:---------|:-----------|:--------|
| `DB_HOST` | postgres | PostgreSQL hostname (docker name) |
| `DB_PORT` | 5432 | PostgreSQL port |
| `DB_USER` | postgres | PostgreSQL user |
| `DB_PASSWORD` | postgres | PostgreSQL password |
| `DB_NAME` | traffic_ioc_db | Database name |
| `AI_SERVICE_PORT` | 5000 | FastAPI port |
| `FORECAST_HORIZON` | 15 | Minutes to forecast ahead |
| `RL_ALGORITHM` | dqn | RL algorithm (dqn or ppo) |
| `CLUSTERING_ALGORITHM` | kmeans | Clustering algo (kmeans or dbscan) |
| `IMPUTATION_METHOD` | knn | Imputation method (knn, cluster_mean, weighted_average) |

---

## ✅ Verification Checklist

After starting services:

- [ ] `docker-compose ps` shows all services running
- [ ] `curl http://localhost:5000/health-check` returns 200 OK
- [ ] `docker-compose logs ai-core` shows no errors
- [ ] `http://localhost:5000/docs` (Swagger UI) is accessible
- [ ] Database connection test passes
- [ ] Models directories exist: `./models/traffic_forecast`, `./models/congestion_rl`, `./models/clustering`

---

## 📝 Next Steps

1. **Train Models:**
   - Implement LSTM forecasting model training
   - Train DQN/PPO RL agents
   - Train K-Means clustering

2. **Implement Features:**
   - Feature engineering (traffic_features.py)
   - Model wrappers (LSTM, RandomForest, Ensemble)
   - RL environment (gym.Env)
   - Clustering & imputation logic

3. **API Endpoints:**
   - `/api/v1/forecast` - Traffic speed prediction
   - `/api/v1/congestion-prediction` - RL-based congestion prediction
   - `/api/v1/impute-missing-data` - Data imputation

4. **Testing:**
   - Unit tests (pytest)
   - Integration tests
   - Performance benchmarks

5. **Deployment:**
   - CI/CD pipeline (GitHub Actions)
   - Model versioning
   - Monitoring & logging
   - Production environment (.env.production)

---

## 📚 References

- **AI Documentation:** See `ai-core/README.md`
- **Project Overview:** See main `README.md`
- **Data Pipeline:** See `data-pipeline/README.md`
- **Backend API:** See `backend/README.md`
- **Quick Start:** See `START.md`

---

**Last Updated:** March 6, 2026  
**Status:** ✅ Ready for Development
