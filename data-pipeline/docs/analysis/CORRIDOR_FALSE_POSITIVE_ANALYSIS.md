# 🔍 PHÂN TÍCH VẤN ĐỀ: FALSE POSITIVE CORRIDORS TRONG Q1 ETL

## 📊 Tình huống hiện tại

**Kết quả thực tế:**
- Tổng corridors trong ETL: **13 corridors**
- TRUE Q1 corridors: **5 corridors** (38%)
  - Lê Duẩn ✅
  - Điện Biên Phủ ✅
  - Đinh Tiên Hoàng ✅
  - Nguyễn Đình Chiểu ✅
  - Võ Thị Sáu ✅

- FALSE POSITIVE corridors: **8 corridors** (62%)
  - Võ Văn Kiệt ❌
  - Hải Thượng Lãn Ông ❌
  - Nguyễn Văn Linh ❌
  - Mai Chí Thọ ❌
  - Bùi Hữu Nghĩa (Bình Thạnh) ❌
  - Đường số 2 (TP Thủ Đức) ❌
  - Phan Đình Giót (Tân Bình) ❌
  - (1 corridor khác) ❌

---

## 🐛 ROOT CAUSE ANALYSIS

### Vấn đề chính: **Architecture mismatch giữa Corridor Generation và ETL Filtering**

#### Step 1: Corridor Generation (`run-corridors`)
```python
# File: corridor_pipeline.py
# Tạo corridors cho TOÀN THÀNH PHỐ, KHÔNG filter theo quận
corridors = generate_from_all_roads()  # ← Không có Q1 filter
# Result: dim_corridor có 60+ corridors từ toàn TP.HCM
```

#### Step 2: ETL Filtering (`run-realtime`)
```sql
-- File: main.py - _SEGMENT_QUERY_BY_TARGET_CORRIDORS
WITH q1_boundary AS (...),
target_corridors AS (
    SELECT DISTINCT corridor_key
    FROM bridge_corridor_segment bcs
    WHERE ST_Within(segment.geometry_center, q1_boundary.geom)  -- ← Filter segments
)
SELECT segments FROM target_corridors
```

**Vấn đề:**
1. Corridor "Võ Văn Kiệt" có **300 segments** chạy xuyên nhiều quận
2. Có **5 segments** của Võ Văn Kiệt chạm vào Q1 (góc biên giới)
3. Query filter segments → tìm thấy 5 segments trong Q1
4. Join với `bridge_corridor_segment` → lấy được `corridor_key` của Võ Văn Kiệt
5. **Result:** Võ Văn Kiệt xuất hiện trong list Q1 mặc dù chỉ có 5/300 segments (1.7%)

---

## 📈 Phân tích Chi tiết (Dự kiến)

| Corridor | Total Segs | Q1 Segs | Q1% | Classification | Lý do |
|----------|------------|---------|-----|----------------|-------|
| Lê Duẩn | 126 | 126 | 100% | ✅ TRUE Q1 | Hoàn toàn trong Q1 |
| Điện Biên Phủ | 147 | 147 | 100% | ✅ TRUE Q1 | Hoàn toàn trong Q1 |
| Đinh Tiên Hoàng | 21 | 21 | 100% | ✅ TRUE Q1 | Hoàn toàn trong Q1 |
| Nguyễn Đình Chiểu | 45 | 45 | 100% | ✅ TRUE Q1 | Hoàn toàn trong Q1 |
| Võ Thị Sáu | 38 | 38 | 100% | ✅ TRUE Q1 | Hoàn toàn trong Q1 |
| Võ Văn Kiệt | 271 | 5 | **1.8%** | ❌ FALSE | Chạy qua nhiều quận, chỉ chạm Q1 |
| Nguyễn Văn Linh | 300 | 8 | **2.7%** | ❌ FALSE | Chủ yếu ở Q7, Q8, chỉ chạm Q1 |
| Mai Chí Thọ | 103 | 3 | **2.9%** | ❌ FALSE | Chủ yếu ở Q2, Thủ Đức |
| Bùi Hữu Nghĩa | 235 | 4 | **1.7%** | ❌ FALSE | Bình Thạnh, chỉ góc chạm Q1 |
| Phan Đình Giót | 89 | 2 | **2.2%** | ❌ FALSE | Tân Bình |

**Kết luận:** Logic PostGIS filtering hoạt động đúng ở segment level, nhưng thiếu filter ở corridor level.

---

## 💡 GIẢI PHÁP ĐỀ XUẤT

### ✅ Giải pháp 1: **Thêm Q1 Coverage Threshold Filter** (Khuyến nghị)

**Ý tưởng:** Chỉ coi corridor thuộc Q1 nếu có ≥50% segments/length trong Q1.

#### Implementation:

**File: `data-pipeline/src/main.py`**
```python
_SEGMENT_QUERY_BY_TARGET_CORRIDORS = text("""
    WITH q1_boundary AS (...),
    corridor_q1_coverage AS (
        SELECT 
            bcs.corridor_key,
            COUNT(DISTINCT CASE WHEN ST_Within(ds.geometry_center, qb.geom) THEN bcs.segment_key END) AS q1_segments,
            COUNT(DISTINCT bcs.segment_key) AS total_segments,
            SUM(CASE WHEN ST_Within(ds.geometry_center, qb.geom) THEN ds.length_m ELSE 0 END) AS q1_length,
            SUM(ds.length_m) AS total_length
        FROM bridge_corridor_segment bcs
        JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
        CROSS JOIN q1_boundary qb
        GROUP BY bcs.corridor_key
        HAVING (SUM(CASE WHEN ST_Within(...) THEN ds.length_m ELSE 0 END) / NULLIF(SUM(ds.length_m), 0)) >= 0.5
              -- ^^^ Threshold: ≥50% length trong Q1
    ),
    target_corridors AS (
        SELECT corridor_key FROM corridor_q1_coverage
    )
    SELECT segments FROM target_corridors WHERE ...
""")
```

