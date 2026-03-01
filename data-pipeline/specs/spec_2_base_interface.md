# SPEC 2 – TIÊU CHUẨN KỸ THUẬT & KHUÔN MẪU THIẾT KẾ (TECH STACK & BASE INTERFACES)

## MODULE `data-pipeline/`

| Metadata | Giá trị |
|:---------|:--------|
| **Phiên bản** | 2.0 |
| **Ngày cập nhật** | 2026-02-28 |
| **File target** | `src/pipelines/base.py`, `src/core/exceptions.py`, `src/core/logger.py` |
| **Specs liên quan** | `spec_1_blueprint.md` (vị trí file), `spec_3_data_contracts.md` (schema fields), `spec_5_target_mapping.md` (UPSERT rules) |

---

## 0. MỤC ĐÍCH CỦA FILE NÀY

Spec này **"trói buộc"** Agent phải dùng đúng:
1. **Thư viện** nào, **phiên bản** nào, dùng **ở đâu**.
2. **Khuôn mẫu kiến trúc** (Abstract Base Classes) cho Extractor / Transformer / Loader.
3. **Cách xử lý lỗi** thống nhất toàn module.
4. **Tiêu chuẩn coding** bắt buộc (type hints, naming, import).

> **QUY TẮC VÀNG:** Bất kỳ class Pipeline nào cũng **PHẢI** kế thừa từ 3 ABC định nghĩa ở đây. Không tự chế pattern riêng.

---

## 1. TECH STACK – THƯ VIỆN BẮT BUỘC

### 1.1 Bảng tổng hợp thư viện

| Thư viện | Phiên bản | Vị trí sử dụng | Mục đích |
|:---------|:----------|:----------------|:---------|
| `python` | `>=3.9` | Toàn bộ | Runtime. Cho phép `list[dict]` thay vì `List[Dict]` |
| `pydantic` | `>=2.0` | `src/schemas/*.py` | Validate JSON data từ API. V2 bắt buộc (`model_validate`) |
| `pydantic-settings` | `>=2.0` | `src/core/config.py` | Load `.env` → `Settings` object |
| `sqlalchemy` | `==2.0.21` | `src/core/database.py`, `src/pipelines/*/loader` | ORM + raw SQL. Dùng 2.0-style (`Session.execute()`) |
| `psycopg2-binary` | `==2.9.7` | Implicit (SQLAlchemy driver) | PostgreSQL adapter |
| `requests` | `==2.31.0` | `src/pipelines/*/extractor` | HTTP client gọi REST API |
| `tenacity` | `>=8.0` | `src/pipelines/base.py` | Retry decorator cho Extractor |
| `pandas` | `==2.0.3` | `src/pipelines/*/transformer` (tuỳ chọn) | DataFrame operations khi cần batch transform |
| `geopandas` | `==0.13.2` | `src/pipelines/spatial_net/*` | GeoDataFrame cho OSM data |
| `osmnx` | latest | `src/pipelines/spatial_net/osm_pipeline.py` | Download road network từ OSM |
| `shapely` | `==2.0.1` | `src/utils/geo_ops.py` | Geometry operations (Point, LineString) |
| `typer` | `>=0.9` | `src/main.py` | CLI framework |
| `pyproj` | `>=3.6` | `src/utils/geo_ops.py` | CRS conversion (WGS84 ↔ UTM48N) |

### 1.2 Thư viện CẤM sử dụng

| Cấm | Lý do | Thay thế bằng |
|:----|:------|:---------------|
| `flask` | Dự án dùng FastAPI (nếu cần web API) | `fastapi` |
| `pymongo`, `motor` | Không có MongoDB trong dự án | – |
| `sqlalchemy` 1.x style (`session.query()`) | Deprecated | `session.execute(select(...))` |
| `pydantic` V1 (`class Config:`, `.dict()`) | Deprecated | V2: `model_config`, `.model_dump()` |
| `json` manual validation (`if "key" in data`) | Dễ lỗi, thiếu type safety | `pydantic` model_validate |

### 1.3 Quy tắc coding bắt buộc

