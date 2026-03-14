# HCM City-Wide Spatial Network & Corridor Pipeline Update

**Date**: 2026-03-02

## Summary

Đã cập nhật toàn bộ spatial network pipeline để lấy dữ liệu từ **toàn bộ thành phố Hồ Chí Minh** thay vì chỉ Quận 1. Đồng thời viết `CorridorLoader` class cho việc quản lý các hành lang giao thông với transaction control tự động.

---

## 1. **GEO CONFIGURATION UPDATES** 

### File: `data-pipeline/src/utils/geo_ops.py`

**Changes:**
- ✅ Thêm `BBOX_HCM` constant cho toàn bộ thành phố
  ```python
  BBOX_HCM: dict[str, float] = {
      "min_lon": 106.4,    # West boundary
      "min_lat": 10.4,     # South boundary
      "max_lon": 107.1,    # East boundary
      "max_lat": 10.95,    # North boundary
  }
  ```
- Bounding box này phủ sóng tất cả 24 quận/huyện của HCM

---

## 2. **OSM PIPELINE UPDATES**

### File: `data-pipeline/src/pipelines/spatial_net/osm_pipeline.py`

**Changes:**
- ✅ Import `BBOX_HCM` thay vì `BBOX_DISTRICT_1`
- ✅ Cập nhật `OSMExtractor.extract()` để dùng `BBOX_HCM` làm mặc định
  ```python
  bbox = kwargs.get("bbox", BBOX_HCM)  # Changed from BBOX_DISTRICT_1
  ```
- **Impact**: Sẽ tải toàn bộ đường xá, nút giao thông, và segments của HCM

**Tables affected:**
- `dim_node` - Tất cả nút giao thông trong HCM
- `dim_road` - Tất cả tên đường trong HCM
- `dim_way` - Tất cả ways/edges từ OSM
- `dim_segment` - Tất cả segments được tạo từ edges

---

## 3. **CORRIDOR INFRASTRUCTURE**

### File: `data-pipeline/src/utils/math_calc.py`

**New Function:**
- ✅ `generate_corridor_key(corridor_name: str) -> int`
  - Sinh idempotent key từ tên hành lang bằng SHA256 hash
  - Đảm bảo cùng tên → cùng key (Lũy đẳng)
  - Pattern đồng bộ với `generate_road_key()` và `generate_segment_key()`

---

### File: `data-pipeline/src/pipelines/spatial_net/corridor_pipeline.py` (NEW)

**Purpose:** 
Quản lý configuration tĩnh cho các hành lang giao thông (arterial routes).

**Components:**

#### **1. CorridorExtractor**
- Lấy dữ liệu corridor từ file config hoặc hardcoded list
- Output: Dict với key `"corridors"` chứa list corridor configs

**Sample input:**
```python
{
    "corridor_name": "Nam Kỳ Khởi Nghĩa Inbound",
    "importance_level": 3,
    "target_avg_speed_kmh": 45.0,
    "total_length_m": 1250.5,
    "direction": "Inbound",
    "is_active": True,
    "segments": [
        {"segment_id_source": 817909615, "sequence_order": 1},
        {"segment_id_source": 817909616, "sequence_order": 2},
        {"segment_id_source": 817909617, "sequence_order": 3},
    ]
}
```

#### **2. CorridorTransformer**
- Biến đổi corridor configs → 2 output tables:
  - `dim_corridor` records
  - `bridge_corridor_segment` records

**Key logic:**
- Gán `corridor_key` via `generate_corridor_key(corridor_name)`
- Validate `sequence_order` theo đúng thứ tự array
- Sinh record_timestamp (UTC) cho tracking

#### **3. CorridorLoader**
```python
class CorridorLoader(BaseLoader):
    TABLE_NAME = "dim_corridor"
    CONFLICT_KEYS = ["corridor_key"]
    UPDATE_COLUMNS = [
        "corridor_name", "importance_level", "target_avg_speed_kmh",
        "total_length_m", "direction", "is_active", "record_timestamp"
    ]
    BATCH_SIZE = 100
```

Standard UPSERT loader cho dim_corridor table.

#### **4. load_corridors() - Core Transaction Logic** ⭐

**Signature:**
```python
def load_corridors(
    engine: Engine,
    corridor_records: list[dict],
    bridge_records: list[dict],
) -> dict[str, int]
```

**Workflow** (per spec):
```
┌─────────────────────────────────────────────────┐
│     Session.begin() - Single Transaction        │
├─────────────────────────────────────────────────┤
│ STEP 1: UPSERT dim_corridor                     │ 
│   - Conflict Key: corridor_key                  │
│   - Update Columns: corridor_name, direction... │
│   → Extract: list of corridor_keys              │
├─────────────────────────────────────────────────┤
│ STEP 2: DELETE FROM bridge_corridor_segment     │
│   - WHERE corridor_key IN (updated keys)        │
│   - Full Replace Strategy (handle restructuring)│
├─────────────────────────────────────────────────┤
│ STEP 3: INSERT INTO bridge_corridor_segment     │
│   - Bulk Insert of new bridge records           │
│   - Respects sequence_order FK constraint       │
├─────────────────────────────────────────────────┤
│ Exception → Auto-ROLLBACK                        │
│ Success → Auto-COMMIT (session.begin() exit)    │
└─────────────────────────────────────────────────┘
```

