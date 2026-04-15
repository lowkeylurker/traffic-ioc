# Requirements Files - Hướng dẫn sử dụng

Module `ai-core` có 3 file requirements tách biệt để tối ưu tốc độ cài đặt:

## 📦 File requirements và mục đích

### 1. `requirements.txt` - Runtime (Bắt buộc)
**Dung lượng:** ~200MB  
**Thời gian cài:** 2-3 phút  
**Khi nào cài:** Luôn luôn, cho cả local dev và Docker

**Bao gồm:**
- FastAPI + Uvicorn (API server)
- SQLAlchemy + psycopg2 (Database)
- Pydantic (Data validation)
- Pandas + NumPy (Data processing cơ bản)

**Cài:**
```bash
pip install -r requirements.txt
```

---

### 2. `requirements-dev.txt` - Development Tools (Tùy chọn)
**Dung lượng:** ~50MB  
**Thời gian cài:** 1-2 phút  
**Khi nào cài:** Khi cần testing, linting, formatting

**Bao gồm:**
- pytest (+ coverage, mock, asyncio)
- black, flake8, mypy, isort
- requests (cho API testing)

**Cài:**
```bash
pip install -r requirements-dev.txt
```

---

### 3. `requirements-ml.txt` - Machine Learning (Tùy chọn, nặng)
**Dung lượng:** ~3-4GB  
**Thời gian cài:** 15-20 phút  
**Khi nào cài:** Chỉ khi cần training hoặc inference model

**Bao gồm:**
- PyTorch + torchvision (Deep Learning)
- scikit-learn, scipy (Classical ML)
- stable-baselines3, gymnasium (Reinforcement Learning)
- matplotlib, seaborn, plotly (Visualization)
- typer, structlog, tqdm (CLI & utilities)

**Cài:**
```bash
pip install -r requirements-ml.txt
```

---

## 🚀 Workflow đề xuất

### Local Development (Hybrid Mode)

**Bước 1: Setup ban đầu**
```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install --upgrade pip

# Cài runtime
pip install -r ai-core/requirements.txt

# Cài dev tools (nếu cần test/lint)
pip install -r ai-core/requirements-dev.txt
```

**Bước 2: Code hằng ngày**
- Chỉ cần runtime đã đủ để chạy API và kết nối DB
- Không cần ML packages nếu chưa implement training/inference

**Bước 3: Khi cần ML**
```bash
# Cài ML packages khi implement LSTM, RL, hoặc clustering
pip install -r ai-core/requirements-ml.txt
```

---

### Docker Build

**Runtime only (nhanh):**
```bash
docker-compose build ai-core
# Hoặc
docker build -t traffic-ioc/ai-core:latest ai-core/
```

**Với ML dependencies (chậm):**
```bash
docker-compose build --build-arg INSTALL_ML=true ai-core
# Hoặc
docker build --build-arg INSTALL_ML=true -t traffic-ioc/ai-core:ml ai-core/
```

---

## 📊 So sánh

| File | Dung lượng | Thời gian | Khi nào dùng |
|------|------------|-----------|--------------|
| `requirements.txt` | ~200MB | 2-3 phút | Luôn luôn (runtime) |
| `requirements-dev.txt` | ~50MB | 1-2 phút | Khi dev (test/lint) |
| `requirements-ml.txt` | ~3-4GB | 15-20 phút | Khi train/inference |

---

## 💡 Tips

1. **Không cài tất cả ngay từ đầu** - Chỉ cài `requirements.txt` trước
2. **Cài ML sau** - Chỉ khi thật sự cần train model
3. **Docker nhẹ hơn** - Build image không có ML cho CI/CD nhanh
4. **Local linh hoạt** - Cài từng file theo nhu cầu

---

## 🔧 Troubleshooting

**Lỗi khi cài PyTorch trên Windows:**
```bash
# Cài từ trang chính thức thay vì PyPI
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
```

**Lỗi psycopg2 trên Windows:**
```bash
# Dùng binary version
pip install psycopg2-binary==2.9.9
```

**Cài lại từ đầu:**
```bash
pip uninstall -y -r requirements.txt
pip uninstall -y -r requirements-dev.txt
pip uninstall -y -r requirements-ml.txt
pip install --no-cache-dir -r requirements.txt
```