| Quy tắc | Chi tiết | Ví dụ đúng | Ví dụ sai |
|:---------|:---------|:-----------|:----------|
| **Type hints 100%** | Mọi hàm, mọi method | `def run(self, weather_key: int) -> int:` | `def run(self, weather_key):` |
| **Return type bắt buộc** | Kể cả `-> None` | `def load(...) -> int:` | `def load(...):` |
| **snake_case** | Hàm, biến, module | `traffic_pipeline.py` | `TrafficPipeline.py` |
| **PascalCase** | Class name | `class TrafficExtractor:` | `class traffic_extractor:` |
| **UPPER_CASE** | Constants | `DEFAULT_TIMEOUT = 10` | `default_timeout = 10` |
| **Docstring** | Mọi class + public method | `"""Extract traffic flow data from TomTom API."""` | Không có docstring |
| **f-string** | String formatting | `f"Extracted {count} records"` | `"Extracted %d records" % count` |
| **pathlib** | Đường dẫn file | `Path(__file__).parent / ".env"` | `os.path.join(os.path.dirname...)` |

---

## 2. ABSTRACT BASE CLASSES – FILE `src/pipelines/base.py`

File này chứa **3 ABC** là nền tảng kiến trúc cho toàn bộ pipeline. Mọi pipeline cụ thể (traffic, weather, osm...) đều **kế thừa** từ đây.

### 2.1 Import block của `base.py`

```python
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any

from sqlalchemy import Engine, Table, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session
from tenacity import (
    retry,
    stop_after_attempt,
    wait_fixed,
    retry_if_exception_type,
    before_sleep_log,
)
import requests

from src.core.exceptions import (
    DataExtractionError,
    DataValidationError,
    DatabaseLoadError,
)
from src.core.logger import get_logger
```

---

### 2.2 `BaseExtractor` – Trích xuất dữ liệu từ nguồn ngoài

```python
class BaseExtractor(ABC):
    """Abstract base class cho mọi Extractor.

    Trách nhiệm:
      - Gọi API bên ngoài (TomTom, OpenWeather, OSM...) hoặc đọc file.
      - Tự động retry khi gặp lỗi mạng / rate-limit.
      - Raise DataExtractionError nếu thất bại sau hết retry.

    Subclass bắt buộc implement:
      - extract(**kwargs) -> Any
    """

    # ── CONSTANTS (subclass có thể override) ──────────────────────────
    BASE_URL: str = ""                   # Subclass PHẢI gán
    DEFAULT_TIMEOUT: int = 10            # Giây
    MAX_RETRIES: int = 3                 # Số lần thử lại
    RETRY_WAIT: int = 2                  # Giây chờ giữa mỗi retry

    def __init__(self, api_key: str = "", **kwargs: Any) -> None:
        self.api_key = api_key
        self.session = requests.Session()          # Reuse TCP connection
        self.session.headers.update({
            "Accept": "application/json",
            "User-Agent": "traffic-ioc-data-pipeline/1.0",
        })
        self.logger = get_logger(self.__class__.__name__)

    @abstractmethod
    def extract(self, **kwargs: Any) -> Any:
        """Trích xuất dữ liệu thô từ nguồn ngoài.

        Returns:
            Any: Dữ liệu thô (dict, list[dict], GeoDataFrame...).
                 Chưa validate, chưa transform.

        Raises:
            DataExtractionError: Khi thất bại sau MAX_RETRIES lần.
        """
        ...

    def _get(self, url: str, params: dict | None = None) -> dict:
        """HTTP GET helper có sẵn retry + error handling.

        Agent PHẢI gọi self._get() trong extract() thay vì
        requests.get() trực tiếp.
        """
        ...  # Implementation xem mục 2.5
```

#### Bảng constant mặc định vs override

| Constant | Default base | TrafficExtractor | IncidentExtractor | WeatherExtractor |
|:---------|:------------|:-----------------|:------------------|:-----------------|
| `BASE_URL` | `""` | `"https://api.tomtom.com/traffic/services/4/flowSegmentData"` | `"https://api.tomtom.com/traffic/services/5/incidentDetails"` | `"https://api.openweathermap.org/data/2.5/weather"` |
| `DEFAULT_TIMEOUT` | `10` | `10` | `15` | `10` |
| `MAX_RETRIES` | `3` | `3` | `3` | `2` |
| `RETRY_WAIT` | `2` | `2` | `3` | `2` |

