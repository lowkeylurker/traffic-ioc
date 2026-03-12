# ETL Strategy – Traffic IoC Data Pipeline

> **Phiên bản**: Mar 2026  
> **Scope**: Quận 1 (60 corridors, ~11,678 segments)  
> **Mode hiện tại**: Multi-Key TomTom Pool — Budget-Gated (≤ 9 keys) hoặc Full-Coverage (≥ 10 keys)

---

## 1. Tổng quan kiến trúc

```
┌─────────────────────────────────────────────────────────────────┐
│                     etl-scheduler (APScheduler)                 │
│  Morning 06:00–10:00 │ Evening 16:00–20:00  │ Daily 05:50      │
│  Every 15 min        │ Every 15 min          │ Key Health Check │
└───────────┬─────────────────────┬────────────────────┬──────────┘
            │                     │                    │
            ▼                     ▼                    ▼
    run-realtime           run-realtime         health-tomtom-keys
    (weather → traffic     (weather → traffic   (probe each key
     → incidents)           → incidents)         via real API call)
            │
            └─► run-batch (chạy ngay sau nếu realtime thành công)
                 (baseline all + corridor perf Q1)
```

**Hai container chính:**
| Container | Image | Vai trò |
|---|---|---|
| `data-pipeline` | `data-pipeline:latest` | Thực thi ETL commands (CLI) |
| `etl-scheduler` | `etl-scheduler:latest` | Scheduler APScheduler, gọi CLI qua `docker exec` |

Cả hai đều đọc cùng file cấu hình: `data-pipeline/.env`.

---

## 2. Chiến lược Multi-Key API Pool

### 2.1 Vì sao cần pool nhiều key?

TomTom Free Tier giới hạn **2,500 req/key/ngày**. Với 60 corridors và 11,678 segments tổng cộng, một key đơn (~63 segs/cycle) chỉ đủ lấy dữ liệu cho ~5% segments mỗi cycle — quá ít để ML có chất lượng.

Giải pháp: **pool N keys** → tăng budget tuyến tính:

| Số key | Budget/ngày | Budget/cycle | Safe segs/cycle | Chế độ |
|--------|-------------|--------------|-----------------|--------|
| 1      | 2,500       | ~73          | ~63             | Budget-Gated |
| 3      | 7,500       | ~220         | ~195            | Budget-Gated |
| 5      | 12,500      | ~367         | **~327**        | Budget-Gated |
| 6      | 15,000      | ~441         | ~394            | Budget-Gated |
| 10     | 25,000      | ~735         | ~656            | Full-Coverage* |
| 20     | 50,000      | ~1,470       | **~1,323**      | **Full-Coverage** |

> \* **Full-Coverage**: `safe segs/cycle > max corridor size` → có thể load toàn bộ segments trong 1 corridor mỗi cycle, không cần cắt dữ liệu.
> Với 20 keys: `1,323 segs/cycle > 734` (corridor lớn nhất L5) → **tất cả 60 corridors** đều fit trong budget 1 cycle.

> **Công thức**: `budget/cycle = (N × 2500) ÷ 34`  
> **Safe limit** = `max(1, (budget/cycle − 3) × 0.90)` (trừ 3 req non-traffic, headroom 10%)

### 2.2 Cơ chế TomTomKeyPool (`src/core/api_key_pool.py`)

```
TomTomKeyPool
├── get_next_key()      → Chọn key có usage thấp nhất hôm nay
│                          (trả None nếu tất cả đã hết / bị block)
├── record_success(key) → Tăng daily counter cho key đó
├── mark_blocked(key)   → Block key đến hết ngày (khi nhận HTTP 403)
└── status()            → Dict usage, blocked set, budget/cycle
```

**Auto-reset**: Mỗi khi `date.today()` thay đổi, toàn bộ counter và blocked set được reset.

**Module singleton**: Gọi `get_key_pool()` ở bất cứ đâu đều trả về cùng một instance trong process.

### 2.3 Cấu hình trong `.env`

