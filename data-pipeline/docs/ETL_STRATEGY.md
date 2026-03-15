# ETL Strategy – Traffic IoC Data Pipeline

> **Phiên bản**: Mar 2026  
> **Scope**: Quận 1 (60 corridors, ~11,678 segments)  
> **Mode hiện tại**: Multi-Key TomTom Pool + Gold Corridors (quality-first corridor dataset)

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
| 1      | 2,500       | ~40          | ~33             | Budget-Gated |
| 3      | 7,500       | ~122         | ~107            | Budget-Gated |
| 5      | 12,500      | ~204         | **~180**        | Budget-Gated |
| 6      | 15,000      | ~245         | ~217            | Budget-Gated |
| 10     | 25,000      | ~409         | ~365            | Budget-Gated |
| 20     | 50,000      | ~819         | **~734**        | Budget-Gated |

> Với runtime hiện tại, budget lớn không còn được dùng để phủ rộng toàn bộ network trước.
> Budget được dồn trước cho **gold corridor whitelist** để đảm bảo chất lượng corridor-level.

> **Công thức**: `budget/cycle = (N × 2500) ÷ 61`  
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

**Cập nhật mới:** Khi một request traffic gặp `HTTP 403`, extractor sẽ:
1. `mark_blocked(key)` cho key hiện tại
2. retry lại **chính point đó** với key tiếp theo
3. chỉ bỏ point nếu không còn key usable

Điều này giảm mất dữ liệu theo point khi trong pool có key hỏng/quota lỗi.

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

# Gold corridor dataset
TARGET_CORRIDOR_MIN_COVERAGE_PCT=0.60
GOLD_CORRIDOR_NAMES=Cách Mạng Tháng 8,Nguyễn Văn Linh,Nguyễn Hữu Thọ,Phạm Văn Đồng,Quốc lộ 1A Urban,Trường Chinh
```

Priority đọc key: `TOMTOM_API_KEYS` → `TOMTOM_API_KEY`.

Priority corridor filter:
- Nếu `GOLD_CORRIDOR_NAMES` rỗng: allocator dùng toàn bộ corridor candidates
- Nếu `GOLD_CORRIDOR_NAMES` có giá trị: realtime và batch chỉ xử lý corridor nằm trong whitelist này

---

## 3. Cửa sổ ETL và Lịch Scheduler

### 3.1 Cửa sổ hoạt động (giờ Việt Nam)

| Cửa sổ | Thời gian | Số cycle |
|--------|-----------|----------|
| Cả ngày | 06:00 – 21:00 | 61 slots (mỗi 15 phút, kể cả 21:00) |

Tổng: **61 cycles/ngày** — đây là hằng số mặc định `_CYCLES_PER_ACTIVE_DAY = 61`.

### 3.2 Luồng mỗi cycle

```
[Scheduler triggers run_realtime_then_batch()]
  │
  ├─► run-realtime --budget-mode --segment-limit <SAFE_TRAFFIC_SEGMENT_LIMIT>
  │     ├─ weather ETL     (OpenWeatherMap API)
  │     ├─ traffic ETL     (TomTom Flow API, chỉ cho gold corridors đã admit)
  │     └─ incident ETL    (TomTom Incident API)
  │
  └─► [nếu realtime thành công] run-batch  (ngay lập tức, không delay 15 phút)
        ├─ baseline ETL   (all segments → summary statistics)
        └─ corridor perf  (chỉ gold corridors để đồng nhất chất lượng)
```

**Timeout**: Realtime = 5 phút, Batch = 30 phút.

### 3.3 Quality-First Gold Corridor Selection

`run-realtime` luôn truyền `--segment-limit N` (N = `SAFE_TRAFFIC_SEGMENT_LIMIT`).
Khác với mode cũ “phủ rộng trước”, runtime hiện tại dùng **quality-first subset admission**:

**Bước 1 – Whitelist filter**
1. Nếu có `GOLD_CORRIDOR_NAMES`, chỉ giữ corridor trong whitelist
2. Các corridor ngoài whitelist bị loại khỏi tập corridor-quality dataset

**Bước 2 – Corridor admission**
1. Tính `min_target = ceil(total_segments * TARGET_CORRIDOR_MIN_COVERAGE_PCT)` cho từng corridor
2. Admit corridor theo thứ tự ưu tiên: `importance_level DESC`, sau đó corridor lớn trước
3. Chỉ admit thêm corridor nếu tổng floor cost vẫn nằm trong budget cycle

**Bước 3 – Pass 1**
1. Cấp đủ `min_target` cho tất cả corridor đã admit
2. Mục tiêu: mọi corridor trong tập gold đạt coverage sàn giống nhau

**Bước 4 – Pass 2**
1. Nếu còn budget, top-up tiếp cho corridor đã admit
2. Ưu tiên: L5 → L4 → còn lại

Kết quả:
- Ít corridor hơn
- Coverage per corridor cao hơn nhiều
- `fact_corridor_performance` đáng tin cậy hơn ở cấp corridor

---

## 4. Gold Corridor Reference

### 4.1 Tại sao bỏ “phủ rộng tất cả corridor”

- Khi budget bị dàn đều trên quá nhiều corridor, coverage từng corridor thấp
- Coverage thấp làm `fact_corridor_performance` bị bias mạnh theo hotspot segments
- ML/corridor analytics không còn đủ đại diện cho toàn corridor

### 4.2 Gold Corridor Mode (hiện tại)

| Thành phần | Vai trò |
|------------|---------|
| `GOLD_CORRIDOR_NAMES` | Chọn tập corridor vàng cần dữ liệu chất lượng cao |
| `TARGET_CORRIDOR_MIN_COVERAGE_PCT` | Coverage floor tối thiểu cho từng corridor được admit |
| `SAFE_TRAFFIC_SEGMENT_LIMIT` | Tổng budget segs/cycle |
| `run-batch` | Chỉ aggregate lại đúng tập corridor vàng |

**Lợi ích Gold Corridor Mode:**
- Corridor-level coverage cao, ổn định hơn
- Dữ liệu phù hợp hơn cho dashboard/KPI/ML ở cấp corridor
- Dễ giải thích với business: tập dữ liệu vàng có phạm vi rõ ràng

### 4.3 Runtime Example

Ví dụ runtime đã verify:
```
gold_whitelist=6
admitted_corridors=6/6
total_selected=1410