---

### 2.3 `BaseTransformer` – Biến đổi dữ liệu

```python
class BaseTransformer(ABC):
    """Abstract base class cho mọi Transformer.

    Trách nhiệm:
      - Nhận dữ liệu thô từ Extractor.
      - Validate qua Pydantic schema (src/schemas/).
      - Tính toán derived fields (gọi hàm từ src/utils/).
      - Trả về list[dict] với key khớp 100% cột DB.

    RÀNG BUỘC TUYỆT ĐỐI:
      - KHÔNG gọi API.
      - KHÔNG query Database.
      - KHÔNG import requests, sqlalchemy, database.
      - KHÔNG ghi file.
      → Là PURE FUNCTION (ngoại trừ logging).

    Subclass bắt buộc implement:
      - transform(raw_data) -> list[dict]
    """

    def __init__(self) -> None:
        self.logger = get_logger(self.__class__.__name__)

    @abstractmethod
    def transform(self, raw_data: Any) -> list[dict]:
        """Biến đổi dữ liệu thô thành list[dict] sẵn sàng load DB.

        Args:
            raw_data: Output từ Extractor.extract().
                      Kiểu cụ thể do subclass quyết định.

        Returns:
            list[dict]: Mỗi dict là 1 row DB.
                        Key = tên cột DB (snake_case).
                        Value = giá trị đã tính toán + validate.

        Raises:
            DataValidationError: Khi Pydantic schema reject dữ liệu.

        Ví dụ output:
            [
                {
                    "traffic_flow_key": 123456789,
                    "segment_key": 42,
                    "date_key": 20260228,
                    "time_key": 870,
                    "current_speed_kmh": 17.0,
                    "free_flow_speed_kmh": 24.0,
                    "delay_seconds": 136,
                    "traffic_index": 0.29,
                    "los_level": "B",
                    "congestion_level": 1,
                    "is_closed": False,
                    "quality_flag": 9,
                    "weather_key": 800,
                    "inserted_at": datetime(2026, 2, 28, 14, 30, 0),
                }
            ]
        """
        ...
```

#### Quy tắc validate trong transform()

```
Bước 1: raw_data → Pydantic model (model_validate)
         |
         ├─ Thành công → tiếp tục
         └─ Thất bại  → log WARNING + skip record (KHÔNG crash pipeline)
                         hoặc raise DataValidationError nếu >50% lỗi

Bước 2: Pydantic model → dict (model_dump)
         |
         ├─ Gọi utils/math_calc.py để tính derived fields
         ├─ Gọi utils/geo_ops.py nếu cần spatial operations
         └─ Gọi utils/weather_mapping.py nếu cần map severity

Bước 3: dict → thêm system fields (date_key, time_key, inserted_at)
         |
         └─ Return list[dict]
```

#### Import whitelist cho Transformer subclass

| Được phép import | Ví dụ |
|:-----------------|:------|
| `src.schemas.*` | `from src.schemas.tomtom_schema import TomTomFlowResponse` |
| `src.utils.*` | `from src.utils.math_calc import calculate_traffic_index` |
| `src.core.exceptions` | `from src.core.exceptions import DataValidationError` |
| `src.core.logger` | `from src.core.logger import get_logger` |
| `pydantic` | `from pydantic import ValidationError` |
| `datetime` | `from datetime import datetime, timezone` |

| CẤM import | Lý do |
|:------------|:------|
| `requests` | Side-effect (network IO) |
| `sqlalchemy` | Side-effect (database IO) |
| `src.core.database` | Side-effect (database IO) |
| `src.core.config` | Transformer không cần biết cấu hình |
| `os`, `subprocess` | Side-effect (system IO) |

---

### 2.4 `BaseLoader` – Nạp dữ liệu vào PostgreSQL

