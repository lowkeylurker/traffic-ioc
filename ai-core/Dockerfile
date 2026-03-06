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
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# ════════════════════════════════════════════════════════════════════════════════
# STAGE 2: DEPENDENCIES - Install Python packages
# ════════════════════════════════════════════════════════════════════════════════
# Copy requirements trước để tận dụng Docker layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

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
EXPOSE 5000

# Default command: Run FastAPI server
CMD ["uvicorn", "src.api.app:app", "--host", "0.0.0.0", "--port", "5000"]

# ════════════════════════════════════════════════════════════════════════════════
# BUILD INSTRUCTIONS:
# ════════════════════════════════════════════════════════════════════════════════
# docker build -t traffic-ioc/ai-core:latest .
# docker run -p 5000:5000 --env-file .env traffic-ioc/ai-core:latest