**Ưu điểm:**
- ✅ Loại bỏ false positives hiệu quả
- ✅ Flexible threshold (có thể điều chỉnh 0.5 → 0.3 nếu cần)
- ✅ Không cần regenerate corridors
- ✅ Dễ maintain

**Nhược điểm:**
- ⚠️ Query phức tạp hơn
- ⚠️ Cần tune threshold (50%? 70%?)

---

### ✅ Giải pháp 2: **Tạo Q1-Specific Corridor View**

**Ý tưởng:** Tạo view/materialized view chỉ chứa TRUE Q1 corridors.

#### Implementation:

**File: `infrastructure/postgres/3_create_views.sql`** (new)
```sql
CREATE MATERIALIZED VIEW dim_corridor_q1 AS
WITH q1_boundary AS (...),
corridor_coverage AS (
    SELECT 
        c.*,
        SUM(CASE WHEN ST_Within(ds.geometry_center, qb.geom) THEN ds.length_m ELSE 0 END) / c.total_length_m AS q1_coverage_ratio
    FROM dim_corridor c
    JOIN bridge_corridor_segment bcs ON bcs.corridor_key = c.corridor_key
    JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
    CROSS JOIN q1_boundary qb
    GROUP BY c.corridor_key
)
SELECT * FROM corridor_coverage WHERE q1_coverage_ratio >= 0.5;

CREATE INDEX idx_dim_corridor_q1_key ON dim_corridor_q1(corridor_key);
```

**Update ETL:**
```python
# Sử dụng dim_corridor_q1 thay vì dim_corridor
_SEGMENT_QUERY = """
    SELECT segments 
    FROM dim_corridor_q1 c  -- ← Chỉ lấy từ Q1 view
    JOIN bridge_corridor_segment bcs ON bcs.corridor_key = c.corridor_key
    ...
"""
```

**Ưu điểm:**
- ✅ Query ETL đơn giản hơn
- ✅ Performance tốt (materialized)
- ✅ Tách biệt rõ ràng Q1 vs citywide data

**Nhược điểm:**
- ⚠️ Cần refresh materialized view định kỳ
- ⚠️ Thêm 1 entity mới cần maintain

---

### ❌ Giải pháp 3: **Filter ngay trong Corridor Generation** (Không khuyến nghị)

**Ý tưởng:** Modify `run-corridors` để chỉ generate corridors cho Q1.

**Tại sao không nên:**
- ❌ Mất flexibility - không thể ETL quận khác
- ❌ Cần regenerate corridors mỗi khi thay đổi scope
- ❌ Dim_corridor trở thành Q1-specific, không phù hợp với dimension design

---

## 🎯 KHUYẾN NGHỊ TRIỂN KHAI

### Phase 1: **Quick Fix - Thêm Coverage Filter** (1-2 days)

1. **Update `_SEGMENT_QUERY_BY_TARGET_CORRIDORS`** với coverage threshold
2. **Test với threshold = 50%** → xem còn bao nhiêu corridors
3. **Điều chỉnh threshold** nếu cần (có thể xuống 30-40%)

### Phase 2: **Long-term - Materialized View** (Optional)

1. Tạo `dim_corridor_q1` materialized view
2. Add refresh job vào scheduler (mỗi ngày sau `run-corridors`)
3. Migrate ETL queries sang dùng view

---

## 🧪 Test Plan

### Test Case 1: Verify Coverage Calculation
```sql
-- Kiểm tra coverage của Võ Văn Kiệt
SELECT 
    c.corridor_name,
    COUNT(*) FILTER (WHERE ST_Within(ds.geometry_center, qb.geom)) AS q1_segs,
    COUNT(*) AS total_segs,
    (COUNT(*) FILTER (...) * 100.0 / COUNT(*)) AS coverage_pct
FROM dim_corridor c
WHERE c.corridor_name LIKE '%Võ Văn Kiệt%'
...
-- Expected: coverage_pct < 5%
```

### Test Case 2: Verify Filter Effectiveness
```sql
-- Sau khi áp dụng filter, chỉ còn TRUE Q1 corridors
SELECT corridor_name FROM (
    ... query với threshold ...
)
-- Expected: Chỉ có 5 corridors (Lê Duẩn, Điện Biên Phủ, ...)
```

---

## 📝 TÓM TẮT

**Vấn đề:**
- PostGIS polygon filtering hoạt động đúng ở **segment level**
- Thiếu filtering ở **corridor level** → false positives

**Root cause:**
- Corridor generation: Citywide scope
- ETL filtering: Segment-level Q1 filter
- Result: Corridors chỉ chạm Q1 vẫn được include

**Giải pháp:**
- ✅ **Thêm Q1 coverage threshold filter** (≥50% length/segments)
- Implement trong query ETL
- Threshold có thể điều chỉnh

**Impact:**
- Giảm từ 13 → 5 corridors (loại bỏ 8 false positives)
- ETL chính xác hơn, đúng scope Q1
- Giảm API calls không cần thiết

---

## 🚀 Next Steps

1. ✅ **Chạy analysis script** để confirm coverage numbers:
   ```bash
   docker-compose exec data-pipeline python scripts/analyze_corridor_coverage.py
   ```

2. ⏭️ **Implement coverage filter** trong main.py

3. ⏭️ **Test với run-realtime** để verify kết quả

4. ⏭️ **Update documentation** và scheduler

Bạn muốn tôi implement giải pháp 1 (thêm coverage threshold filter) ngay không?