```dotenv
# Bắt buộc: comma-separated, ưu tiên hơn TOMTOM_API_KEY
TOMTOM_API_KEYS=key1,key2,key3,key4,key5,key6

# Fallback single-key (nếu TOMTOM_API_KEYS trống)
TOMTOM_API_KEY=key1

# Giới hạn/ngày/key (mặc định: 2500 free tier)
TOMTOM_DAILY_LIMIT_PER_KEY=2500
```

Priority đọc key: `TOMTOM_API_KEYS` → `TOMTOM_API_KEY`.

---

## 3. Cửa sổ ETL và Lịch Scheduler

### 3.1 Hai cửa sổ hoạt động (giờ Việt Nam)

| Cửa sổ | Thời gian | Số cycle |
|--------|-----------|----------|
| Sáng   | 06:00 – 10:00 | 17 slots (mỗi 15 phút, kể cả 10:00) |
| Chiều  | 16:00 – 20:00 | 17 slots (mỗi 15 phút, kể cả 20:00) |

Tổng: **34 cycles/ngày** — đây là hằng số `_CYCLES_PER_ACTIVE_DAY = 34`.

### 3.2 Luồng mỗi cycle

```
[Scheduler triggers run_realtime_then_batch()]
  │
  ├─► run-realtime --budget-mode --segment-limit <SAFE_TRAFFIC_SEGMENT_LIMIT>
  │     ├─ weather ETL     (OpenWeatherMap API)
  │     ├─ traffic ETL     (TomTom Flow API, dùng pool, ≤ safe limit segs)
  │     └─ incident ETL    (TomTom Incident API)
  │
  └─► [nếu realtime thành công] run-batch  (ngay lập tức, không delay 15 phút)
        ├─ baseline ETL   (all segments → summary statistics)
        └─ corridor perf  (Quận 1 corridors performance metrics)
```

**Timeout**: Realtime = 5 phút, Batch = 30 phút.

### 3.3 Budget-gated vs Full-Coverage segment selection

`run-realtime` luôn truyền `--segment-limit N` (N = `SAFE_TRAFFIC_SEGMENT_LIMIT`). Logic xử lý tùy theo tỉ lệ `N / max_corridor_size`:

**Chế độ Budget-Gated** (`N < tổng segments`, thường ≤ 9 keys):
1. Sort corridors theo priority (L5 → L4 → L3)
2. Với mỗi corridor, lấy tối đa `min(corridor_size, remaining_budget)` segments
3. Dừng khi tổng segments đã chọn đạt `N`
4. Kết quả: mỗi cycle chỉ cover một phần corridors, xoay vòng qua các cycles

**Chế độ Full-Coverage** (`N ≥ 1,323` — 20 keys):
- `N = 1,323 > 734` (corridor lớn nhất) → **mọi corridor đều fit trong 1 cycle**
- Tổng segments = 11,678 → cần **8.8 cycles để cover 1 vòng đầy đủ** tất cả segments
- Với 34 cycles/ngày: hệ thống hoàn thành **~3.8 vòng coverage đầy đủ/ngày**
- Cache chuyển từ vai trò **primary** sang **failsafe** (dữ liệu live luôn fresh hơn cache)
- `--segment-limit` vẫn được truyền vào như cơ chế safety cap, không phải bottleneck

---

## 4. Scaling Mode Reference

### 4.1 Budget-Gated Mode (1–9 keys)

- `safe segs/cycle < tổng segments` → phải chọn lọc, không load hết
- Chiến lược ACR (Atomic Corridor Rotation): ưu tiên corridors L5 trước, load đủ budget rồi dừng
- Cache quan trọng: segments chưa được ETL trong cycle này dựa vào cached data từ cycle trước
- ML data quality: có thể có temporal gaps giữa các corridors (L3 ít được refresh hơn)

### 4.2 Full-Coverage Mode (≥ 10 keys, ví dụ 20 keys)