```python
class BaseLoader(ABC):
    """Abstract base class cho mọi Loader.

    Trách nhiệm:
      - Nhận list[dict] từ Transformer.
      - UPSERT vào PostgreSQL (ON CONFLICT).
      - Xử lý transaction: auto-commit khi OK, auto-rollback khi lỗi.
      - Trả về số record đã upsert thành công.

    RÀNG BUỘC:
      - BẮT BUỘC dùng UPSERT (ON CONFLICT). Cấm INSERT thường.
      - BẮT BUỘC batch insert (không insert từng row).
      - BẮT BUỘC handle IntegrityError + OperationalError.

    Subclass bắt buộc implement:
      - load(records) -> int
    Subclass bắt buộc gán:
      - TABLE: Table       (SQLAlchemy Table metadata)
      - CONFLICT_KEYS: list[str]
      - UPDATE_COLUMNS: list[str]
    """

    # ── CONSTANTS (subclass PHẢI gán) ─────────────────────────────────
    TABLE: Table                          # SQLAlchemy Table object
    CONFLICT_KEYS: list[str] = []         # Cột conflict target
    UPDATE_COLUMNS: list[str] = []        # Cột cập nhật khi trùng
    BATCH_SIZE: int = 500                 # Số row / transaction

    def __init__(self, engine: Engine) -> None:
        self.engine = engine
        self.logger = get_logger(self.__class__.__name__)

    @abstractmethod
    def load(self, records: list[dict]) -> int:
        """Nạp dữ liệu vào PostgreSQL bằng UPSERT.

        Args:
            records: Output từ Transformer.transform().

        Returns:
            int: Số record đã upsert thành công.

        Raises:
            DatabaseLoadError: Khi INSERT/UPSERT thất bại.
        """
        ...

    def _upsert_batch(self, records: list[dict]) -> int:
        """Helper UPSERT dùng SQLAlchemy postgresql.insert.

        Agent PHẢI gọi self._upsert_batch() trong load() thay vì
        viết SQL thủ công.
        """
        ...  # Implementation xem mục 2.5
```

#### Bảng CONFLICT_KEYS và UPDATE_COLUMNS cho mỗi target table

| Loader subclass | TABLE | CONFLICT_KEYS | UPDATE_COLUMNS | BATCH_SIZE |
|:----------------|:------|:--------------|:---------------|:----------:|
| `TrafficFlowLoader` | `fact_traffic_flow` | `["traffic_flow_key", "date_key"]` | `["current_speed_kmh", "delay_seconds", "traffic_index", "los_level", "congestion_level", "is_closed", "quality_flag", "inserted_at"]` | `500` |
| `IncidentLoader` | `fact_incident` | `["incident_key", "date_key"]` | `["severity_level", "delay_seconds", "is_active", "quality_flag", "inserted_at"]` | `200` |
| `WeatherLoader` | `dim_weather` | `["weather_key"]` | `[]` (DO NOTHING) | `50` |
| `NodeLoader` | `dim_node` | `["node_key"]` | `["street_count", "record_timestamp"]` | `500` |
| `SegmentLoader` | `dim_segment` | `["segment_key"]` | `["length_m", "lanes", "max_speed_kmh", "record_timestamp"]` | `500` |
| `DateTimeLoader` | `dim_date` + `dim_time_of_day` + `dim_shift` | `["date_key"]` / `["time_key"]` / `["shift_key"]` | `[]` (DO NOTHING) | `1000` |

> Xem chi tiết quy tắc UPSERT cho từng bảng: **`spec_5_target_mapping.md`**

---

### 2.5 IMPLEMENTATION CHI TIẾT – Code reference cho `base.py`

Dưới đây là pseudo-implementation đầy đủ. Agent **sao chép và hoàn thiện** (không viết lại từ đầu):

#### `_get()` method trong BaseExtractor