**Return Value:**
```python
{
    "corridors_upserted": int,      # Records inserted/updated in dim_corridor
    "bridge_deleted": int,           # Records deleted from bridge table
    "bridge_inserted": int,          # Records inserted into bridge table
}
```

**Error Handling:**
- Catches: `IntegrityError`, `OperationalError`
- Auto-rollbacks on exception
- Raises: `DatabaseLoadError` with detail message

#### **5. run() - ETL Runner**
```python
def run(engine: Engine, **kwargs) -> int:
    # Extract → Transform → Load (with transaction)
    # Returns: int (total records = corridors + bridge)
```

---

## 4. **DATABASE SCHEMA REQUIREMENTS**

Ensure these tables exist:

### `dim_corridor` (Master table)
```sql
CREATE TABLE dim_corridor (
    corridor_key          BIGINT PRIMARY KEY,
    corridor_name         VARCHAR(255) NOT NULL,
    importance_level      SMALLINT,           -- 1-5, 1=highest
    target_avg_speed_kmh  DECIMAL(5,2),
    total_length_m        DECIMAL(12,2),
    direction             VARCHAR(50),        -- Inbound/Outbound/East-West/etc
    is_active             BOOLEAN TRUE,
    record_timestamp      TIMESTAMP,
    ...
);
```

### `bridge_corridor_segment` (Bridge table)
```sql
CREATE TABLE bridge_corridor_segment (
    corridor_key      BIGINT REFERENCES dim_corridor(corridor_key),
    segment_key       BIGINT REFERENCES dim_segment(segment_key),
    sequence_order    INTEGER NOT NULL,  -- 1,2,3,... (START FROM 1!)
    record_timestamp  TIMESTAMP,
    PRIMARY KEY (corridor_key, sequence_order)
);
```

**Critical Constraint:**
- `sequence_order` MUST start from 1 and increment by 1 for each segment in a corridor
- Used to compute travel time along corridor (traversal order)

---

## 5. **USAGE EXAMPLES**

### Example 1: Run Full Corridor ETL
```python
from src.pipelines.spatial_net.corridor_pipeline import run
from sqlalchemy import create_engine

engine = create_engine("postgresql://...")
total_loaded = run(engine)
print(f"Loaded {total_loaded} corridor + bridge records")
```

### Example 2: Manual Transaction with error handling
```python
from src.pipelines.spatial_net.corridor_pipeline import (
    CorridorExtractor, CorridorTransformer, load_corridors
)

extractor = CorridorExtractor()
raw_data = extractor.extract()

transformer = CorridorTransformer()
transformed = transformer.transform(raw_data)

result = load_corridors(
    engine,
    transformed["dim_corridor"],
    transformed["bridge_corridor_segment"]
)

print(f"✅ Upserted {result['corridors_upserted']} corridors")
print(f"🗑️  Deleted {result['bridge_deleted']} old mappings")
print(f"✍️  Inserted {result['bridge_inserted']} new mappings")
```

---

## 6. **IMPLEMENTATION NOTES**

### Transaction Safety ✅
- Uses SQLAlchemy `Session.begin()` context manager
- Auto-commit on successful exit
- Auto-rollback on exception
- All operations atomic (either all or nothing)

### Idempotency ✅
- Corridor keys generated from name (SHA256 hash)
- Same corridor name → same key → UPSERT works correctly
- Safe to re-run without duplicates

### Full Route Restructuring ✅
- If a corridor's segments change (add/remove/reorder):
  1. DELETE all old bridge records for that corridor
  2. INSERT new bridge records
  - Handles cases where sequences 1,2,3 become 1,2,3,4 or 1,2
  - No orphaned mappings or FK violations

### Logging 📊
- Each step logs with ✓/✅/❌ indicators
- Transaction commit/rollback is logged
- Error detail included in DatabaseLoadError

---

## 7. **NEXT STEPS**

1. **Schema Verification**: Ensure `dim_corridor` and `bridge_corridor_segment` tables exist in database
2. **Data Loading**: 
   ```bash
   docker-compose exec data-pipeline python -m src.main run-corridor
   ```
3. **Validation**: Query created tables:
   ```sql
   SELECT COUNT(*) FROM dim_corridor;
   SELECT COUNT(*) FROM bridge_corridor_segment;
   ```

---

## 8. **FILES MODIFIED**

| File | Type | Changes |
|------|------|---------|
| `data-pipeline/src/utils/geo_ops.py` | Modified | ✅ Added `BBOX_HCM` |
| `data-pipeline/src/pipelines/spatial_net/osm_pipeline.py` | Modified | ✅ Updated to use `BBOX_HCM` |
| `data-pipeline/src/utils/math_calc.py` | Modified | ✅ Added `generate_corridor_key()` |
| `data-pipeline/src/pipelines/spatial_net/corridor_pipeline.py` | **NEW** | ✅ CorridorLoader + load_corridors() |

---

**Status**: ✅ Ready for integration and testing
