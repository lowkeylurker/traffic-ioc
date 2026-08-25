# Multi-stage build with Astral uv for fast, deterministic Python packaging
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS builder

WORKDIR /app

# Enable bytecode compilation and copy mode
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

# Install dependencies using lockfile / pyproject
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock,errors=ignore \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-install-project --no-dev || uv sync --no-install-project --no-dev

# Final runtime image
FROM python:3.11-slim-bookworm

WORKDIR /app

# Install system dependencies for PDF parsing / OCR tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libmupdf-dev \
    tesseract-ocr \
    tesseract-ocr-vie \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual environment from builder
COPY --from=builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

# Copy application source code
COPY pyproject.toml README.md ./
COPY src/ ./src/

EXPOSE 8001

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8001"]