| Chỉ số | Giá trị với 20 keys |
|--------|---------------------|
| Safe segs/cycle | ~1,323 |
| Cycles để 1 vòng đầy đủ | 11,678 ÷ 1,323 ≈ **8.8 cycles** (~2.2 giờ) |
| Vòng đầy đủ/ngày | 34 ÷ 8.8 ≈ **3.8 vòng** |
| Max corridor size (L5) | 734 segs < 1,323 → **fit 1 cycle** |
| Cache strategy | Failsafe only (không cần cho data freshness) |

**Lợi ích Full-Coverage cho ML:**
- Không có spatial bias: tất cả corridors được update đồng đều
- Temporal freshness: mọi segment có data ≤ 2.5 giờ cũ (worst case)
- Đủ dữ liệu để huấn luyện sequence model trên toàn mạng lưới

### 4.3 Transition giữa hai mode

Không cần thay đổi code khi thêm key. Budget và mode tự động điều chỉnh:
```
.env: TOMTOM_API_KEYS=... (thêm/bớt keys)
  └► scheduler auto-compute SAFE_TRAFFIC_SEGMENT_LIMIT
  └► traffic_pipeline dùng pool mới
  └► Nếu limit > max_corridor: effectively full-coverage
```

---

## 5. Daily Health Check – TomTom Keys

### 4.1 Mục đích

Chạy trước khi cửa sổ sáng bắt đầu (05:50) để:
- Xác nhận key nào còn hoạt động (`usable`)
- Phát hiện key bị block 403 (hết quota, bị thu hồi, lỗi entitlement)
- Tính `effective_budget/cycle` với số key thực sự usable
- Cảnh báo qua log nếu có key bị block

### 4.2 Cách chạy thủ công

```powershell
# Từ thư mục gốc project (nơi có docker-compose.yml)
docker compose exec data-pipeline python -m src.main health-tomtom-keys
```

**Output mẫu:**

```
╭──────────────────────────────────────────────────╮
│ 🔎 TOMTOM KEY HEALTH CHECK                       │
│ Probe endpoint: traffic flow absolute/10/json    │
╰──────────────────────────────────────────────────╯
 Key            Status      Detail
 ...EFh6or4C   usable      HTTP 200
 ...zaiV6eWx   usable      HTTP 200
 ...IiH8FbYf   usable      HTTP 200
 ...zjtQ7uYG   usable      HTTP 200
 ...de6etDq0   blocked     HTTP 403 (Forbidden / entitlement / quota)
 ...SuYU0d     usable      HTTP 200

usable_keys=5 | blocked_keys=1 | effective_budget/cycle=368 req | safe_traffic_segment_limit/cycle=328
```

### 4.3 Ý nghĩa các chỉ số

| Chỉ số | Ý nghĩa |
|--------|---------|
| `usable_keys` | Số key probe thành công (HTTP 200) |
| `blocked_keys` | Số key bị từ chối (HTTP 403 hoặc lỗi mạng) |
| `effective_budget/cycle` | `usable_keys × 2500 ÷ 34` |
| `safe_traffic_segment_limit/cycle` | `(effective_budget/cycle − 3) × 0.90` |

> **Exit code**: 0 nếu có ≥ 1 key usable, 1 nếu tất cả blocked (có thể dùng trong CI / alerting).

### 4.4 Scheduler tự động (05:50 VN)

```python
# scheduler/app.py
scheduler.add_job(
    run_daily_key_healthcheck,
    CronTrigger(hour="5", minute="50", timezone=VN_TZ),
    id="key-healthcheck-daily",
    name="TomTom Key Healthcheck (Daily 05:50)",
    coalesce=True,
    max_instances=1,
)
```

Kết quả được ghi vào `scheduler/logs/tomtom-key-healthcheck.log`.

---

## 6. Thêm / thay key mới

### 5.1 Các bước

