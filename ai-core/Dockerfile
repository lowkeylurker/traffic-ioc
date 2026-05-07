# ════════════════════════════════════════════════════════════════════════════════
# DOCKERFILE - AI-CORE SERVICE
# Traffic Forecasting, Congestion Prediction & Data Imputation
# ════════════════════════════════════════════════════════════════════════════════

# ════════════════════════════════════════════════════════════════════════════════
# STAGE 1: BASE IMAGE - Python 3.9 slim
# ════════════════════════════════════════════════════════════════════════════════
FROM python:3.9-slim as base

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies (cần cho numpy, scipy, torch, psycopg2)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    git \
    curl \
    wget \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# ════════════════════════════════════════════════════════════════════════════════
# STAGE 2: DEPENDENCIES - Install Python packages
# ════════════════════════════════════════════════════════════════════════════════
# Copy requirements trước để tận dụng Docker layer caching
COPY requirements.txt .
COPY requirements-ml.txt .
COPY requirements-dev.txt .

# Build argument để chọn có cài ML dependencies hay không
ARG INSTALL_ML=false

# Install runtime dependencies (luôn luôn cài)
RUN pip install --no-cache-dir -r requirements.txt

# Install test tooling for CI-style checks inside container
RUN pip install --no-cache-dir \
    pytest==7.4.3 \
    pytest-cov==4.1.0 \
    pytest-mock==3.12.0 \
    pytest-asyncio==0.21.1 \
    httpx==0.24.1

# Install ML dependencies (chỉ khi cần - mất ~15-20 phút)
# Build với: docker-compose build --build-arg INSTALL_ML=true ai-core
RUN if [ "$INSTALL_ML" = "true" ]; then \
        pip install --no-cache-dir -r requirements-ml.txt; \
    fi

# ════════════════════════════════════════════════════════════════════════════════
# STAGE 3: APPLICATION - Copy source code
# ════════════════════════════════════════════════════════════════════════════════
# Copy toàn bộ code
COPY . .

# Tạo thư mục models nếu chưa tồn tại (do .gitignore)
RUN mkdir -p ./models/traffic_forecast ./models/congestion_rl ./models/clustering

# ════════════════════════════════════════════════════════════════════════════════
# STAGE 4: HEALTH CHECK
# ════════════════════════════════════════════════════════════════════════════════
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/health-check || exit 1

# ════════════════════════════════════════════════════════════════════════════════
# STAGE 5: EXPOSE & ENTRY POINT
# ════════════════════════════════════════════════════════════════════════════════
# Expose port
EXPOSE 80

# Default command: Run FastAPI server
CMD ["uvicorn", "src.api.app:app", "--host", "0.0.0.0", "--port", "5000"]

# ════════════════════════════════════════════════════════════════════════════════
# BUILD INSTRUCTIONS:
# ════════════════════════════════════════════════════════════════════════════════
# Runtime only (nhanh ~2-3 phút):
#   docker build -t traffic-ioc/ai-core:latest .
#   docker run -p 5000:5000 --env-file .env traffic-ioc/ai-core:latest
#
# Với ML dependencies (chậm ~15-20 phút):
#   docker build --build-arg INSTALL_ML=true -t traffic-ioc/ai-core:ml .
#   docker run -p 5000:5000 --env-file .env traffic-ioc/ai-core:ml
#
# Với docker-compose:
#   docker-compose build ai-core                                    # Runtime only
#   docker-compose build --build-arg INSTALL_ML=true ai-core        # With ML