```python
@retry(
    stop=stop_after_attempt(3),
    wait=wait_fixed(2),
    retry=retry_if_exception_type((
        requests.ConnectionError,
        requests.Timeout,
        requests.HTTPError,
    )),
    before_sleep=before_sleep_log(logging.getLogger("tenacity"), logging.WARNING),
    reraise=True,
)
def _get(self, url: str, params: dict | None = None) -> dict:
    """HTTP GET có retry tự động.

    Retry khi:
      - ConnectionError (mất mạng)
      - Timeout (quá 10s)
      - HTTPError với status 429, 500, 502, 503, 504

    Không retry khi:
      - 400 Bad Request (lỗi param → không retry ích gì)
      - 401/403 Unauthorized (lỗi API key → không retry ích gì)
      - 404 Not Found
    """
    self.logger.debug(f"GET {url} params={params}")
    response = self.session.get(url, params=params, timeout=self.DEFAULT_TIMEOUT)

    # Retry-able HTTP errors
    if response.status_code in (429, 500, 502, 503, 504):
        self.logger.warning(f"HTTP {response.status_code} from {url}, will retry...")
        response.raise_for_status()

    # Non-retryable HTTP errors
    if not response.ok:
        raise DataExtractionError(
            message=f"HTTP {response.status_code} from {url}",
            detail=response.text[:500],
        )

    return response.json()
```

#### `_upsert_batch()` method trong BaseLoader

```python
def _upsert_batch(self, records: list[dict]) -> int:
    """UPSERT batch records vào PostgreSQL.

    Sử dụng sqlalchemy.dialects.postgresql.insert với ON CONFLICT.
    Auto-commit nếu thành công, auto-rollback nếu lỗi.
    """
    if not records:
        return 0

    total_upserted = 0

    # Chia thành các batch nhỏ
    for i in range(0, len(records), self.BATCH_SIZE):
        batch = records[i : i + self.BATCH_SIZE]

        with Session(self.engine) as session:
            try:
                stmt = pg_insert(self.TABLE).values(batch)

                if self.UPDATE_COLUMNS:
                    # ON CONFLICT DO UPDATE
                    update_dict = {
                        col: stmt.excluded[col]
                        for col in self.UPDATE_COLUMNS
                    }
                    stmt = stmt.on_conflict_do_update(
                        index_elements=self.CONFLICT_KEYS,
                        set_=update_dict,
                    )
                else:
                    # ON CONFLICT DO NOTHING
                    stmt = stmt.on_conflict_do_nothing(
                        index_elements=self.CONFLICT_KEYS,
                    )

                result = session.execute(stmt)
                session.commit()
                total_upserted += result.rowcount

                self.logger.info(
                    f"Batch {i // self.BATCH_SIZE + 1}: "
                    f"upserted {result.rowcount}/{len(batch)} rows"
                )

            except (IntegrityError, OperationalError) as e:
                session.rollback()
                self.logger.error(f"DB error in batch {i // self.BATCH_SIZE + 1}: {e}")
                raise DatabaseLoadError(
                    message=f"UPSERT failed on {self.TABLE.name}",
                    detail=str(e),
                )

    return total_upserted
```

---

## 3. PIPELINE RUNNER PATTERN – Cách nối 3 tầng lại

Mỗi Pipeline cụ thể (traffic, weather, osm...) **không tạo class Pipeline riêng**. Thay vào đó, mỗi file pipeline định nghĩa **3 class** (Extractor, Transformer, Loader) + **1 hàm `run()`** ở cuối file để nối chúng.

### 3.1 Template chuẩn cho mỗi file pipeline

