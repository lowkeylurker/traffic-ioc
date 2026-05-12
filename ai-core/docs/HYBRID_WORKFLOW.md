# AI-Core Hybrid Workflow (Local + Docker)

Tài liệu này là quy trình thực chiến cho người mới, để bạn:
- code nhanh và debug dễ dàng bằng Local
- vẫn đảm bảo chạy đúng toàn hệ thống bằng Docker

Áp dụng cho repo: `traffic-ioc`, service: `ai-core`.

## 1. Mục tiêu của hybrid workflow

- Local mode: vòng lặp code → chạy → sửa lỗi nhanh nhất.
- Docker mode: xác nhận tích hợp thật với Postgres và compose trước khi push/demo.
- Không dùng Docker cho mọi thay đổi nhỏ, để tránh tốn thời gian build.

## 2. Quyết định nhanh: Local hay Docker?

Chọn **Local** nếu:
- bạn đang code logic mới
- cần debug breakpoint/trace chi tiết
- thay đổi liên tục trong ngày

Chọn **Docker** nếu:
- bạn cần test tích hợp với các service khác
- trước khi push, merge, demo
- cần xác nhận mọi thứ chạy đúng trong môi trường gần production

## 3. One-time setup (làm 1 lần)

### 3.1 Khởi động Postgres (và service cần thiết) bằng Docker

```powershell
cd "c:\Users\Thanh Dung\Documents\MYDATA\BKU\4\2\DATN\project_folder\traffic-ioc"
docker-compose up -d postgres
```

Có thể thêm redis nếu cần:

```powershell
docker-compose --profile with-redis up -d redis
```

### 3.2 [OPTIONAL] Tạo file env cho ai-core (nếu chạy local hoặc test)

```powershell
Copy-Item ai-core/.env.example ai-core/.env -Force
```

Nếu chạy local cùng Postgres trong Docker, dùng host/port sau trong `ai-core/.env`:
- `DB_HOST=localhost`
- `DB_PORT=5433`

Lý do: Postgres container map `5433 -> 5432` trên máy host.

### 3.3 [OPTIONAL] Tạo Python env cho local development chỉ khi cần debug

```powershell
# SKIP phần này nếu bạn quyết định chạy Docker luôn
# Chỉ chạy nếu cần debug breakpoint/coding cường độ cao trên local

python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r ai-core/requirements.txt
pip install -r ai-core/requirements-dev.txt
```

## 4. Daily workflow (đề nghị)

## 4.1 Nếu chạy Docker: khởi động ai-core service

```powershell
cd "c:\Users\Thanh Dung\Documents\MYDATA\BKU\4\2\DATN\project_folder\traffic-ioc"

# Step 1: Đảm bảo Postgres chạy
docker-compose ps postgres

# Step 2: Build ai-core image (lần đầu hoặc khi dependencies thay đổi)
docker-compose build ai-core

# Step 3: Chạy ai-core
docker-compose up -d ai-core

# Step 4: Kiểm tra log
docker-compose logs -f ai-core
```

Kiểm tra nhanh:
- Health: `http://localhost:5000/health-check`
- Swagger: `http://localhost:5000/docs`
- Logs: `docker-compose logs ai-core` hoặc `docker-compose logs -f ai-core --tail 50`

## 4.2 [OPTIONAL] Nếu cần debug local: buổi sáng vào local mode

```powershell
cd "c:\Users\Thanh Dung\Documents\MYDATA\BKU\4\2\DATN\project_folder\traffic-ioc"
.\.venv\Scripts\Activate.ps1
uvicorn src.api.app:app --host 0.0.0.0 --port 5000 --reload --app-dir ai-core
```

Kiểm tra nhanh:
- Health: `http://localhost:5000/health-check`
- Swagger: `http://localhost:5000/docs`

Nếu cần test:

```powershell
pytest ai-core/src/tests -v
```

## 4.3 Trong ngày: lặp vòng development

## 5. Weekly hygiene (nên làm)

Do bạn đã gặp lỗi BuildKit snapshot trước đó, mỗi tuần nên dọn cache 1 lần:

```powershell
docker builder prune -af
docker buildx prune -af
```

Nếu vẫn có lỗi snapshot khi export image:
1. restart Docker Desktop
2. build lại với `--no-cache`

```powershell
docker-compose build --no-cache ai-core
```

## 6. Checklist trước khi push

- Local run OK (`uvicorn --reload`)
- Test liên quan OK (`pytest ...`)
- Docker build OK (`docker-compose build ai-core`)
- Docker run OK (`docker-compose up -d ai-core`)
- Health-check OK

Nếu 5 mục này đều OK, bạn có thể push an toàn.

## 7. Mẫu lịch làm việc dễ dễ theo

- 09:00-17:00: Local mode là mặc định
- Trước commit lớn: chạy test local
- 1 lần/cuối ngày: Docker gate cho ai-core
- Trước demo/review: Docker gate + log check

Quy tắc vàng: **Code bằng Local, xác nhận bằng Docker.**