```powershell
# Bước 1: Mở và chỉnh sửa data-pipeline/.env
# Thêm key mới vào TOMTOM_API_KEYS (nối tiếp sau dấu phẩy)

# Bước 2: Recreate containers để load env mới
docker compose up -d --force-recreate data-pipeline etl-scheduler

# Bước 3: Xác nhận key đã được load
docker compose exec data-pipeline python -c "
from src.core.config import settings
keys = settings.get_tomtom_keys()
print(f'{len(keys)} keys loaded:')
for k in keys: print(f'  ...{k[-8:]}')
"

# Bước 4: Probe tất cả key và xem budget mới
docker compose exec data-pipeline python -m src.main health-tomtom-keys
```

### 5.2 Bảng tham chiếu nhanh

```
.env comment đã có sẵn các mốc phổ biến:
#   1 key  ≈  63 segs/cycle
#   3 keys ≈ 192 segs/cycle
#   5 keys ≈ 327 segs/cycle
#   6 keys ≈ 393 segs/cycle
#  10 keys ≈ 656 segs/cycle
#  20 keys ≈ 1,323 segs/cycle
```

> Với 60 corridors và L5 trung bình 302 segs (max 734), cần **≥ 10 keys** để cover hết tất cả corridors L5 trong 1 cycle.  
> Với **20 keys** (~1,323 segs/cycle): toàn bộ 60 corridors fit trong 1 cycle, đạt **full-coverage mode** — 3.8 vòng quét đầy đủ mỗi ngày.

---

## 7. Chẩn đoán sự cố thường gặp

### 6.1 Budget thấp bất thường

**Triệu chứng**: Log scheduler hiển thị `SAFE_TRAFFIC_SEGMENT_LIMIT` thấp hơn mong đợi.

**Kiểm tra**:
```powershell
docker compose logs etl-scheduler | Select-String "Request budget|key_count"
```
Nếu `key_count=1` dù đã thêm nhiều key → `etl-scheduler` chưa đọc được `TOMTOM_API_KEYS`.

**Fix**:
```powershell
# Đảm bảo docker-compose.yml có env_file cho etl-scheduler
docker compose up -d --force-recreate etl-scheduler
```

### 6.2 Tất cả key báo blocked

**Nguyên nhân có thể**:
- Mạng container bị lỗi (DNS / egress)
- TomTom API đang downtime
- Tất cả key đã hết quota ngày hôm đó

**Kiểm tra từ bên ngoài Docker**:
```powershell
curl "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=10.7764,106.7011&unit=KMPH&key=YOUR_KEY"
```

**Nếu chỉ 1 key bị block**: Đó là key đã hết quota hoặc bị TomTom thu hồi. Loại key đó khỏi `TOMTOM_API_KEYS` và thay bằng key mới.

### 6.3 ETL không chạy trong cửa sổ

**Kiểm tra lịch APScheduler**:
```powershell
docker compose logs etl-scheduler | Select-String "Scheduler started|Next run"
```

**Kiểm tra xem cycle có đang bị skip** (do vẫn còn cycle trước chạy):
```powershell
docker compose logs etl-scheduler | Select-String "CYCLE START|CYCLE END|coalesce"
```

---

## 8. Tóm tắt files đã thay đổi

| File | Thay đổi |
|------|----------|
| `src/core/api_key_pool.py` | **MỚI** — `TomTomKeyPool` singleton, thread-safe rotation |
| `src/core/config.py` | Thêm `tomtom_api_keys`, `tomtom_daily_limit_per_key`, `get_tomtom_keys()` |
| `src/pipelines/real_time/traffic_pipeline.py` | `TrafficExtractor` nhận `key_pool`, gọi `get_key_pool()` auto |
| `src/main.py` | Dynamic budget compute; command `health-tomtom-keys`; `import os` fix |
| `scheduler/app.py` | Auto-budget từ env; `KEY_HEALTHCHECK_JOB`; daily cron 05:50 |
| `.env` | `TOMTOM_API_KEYS` với N keys; `TOMTOM_DAILY_LIMIT_PER_KEY` |
| `docker-compose.yml` | `etl-scheduler` service: thêm `env_file: - ./data-pipeline/.env` |