```python
"""Traffic Flow ETL Pipeline.

Extract : TomTom Traffic Flow API
Transform: Validate + calculate derived fields
Load    : UPSERT → fact_traffic_flow
"""

from __future__ import annotations
# ... imports ...

# ══════════════════════════════════════════════════════════
# EXTRACTOR
# ══════════════════════════════════════════════════════════

class TrafficExtractor(BaseExtractor):
    BASE_URL = "https://api.tomtom.com/traffic/services/4/flowSegmentData"

    def extract(self, points: list[tuple[float, float]]) -> list[dict]:
        """Gọi TomTom Flow API cho danh sách tọa độ segment."""
        results = []
        for lat, lon in points:
            url = f"{self.BASE_URL}/absolute/10/{lat},{lon}"
            params = {"key": self.api_key, "unit": "KMPH"}
            try:
                data = self._get(url, params=params)
                results.append(data)
            except DataExtractionError as e:
                self.logger.warning(f"Skip point ({lat},{lon}): {e.message}")
                continue  # Skip lỗi 1 point, tiếp tục point khác
        return results

# ══════════════════════════════════════════════════════════
# TRANSFORMER
# ══════════════════════════════════════════════════════════

class TrafficTransformer(BaseTransformer):

    def transform(self, raw_data: list[dict]) -> list[dict]:
        """Validate + tính toán traffic metrics."""
        records = []
        for item in raw_data:
            try:
                validated = TomTomFlowResponse.model_validate(item)
                segment = validated.flow_segment_data
                # ... tính toán derived fields ...
                records.append({...})
            except ValidationError as e:
                self.logger.warning(f"Skip invalid record: {e}")
                continue
        return records

# ══════════════════════════════════════════════════════════
# LOADER
# ══════════════════════════════════════════════════════════

class TrafficLoader(BaseLoader):
    TABLE = fact_traffic_flow              # SQLAlchemy Table
    CONFLICT_KEYS = ["traffic_flow_key", "date_key"]
    UPDATE_COLUMNS = [
        "current_speed_kmh", "delay_seconds", "traffic_index",
        "los_level", "congestion_level", "is_closed", "quality_flag",
        "inserted_at",
    ]

    def load(self, records: list[dict]) -> int:
        """UPSERT traffic flow records."""
        return self._upsert_batch(records)

# ══════════════════════════════════════════════════════════
# RUNNER (hàm public duy nhất)
# ══════════════════════════════════════════════════════════

def run(engine: Engine, api_key: str, weather_key: int, **kwargs) -> int:
    """Chạy full ETL cycle cho Traffic Flow.

    Args:
        engine: SQLAlchemy Engine (từ core.database).
        api_key: TomTom API key (từ core.config).
        weather_key: FK weather (từ weather_pipeline chạy trước).

    Returns:
        int: Số record đã upsert.
    """
    logger = get_logger("traffic_pipeline")

    # E
    extractor = TrafficExtractor(api_key=api_key)
    raw = extractor.extract(points=kwargs.get("points", []))
    logger.info(f"Extracted {len(raw)} raw responses")

    # T
    transformer = TrafficTransformer()
    records = transformer.transform(raw)
    logger.info(f"Transformed {len(records)} records")

    # L
    loader = TrafficLoader(engine=engine)
    count = loader.load(records)
    logger.info(f"Loaded {count} records → fact_traffic_flow")

    return count
```

### 3.2 Quy tắc Run function

| Quy tắc | Chi tiết |
|:---------|:---------|
| **Tên hàm** | Luôn là `run()` |
| **Tham số bắt buộc** | `engine: Engine` (từ `core.database`) |
| **Return type** | `int` (số record đã upsert) |
| **Gọi từ đâu** | `src/main.py` qua CLI command |
| **Không dùng global** | Mọi dependency truyền qua params |
| **Log 3 mốc** | Sau Extract, sau Transform, sau Load |

---

## 4. EXCEPTION HIERARCHY – FILE `src/core/exceptions.py`

```python
"""Custom exceptions cho data-pipeline module.

Cây kế thừa:
    PipelineError (Exception)
    ├── DataExtractionError   ← Extractor thất bại
    ├── DataValidationError   ← Pydantic reject / schema lỗi
    └── DatabaseLoadError     ← UPSERT vào DB lỗi
"""


class PipelineError(Exception):
    """Base exception cho toàn bộ data-pipeline."""

    def __init__(self, message: str, detail: str | None = None) -> None:
        self.message = message
        self.detail = detail
        super().__init__(self.message)

    def __str__(self) -> str:
        if self.detail:
            return f"{self.message} | Detail: {self.detail}"
        return self.message


class DataExtractionError(PipelineError):
    """Extractor gọi API thất bại sau hết retry.

    Khi nào raise:
      - HTTP status không retry-able (400, 401, 403, 404)
      - Hết MAX_RETRIES lần cho retry-able errors
      - Response không phải JSON hợp lệ
    """
    pass


class DataValidationError(PipelineError):
    """Pydantic schema reject dữ liệu.

    Khi nào raise:
      - >50% records trong 1 batch bị invalid
      - Required field bị thiếu
      - Field type không match
    """
    pass


class DatabaseLoadError(PipelineError):
    """INSERT / UPSERT vào PostgreSQL thất bại.

    Khi nào raise:
      - IntegrityError (FK violation, CHECK constraint)
      - OperationalError (connection lost giữa transaction)
      - Timeout khi execute batch lớn
    """
    pass
```