coverage preview:
  Nguyễn Hữu Thọ       -> 149/149 (100.0%)
  Trường Chinh         -> 190/190 (100.0%)
  Phạm Văn Đồng        -> 192/192 (100.0%)
  Cách Mạng Tháng 8    -> 241/241 (100.0%)
  Nguyễn Văn Linh      -> 271/271 (100.0%)
  Quốc lộ 1A Urban     -> 367/367 (100.0%)
```

Điểm quan trọng: đây là **100% trên tập segment đã được admit cho corridor-quality dataset**.

---

## 5. Daily Health Check – TomTom Keys

### 4.1 Mục đích

Chạy trước khi cửa sổ sáng bắt đầu (05:50) để:
- Xác nhận key nào còn hoạt động (`usable`)
- Phát hiện key bị block 403 (hết quota, bị thu hồi, lỗi entitlement)
- Tính `effective_budget/cycle` với số key thực sự usable
- Cảnh báo qua log nếu có key bị block

Ngoài ra, log realtime sẽ cho biết:
- key nào bị block trong cycle
- point nào được retry với key khác
- pool status cuối cycle (`BLOCKED` / `used/daily_limit`)

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

**Behavior mới khi ETL realtime:**
```text
TomTomKeyPool: key …de6etDq0 blocked for today (403/Forbidden)
Retry point (lat,lon) with next key after 403
```

Điều này có nghĩa là point đó **không bị mất ngay**, mà sẽ thử lại với key kế tiếp trong pool.

### 4.3 Ý nghĩa các chỉ số

| Chỉ số | Ý nghĩa |
|--------|---------|
| `usable_keys` | Số key probe thành công (HTTP 200) |
| `blocked_keys` | Số key bị từ chối (HTTP 403 hoặc lỗi mạng) |
| `effective_budget/cycle` | `usable_keys × 2500 ÷ 61` |
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

## 6. Thêm / thay key mới hoặc đổi Gold Corridors

### 6.1 Các bước

```powershell
# Bước 1: Mở và chỉnh sửa data-pipeline/.env
# Có thể cập nhật:
#   - TOMTOM_API_KEYS
#   - TARGET_CORRIDOR_MIN_COVERAGE_PCT
#   - GOLD_CORRIDOR_NAMES

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

# Bước 5: Chạy thử 1 cycle để verify whitelist/corridor coverage
docker compose exec data-pipeline python -m src.main run-cycle
```

### 6.2 Gợi ý vận hành Gold Corridors

- Bắt đầu với `5-8` corridor thực sự quan trọng
- Giữ `TARGET_CORRIDOR_MIN_COVERAGE_PCT=0.60` hoặc cao hơn
- Chỉ mở rộng whitelist khi coverage thực tế của tập hiện tại vẫn đạt yêu cầu
- Nếu nhiều key bị block, giảm số corridor vàng trước khi tăng whitelist

### 6.3 Bảng tham chiếu nhanh

```
.env comment đã có sẵn các mốc phổ biến:
#   1 key  ≈  63 segs/cycle
#   3 keys ≈ 192 segs/cycle
#   5 keys ≈ 327 segs/cycle
#   6 keys ≈ 393 segs/cycle
#  10 keys ≈ 656 segs/cycle
#  20 keys ≈ 1,323 segs/cycle
```

> Với chiến lược hiện tại, mục tiêu không còn là cover toàn bộ 60 corridors trong 1 cycle.  
> Mục tiêu là đảm bảo tập **gold corridors** có coverage cao và ổn định.

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

### 7.3 Batch vẫn ra nhiều corridor hơn whitelist

**Triệu chứng**: `fact_corridor_performance` vẫn có quá nhiều corridor.

**Kiểm tra**:
```powershell
docker compose exec data-pipeline python -m src.main run-batch
```
Log đúng phải có dạng:
```text
distinct_corridors=6, gold_whitelist=6
Loaded 6 records → fact_corridor_performance
```

**Nguyên nhân thường gặp**:
- container chưa rebuild sau khi đổi code/config
- `GOLD_CORRIDOR_NAMES` chưa được load vào container

### 7.4 ETL không chạy trong cửa sổ

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
| `src/core/config.py` | Thêm `tomtom_api_keys`, `tomtom_daily_limit_per_key`, `gold_corridor_names`, helper getters |
| `src/pipelines/real_time/traffic_pipeline.py` | Retry cùng point với key kế tiếp khi gặp `403` |
| `src/pipelines/ml_features/corridor_pipeline.py` | Batch aggregate chỉ cho gold corridors |
| `src/main.py` | Dynamic budget compute; `health-tomtom-keys`; `run-cycle`; quality-first gold corridor allocator |
| `scheduler/app.py` | Auto-budget từ env; `KEY_HEALTHCHECK_JOB`; daily cron 05:50 |
| `.env` | `TOMTOM_API_KEYS`; `TOMTOM_DAILY_LIMIT_PER_KEY`; `TARGET_CORRIDOR_MIN_COVERAGE_PCT`; `GOLD_CORRIDOR_NAMES` |
| `docker-compose.yml` | `etl-scheduler` service: thêm `env_file: - ./data-pipeline/.env` |