### Quy tắc xử lý Exception trong pipeline

| Tình huống | Hành vi | Ví dụ |
|:-----------|:--------|:------|
| **1 record** lỗi validation | `logger.warning()` + **skip** record, tiếp tục | Thiếu `currentSpeed` trong 1 response |
| **>50% records** lỗi validation | `raise DataValidationError` + **abort** pipeline | API thay đổi format response |
| **1 API call** lỗi extraction | `logger.warning()` + **skip** point, tiếp tục | Timeout 1 segment coordinate |
| **Toàn bộ API** lỗi extraction | `raise DataExtractionError` + **abort** pipeline | API key hết hạn |
| **DB** lỗi insert batch | `session.rollback()` + `raise DatabaseLoadError` | FK violation |
| **Bất kỳ PipelineError** trong `main.py` | `logger.error()` + **skip pipeline**, chạy pipeline kế | Incident lỗi, weather vẫn chạy |

> **Quy tắc vàng:** Lỗi 1 pipeline **KHÔNG** crash toàn bộ chương trình. `main.py` phải bắt `PipelineError` cho từng pipeline và tiếp tục pipeline tiếp theo.

---

## 5. LOGGING STANDARD – FILE `src/core/logger.py`

### 5.1 Implementation reference

```python
"""Structured logging factory cho data-pipeline module."""

import logging
import sys
from pathlib import Path


def get_logger(name: str) -> logging.Logger:
    """Tạo logger instance với format chuẩn.

    Args:
        name: Tên logger (thường là __class__.__name__ hoặc module name).

    Returns:
        logging.Logger: Logger đã cấu hình sẵn handler.

    Cách dùng:
        logger = get_logger("TrafficExtractor")
        logger.info("Extracted 150 segments")
    """
    logger = logging.getLogger(f"data_pipeline.{name}")

    if logger.handlers:
        return logger  # Tránh duplicate handler

    logger.setLevel(logging.DEBUG)

    # ── Console Handler (luôn bật) ────────────────────────
    console = logging.StreamHandler(sys.stdout)
    console.setLevel(logging.INFO)
    console.setFormatter(logging.Formatter(
        fmt="[%(asctime)s] %(levelname)-8s %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))
    logger.addHandler(console)

    return logger
```

### 5.2 Log format chuẩn

```
[2026-02-28 14:30:00] INFO     data_pipeline.TrafficExtractor | Extracted 150 raw responses
[2026-02-28 14:30:02] WARNING  data_pipeline.TrafficTransformer | Skip invalid record: validation error for TomTomFlowResponse...
[2026-02-28 14:30:03] INFO     data_pipeline.TrafficLoader | Batch 1: upserted 147/150 rows
[2026-02-28 14:30:03] INFO     data_pipeline.traffic_pipeline | Loaded 147 records → fact_traffic_flow
[2026-02-28 14:30:04] ERROR    data_pipeline.IncidentExtractor | HTTP 401 from https://api.tomtom.com/... | Detail: Invalid API key
```

### 5.3 Quy tắc log bắt buộc

| Thời điểm | Level | Nội dung | Ví dụ |
|:-----------|:------|:---------|:------|
| Bắt đầu extract | `INFO` | Mô tả source + params | `"Extracting traffic flow for 300 segments"` |
| Kết thúc extract | `INFO` | Số lượng raw records | `"Extracted 295 raw responses (5 skipped)"` |
| Skip 1 record | `WARNING` | Lý do skip | `"Skip point (10.77,106.70): HTTP 429 Too Many Requests"` |
| Bắt đầu transform | `INFO` | Số lượng input | `"Transforming 295 records"` |
| Validation fail | `WARNING` | Error detail (truncated) | `"Skip invalid record: field 'currentSpeed' missing"` |
| Kết thúc transform | `INFO` | Số lượng output | `"Transformed 290 valid records"` |
| Mỗi batch load | `INFO` | `upserted/total` | `"Batch 1: upserted 290/290 rows"` |
| DB error | `ERROR` | Exception + traceback | `"DB error in batch 1: IntegrityError..."` |
| Pipeline done | `INFO` | Tên pipeline + tổng kết | `"Loaded 290 records → fact_traffic_flow"` |

---

## 6. TYPE HINTS & PYDANTIC V2 CHEAT SHEET

### 6.1 Pydantic V2 patterns bắt buộc

```python
from pydantic import BaseModel, Field, field_validator, model_validator

# ✅ ĐÚNG – Pydantic V2 syntax
class TomTomFlowSegment(BaseModel):
    model_config = {"populate_by_name": True}   # V2: thay cho class Config

    current_speed: float = Field(alias="currentSpeed", ge=0)
    free_flow_speed: float = Field(alias="freeFlowSpeed", gt=0)
    current_travel_time: int = Field(alias="currentTravelTime", ge=0)
    free_flow_travel_time: int = Field(alias="freeFlowTravelTime", ge=0)
    confidence: float = Field(ge=0.0, le=1.0)
    road_closure: bool = Field(alias="roadClosure", default=False)

    @field_validator("free_flow_speed")                  # V2: decorator
    @classmethod
    def speed_must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("free_flow_speed must be > 0")
        return v

# ❌ SAI – KHÔNG dùng Pydantic V1 syntax
class WrongModel(BaseModel):
    class Config:           # ← V1, CẤM
        allow_population_by_field_name = True

    def dict(self):         # ← V1, CẤM. Dùng model_dump()
        ...
```

### 6.2 Cách validate data trong Transformer

```python
# ✅ ĐÚNG
try:
    validated = TomTomFlowResponse.model_validate(raw_json)    # V2
    data = validated.flow_segment_data.model_dump()             # V2
except ValidationError as e:
    self.logger.warning(f"Validation failed: {e}")
    continue  # skip record

# ❌ SAI
validated = TomTomFlowResponse(**raw_json)   # V1 style, tránh
data = validated.dict()                       # V1, CẤM
```

### 6.3 SQLAlchemy 2.0-style patterns

```python
from sqlalchemy import create_engine, text, MetaData, Table, Column
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert

# ✅ ĐÚNG – SQLAlchemy 2.0
engine = create_engine(url, pool_pre_ping=True)
with Session(engine) as session:
    stmt = pg_insert(table).values(records)
    stmt = stmt.on_conflict_do_update(
        index_elements=["pk_col"],
        set_={"col": stmt.excluded.col},
    )
    session.execute(stmt)
    session.commit()

# ❌ SAI – SQLAlchemy 1.x (CẤM)
session = Session(engine)
session.add_all([...])       # Không UPSERT, CẤM
session.commit()
session.close()              # Dùng context manager thay vì close()
```

---

## 7. THAM CHIẾU CHÉO

| Khi cần biết... | Đọc spec nào |
|:-----------------|:-------------|
| Thư viện nào, khuôn mẫu nào, code style nào | **Spec 2** (file này) |
| File nào ở đâu, luồng chạy thế nào | **Spec 1** (`spec_1_blueprint.md`) |
| JSON raw từ API trông thế nào, field nào nullable | **Spec 3** (`spec_3_data_contracts.md`) |
| Công thức tính traffic_index, LOS, PCU | **Spec 4** (`spec_4_business_logic.md`) |
| UPSERT ON CONFLICT target nào, column nào update | **Spec 5** (`spec_5_target_mapping.md`) |

---

> **Checkpoint cho Agent:** Sau khi đọc xong spec này, Agent phải tuân thủ:
> 1. Mọi Extractor kế thừa `BaseExtractor` và dùng `self._get()` để gọi API.
> 2. Mọi Transformer kế thừa `BaseTransformer` và KHÔNG import `requests`/`sqlalchemy`.
> 3. Mọi Loader kế thừa `BaseLoader` và dùng `self._upsert_batch()` để UPSERT.
> 4. Mọi pipeline file có hàm `run(engine, ...) -> int` ở cuối.
> 5. Exception bắt bằng `PipelineError` trong `main.py`, KHÔNG crash chương trình.
> 6. Dùng Pydantic V2 (`model_validate`, `model_dump`), cấm V1 syntax.
> 7. Dùng SQLAlchemy 2.0 (`Session` context manager), cấm 1.x style.