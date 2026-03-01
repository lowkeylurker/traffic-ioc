# SPEC 4 – ĐẶC TẢ LOGIC NGHIỆP VỤ & TÍNH TOÁN (BUSINESS LOGIC SPECIFICATION)

## Tất cả công thức, quy tắc rẽ nhánh, hằng số và hàm tiện ích cho ETL Pipeline

| Metadata | Giá trị |
|:---------|:--------|
| **Phiên bản** | 2.0 |
| **Ngày cập nhật** | 2026-02-28 |
| **Phạm vi** | Mọi logic tính toán trong `data-pipeline/src/utils/` và `src/pipelines/*/` |
| **Specs liên quan** | `spec_3` (data contracts), `spec_5` (target mapping) |
| **DB Schema** | `infrastructure/postgres/2_create_dims.sql`, `3_create_facts.sql` |
| **Vị trí code** | `src/utils/math_calc.py`, `src/utils/weather_mapping.py`, `src/utils/geo_ops.py` |

---

## MỤC ĐÍCH

File này chứa **tất cả logic nghiệp vụ** cần triển khai dưới dạng **Pure Functions**:

- Mỗi hàm **KHÔNG** import database, config, requests, hoặc bất kỳ module nào có side-effect.
- Chỉ nhận primitive types (float, int, str, dict, list, datetime) và trả về kết quả.
- 100% unit-testable, 100% type-annotated.
- **Tuyệt đối không hardcode** logic vào Extractor hoặc Loader.

> **QUY TẮC:** Agent phải triển khai **chính xác** các hàm, công thức, hằng số và edge-case handlers mô tả trong file này. KHÔNG được tự ý thay đổi ngưỡng, hệ số hoặc fallback values.

---

## MỤC LỤC

1. [Traffic Metrics – Chỉ số giao thông](#1-traffic-metrics--chỉ-số-giao-thông)
2. [PCU Estimation – Ước lượng lưu lượng xe](#2-pcu-estimation--ước-lượng-lưu-lượng-xe)
3. [Weather Severity – Ánh xạ mức độ thời tiết](#3-weather-severity--ánh-xạ-mức-độ-thời-tiết)
4. [Spatial Transform – Biến đổi dữ liệu không gian](#4-spatial-transform--biến-đổi-dữ-liệu-không-gian)
5. [Incident Transform – Biến đổi sự cố](#5-incident-transform--biến-đổi-sự-cố)
6. [Key Generation – Sinh khóa chính](#6-key-generation--sinh-khóa-chính)
7. [Time Derivation – Chuyển đổi thời gian](#7-time-derivation--chuyển-đổi-thời-gian)
8. [Geo Operations – Hàm tính toán không gian](#8-geo-operations--hàm-tính-toán-không-gian)
9. [Hằng số toàn cục](#9-hằng-số-toàn-cục)

---

## 1. Traffic Metrics – Chỉ số giao thông

**File:** `src/utils/math_calc.py`

### 1.1 `calculate_traffic_index`

```python
def calculate_traffic_index(current_speed: float, free_flow_speed: float) -> float:
    """
    Tính chỉ số giao thông (Traffic Index).
    
    Công thức: traffic_index = 1.0 - (current_speed / free_flow_speed)
    - 0.0 = giao thông thông thoáng (current_speed == free_flow_speed)
    - 1.0 = tắc nghẽn hoàn toàn (current_speed == 0)
    
    Args:
        current_speed: Vận tốc hiện tại (km/h) từ TomTom `currentSpeed`
        free_flow_speed: Vận tốc thông thoáng (km/h) từ TomTom `freeFlowSpeed`
    
    Returns:
        float trong khoảng [0.0, 1.0]
    
    Edge cases:
        - free_flow_speed <= 0 → return 0.0 (tránh ZeroDivisionError)
        - current_speed < 0 → clamp ratio, vẫn trả về trong [0.0, 1.0]
        - current_speed > free_flow_speed → return 0.0 (nhanh hơn free-flow)
    """
    if free_flow_speed <= 0:
        return 0.0
    ratio = current_speed / free_flow_speed
    index = 1.0 - ratio
    return max(0.0, min(1.0, index))
```

**Ví dụ kiểm thử:**

| current_speed | free_flow_speed | Kết quả | Giải thích |
|:-------------|:---------------|:--------|:-----------|
| 17 | 24 | 0.29 | `1.0 - 17/24 = 0.2917` |
| 0 | 50 | 1.0 | Tắc hoàn toàn |
| 50 | 50 | 0.0 | Thông thoáng |
| 60 | 50 | 0.0 | Nhanh hơn free-flow → clamp 0.0 |
| 10 | 0 | 0.0 | free_flow_speed = 0 → guard |

### 1.2 `calculate_los_level`

```python
def calculate_los_level(traffic_index: float) -> str:
    """
    Phân loại mức độ phục vụ (Level of Service - LOS) theo HCM 2010.
    
    Args:
        traffic_index: Chỉ số giao thông 0.0–1.0 (từ calculate_traffic_index)
    
    Returns:
        str: 'A', 'B', 'C', 'D', 'E', hoặc 'F'
    
    Ngưỡng (thresholds):
        A: traffic_index <= 0.15     (Free flow)
        B: 0.15 < TI <= 0.30        (Reasonably free flow)
        C: 0.30 < TI <= 0.45        (Stable flow)
        D: 0.45 < TI <= 0.60        (Approaching unstable)
        E: 0.60 < TI <= 0.80        (Unstable flow)
        F: TI > 0.80                (Forced/breakdown flow)
    """
    if traffic_index <= 0.15:
        return "A"
    elif traffic_index <= 0.30:
        return "B"
    elif traffic_index <= 0.45:
        return "C"
    elif traffic_index <= 0.60:
        return "D"
    elif traffic_index <= 0.80:
        return "E"
    else:
        return "F"
```

**Bảng ngưỡng đầy đủ:**

| LOS | Traffic Index Range | Mô tả | Congestion Level |
|:---:|:-------------------|:-------|:----------------:|
| A | 0.00 – 0.15 | Free flow | 0 |
| B | 0.16 – 0.30 | Reasonably free | 1 |
| C | 0.31 – 0.45 | Stable flow | 2 |
| D | 0.46 – 0.60 | Approaching unstable | 3 |
| E | 0.61 – 0.80 | Unstable flow | 4 |
| F | 0.81 – 1.00 | Forced/breakdown | 5 |

### 1.3 `calculate_congestion_level`

```python
def calculate_congestion_level(los_level: str) -> int:
    """
    Ánh xạ LOS (A–F) sang congestion_level (0–5) để lưu DB SMALLINT.
    
    Args:
        los_level: 'A', 'B', 'C', 'D', 'E', hoặc 'F'
    
    Returns:
        int: 0–5
    
    Edge case:
        - Input không hợp lệ (không phải A–F) → return 0
    """
    mapping = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4, "F": 5}
    return mapping.get(los_level.upper(), 0) if isinstance(los_level, str) else 0
```

### 1.4 `calculate_delay_seconds`

```python
def calculate_delay_seconds(current_travel_time: int, free_flow_travel_time: int) -> int:
    """
    Tính độ trễ di chuyển (giây).
    
    Công thức: delay = current_travel_time - free_flow_travel_time
    
    Args:
        current_travel_time: Thời gian di chuyển thực tế (giây) từ TomTom `currentTravelTime`
        free_flow_travel_time: Thời gian di chuyển thông thoáng (giây) từ TomTom `freeFlowTravelTime`
    
    Returns:
        int >= 0 (âm thì trả 0)
    """
    delay = current_travel_time - free_flow_travel_time
    return max(0, delay)
```

### 1.5 `calculate_quality_flag`

```python
def calculate_quality_flag(confidence: float) -> int:
    """
    Chuyển confidence score (0.0–1.0) thành quality_flag (0–9) SMALLINT.
    
    Công thức: quality_flag = round(confidence * 9)
    
    Args:
        confidence: Độ tin cậy từ TomTom API (0.0–1.0)
    
    Returns:
        int: 0–9
    
    Ví dụ:
        confidence=1.0 → 9
        confidence=0.5 → 5 (round(4.5) = 4 hoặc 5 tùy rounding)
        confidence=0.0 → 0
    """
    return round(max(0.0, min(1.0, confidence)) * 9)
```

---

## 2. PCU Estimation – Ước lượng lưu lượng xe

**File:** `src/utils/math_calc.py`

### 2.1 PCU Coefficients (Hệ số quy đổi TP.HCM)

| Loại phương tiện | Hệ số PCU | Ghi chú |
|:----------------|:---------:|:--------|
| Xe máy (motorcycle) | 0.25 | Chiếm ~80% phương tiện TPHCM |
| Ô tô con (car) | 1.00 | Đơn vị chuẩn |
| Xe tải / Xe buýt (bus/truck) | 2.00 | Phương tiện lớn |

### 2.2 `calculate_pcu` (Direct count)

```python
PCU_MOTORCYCLE = 0.25
PCU_CAR = 1.0
PCU_BUS_TRUCK = 2.0

def calculate_pcu(motorcycles: int = 0, cars: int = 0, buses_trucks: int = 0) -> float:
    """
    Tính tổng lưu lượng quy đổi PCU (Passenger Car Unit) từ đếm xe trực tiếp.
    
    Công thức: PCU = motorcycles * 0.25 + cars * 1.0 + buses_trucks * 2.0
    
    Args:
        motorcycles: Số xe máy
        cars: Số ô tô con
        buses_trucks: Số xe tải/xe buýt
    
    Returns:
        float: Tổng PCU (>= 0)
    """
    return (motorcycles * PCU_MOTORCYCLE) + (cars * PCU_CAR) + (buses_trucks * PCU_BUS_TRUCK)
```

### 2.3 `estimate_pcu_from_speed` (BPR Inverse Estimation)

> **Mục đích:** Khi TomTom chỉ trả về `currentSpeed` và `freeFlowSpeed` (không có số lượng xe), ta dùng **công thức BPR ngược (Bureau of Public Roads)** để ước lượng lưu lượng PCU.

#### Công thức BPR (gốc):

$$t = t_0 \times \left(1 + \alpha \times \left(\frac{V}{C}\right)^{\beta}\right)$$

Trong đó:
- $t$ = thời gian di chuyển thực tế (currentTravelTime)
- $t_0$ = thời gian free-flow (freeFlowTravelTime)
- $V$ = lưu lượng xe (PCU/h) – **đây là ẩn số cần tìm**
- $C$ = năng lực đường (capacity = `lane_count × 2000` PCU/h)
- $\alpha = 0.15$ (BPR parameter)
- $\beta = 4.0$ (BPR parameter)

#### Giải ngược tìm V:

$$\frac{t}{t_0} = 1 + \alpha \times \left(\frac{V}{C}\right)^{\beta}$$

$$\frac{V}{C} = \left(\frac{\frac{t}{t_0} - 1}{\alpha}\right)^{\frac{1}{\beta}}$$

$$V = C \times \left(\frac{\frac{t}{t_0} - 1}{\alpha}\right)^{\frac{1}{\beta}}$$

Thay bằng speed (vì `speed = distance / time`, và `time_ratio = freeFlowSpeed / currentSpeed`):

$$\text{time\_ratio} = \frac{\text{free\_flow\_speed}}{\text{current\_speed}}$$

$$\text{v\_c\_ratio} = \left(\frac{\text{time\_ratio} - 1}{\alpha}\right)^{1/\beta}$$

$$\text{pcu\_volume} = C \times \text{v\_c\_ratio}$$

```python
BPR_ALPHA = 0.15
BPR_BETA = 4.0
LANE_CAPACITY = 2000  # PCU/h per lane

def estimate_pcu_from_speed(
    current_speed: float,
    free_flow_speed: float,
    lane_count: int,
) -> float:
    """
    Ước lượng lưu lượng PCU từ tốc độ bằng BPR inverse formula.
    
    Args:
        current_speed: Vận tốc thực tế (km/h) từ TomTom
        free_flow_speed: Vận tốc free-flow (km/h) từ TomTom
        lane_count: Số làn xe (từ dim_way.default_lane_count)
    
    Returns:
        float: Ước lượng PCU volume (DECIMAL(10,2))
    
    Edge cases:
        - current_speed <= 0 → return capacity (tắc hoàn toàn, gán max)
        - current_speed >= free_flow_speed → return 0.0 (thông thoáng, volume thấp)
        - free_flow_speed <= 0 → return 0.0
        - lane_count <= 0 → return 0.0
    """
    if free_flow_speed <= 0 or lane_count <= 0:
        return 0.0
    if current_speed <= 0:
        return float(lane_count * LANE_CAPACITY)
    if current_speed >= free_flow_speed:
        return 0.0

    capacity = lane_count * LANE_CAPACITY
    time_ratio = free_flow_speed / current_speed   # t / t0

    # Giải BPR ngược
    excess = (time_ratio - 1.0) / BPR_ALPHA
    if excess <= 0:
        return 0.0

    v_c_ratio = excess ** (1.0 / BPR_BETA)
    pcu_volume = capacity * v_c_ratio

    # Clamp: không vượt quá capacity × 1.5 (congestion overflow)
    return round(min(pcu_volume, capacity * 1.5), 2)
```

**Ví dụ kiểm thử:**

| current_speed | free_flow_speed | lane_count | time_ratio | v_c_ratio | pcu_volume |
|:-------------|:---------------|:-----------|:-----------|:----------|:-----------|
| 17 | 24 | 3 | 1.412 | `((1.412-1)/0.15)^0.25 = 1.288` | `6000 * 1.288 = 7729.7` → clamp 9000 |
| 24 | 24 | 3 | 1.000 | 0.0 | 0.0 |
| 0 | 50 | 2 | ∞ | – | 4000.0 (capacity) |
| 40 | 50 | 2 | 1.25 | `((1.25-1)/0.15)^0.25 = 1.136` | `4000 * 1.136 = 4544.8` → clamp 6000 |

---

## 3. Weather Severity – Ánh xạ mức độ thời tiết

**File:** `src/utils/weather_mapping.py`

### 3.1 `get_weather_severity`

```python
def get_weather_severity(weather_id: int) -> int:
    """
    Ánh xạ OpenWeatherMap weather_id (200–804) sang severity_level (0–5).
    
    Args:
        weather_id: Mã điều kiện thời tiết từ OWM API
    
    Returns:
        int: 0 (không ảnh hưởng) đến 5 (ảnh hưởng cực lớn)
    
    Mapping:
        200–299 (Thunderstorm) → 4 (ảnh hưởng lớn)
        300–399 (Drizzle)      → 2 (ảnh hưởng nhẹ)
        500–599 (Rain)         → 3 (ảnh hưởng trung bình)
        600–699 (Snow)         → 3 (trung bình – hiếm ở HCM)
        700–799 (Atmosphere)   → 1 (nhẹ – sương mù, khói)
        800     (Clear)        → 0 (không ảnh hưởng)
        801–899 (Clouds)       → 0 (không ảnh hưởng)
        Khác                   → 0 (default)
    """
    if 200 <= weather_id <= 299:
        return 4
    elif 300 <= weather_id <= 399:
        return 2
    elif 500 <= weather_id <= 599:
        return 3
    elif 600 <= weather_id <= 699:
        return 3
    elif 700 <= weather_id <= 799:
        return 1
    elif weather_id == 800:
        return 0
    elif 801 <= weather_id <= 899:
        return 0
    else:
        return 0
```

**Bảng severity đầy đủ:**

| OWM Range | Nhóm | Severity | Mô tả ảnh hưởng giao thông |
|:----------|:------|:--------:|:---------------------------|
| 200–232 | Thunderstorm | 4 | Giảm tầm nhìn, đường trơn, ngập cục bộ |
| 300–321 | Drizzle | 2 | Đường hơi ẩm, giảm nhẹ tốc độ |
| 500–531 | Rain | 3 | Đường trơn, giảm tầm nhìn, nguy cơ ngập |
| 600–622 | Snow | 3 | Hiếm ở HCM, coi như ảnh hưởng trung bình |
| 700–781 | Atmosphere | 1 | Sương mù/khói, giảm nhẹ tầm nhìn |
| 800 | Clear | 0 | Điều kiện tốt nhất |
| 801–804 | Clouds | 0 | Không ảnh hưởng |

### 3.2 `get_icon_category_type`

```python
ICON_CATEGORY_MAP: dict[int, str] = {
    1:  "accident",
    2:  "fog",
    3:  "dangerous_conditions",
    4:  "rain",
    5:  "ice",
    6:  "jam",
    7:  "lane_closed",
    8:  "road_closed",
    9:  "road_works",
    10: "wind",
    11: "flooding",
    14: "broken_down_vehicle",
}

def get_icon_category_type(icon_category: int) -> str:
    """
    Ánh xạ TomTom iconCategory (int) sang incident_type (str).
    
    Args:
        icon_category: Mã loại sự cố từ TomTom Incident API
    
    Returns:
        str: Tên loại sự cố (lowercase), "unknown" nếu không khớp
    """
    return ICON_CATEGORY_MAP.get(icon_category, "unknown")
```

**Bảng compliant mapping:**

| iconCategory | incident_type | Mô tả tiếng Việt |
|:------------:|:-------------|:-----------------|
| 1 | `accident` | Tai nạn giao thông |
| 2 | `fog` | Sương mù dày |
| 3 | `dangerous_conditions` | Điều kiện nguy hiểm |
| 4 | `rain` | Mưa lớn |
| 5 | `ice` | Đóng băng (hiếm) |
| 6 | `jam` | Kẹt xe (phổ biến nhất HCM) |
| 7 | `lane_closed` | Đóng 1 hoặc nhiều làn |
| 8 | `road_closed` | Đóng đường hoàn toàn |
| 9 | `road_works` | Thi công/sửa đường |
| 10 | `wind` | Gió mạnh |
| 11 | `flooding` | Ngập nước (phổ biến mùa mưa HCM) |
| 14 | `broken_down_vehicle` | Xe hỏng giữa đường |

---

## 4. Spatial Transform – Biến đổi dữ liệu không gian

**File:** `src/utils/geo_ops.py` (phần logic) + được gọi trong `src/pipelines/spatial_net/osm_pipeline.py`

### 4.1 `derive_node_type`

```python
def derive_node_type(highway: str | None, street_count: int) -> str:
    """
    Phân loại loại nút giao thông dựa trên thuộc tính OSM.
    
    Logic rẽ nhánh (theo thứ tự ưu tiên):
        1. highway == "traffic_signals" → "signalized"
        2. street_count >= 3           → "intersection"
        3. street_count == 1           → "terminal"
        4. Còn lại (street_count == 2) → "intermediate"
    
    Args:
        highway: Thuộc tính highway từ OSM node (thường null, trừ khi là traffic signal)
        street_count: Số đường kết nối tại node này
    
    Returns:
        str: "signalized", "intersection", "terminal", hoặc "intermediate"
    """
    if highway == "traffic_signals":
        return "signalized"
    elif street_count >= 3:
        return "intersection"
    elif street_count == 1:
        return "terminal"
    else:
        return "intermediate"
```

**Thống kê tham chiếu (Quận 1):**

| node_type | Số lượng ước tính | Tỷ lệ |
|:----------|:-----------------:|:------:|
| signalized | ~219 | ~22% |
| intersection | ~450 | ~46% |
| terminal | ~150 | ~15% |
| intermediate | ~168 | ~17% |
| **Tổng** | **~987** | 100% |

### 4.2 Geometry Format Rules

| Loại | WKT Format | PostGIS Function | Ví dụ |
|:-----|:-----------|:----------------|:------|
| Point (node) | `POINT(lon lat)` | `ST_GeomFromText('POINT(106.696 10.793)', 4326)` | dim_node.geometry |
| Point (centroid) | `POINT(lon lat)` | `ST_GeomFromText(wkt, 4326)` | dim_segment.geometry_center |
| LineString (segment) | `LINESTRING(lon1 lat1, lon2 lat2, ...)` | `ST_GeomFromText(wkt, 4326)` | dim_segment.geometry_linestring |

> **QUAN TRỌNG:** WKT dùng thứ tự `(longitude latitude)` – KHÔNG phải `(lat, lon)`.  
> GeoJSON cũng dùng `[lon, lat]`. Thống nhất toàn bộ.

### 4.3 Fallback: `name`

```python
def fallback_name(name: str | None) -> str:
    """Fallback cho tên đường. Null/empty → "N/A"."""
    if name is None or (isinstance(name, str) and name.strip() == ""):
        return "N/A"
    return str(name).strip()
```

- Độ phủ OSM: **84.5%** (15.5% thiếu)
- `"N/A"` vẫn cho phép lookup và không làm mất record.

### 4.4 Fallback: `lanes`

```python
DEFAULT_LANE_COUNT: dict[str, int] = {
    "trunk": 4, "trunk_link": 3,
    "primary": 3, "primary_link": 2,
    "secondary": 2, "secondary_link": 2,
    "tertiary": 2, "tertiary_link": 2,
    "residential": 2, "living_street": 1,
}

def parse_lanes(raw_lanes: str | int | list | None, highway: str) -> int:
    """
    Parse trường lanes phức tạp từ OSM.
    
    OSM lanes có nhiều dạng:
        - None              → fallback theo highway type
        - 3 (int)           → trực tiếp
        - "3" (str)         → parse int
        - ["3", "2"] (list) → lấy max
        - "3;2" (str)       → split ";" rồi lấy max
    
    Args:
        raw_lanes: Giá trị lanes thô từ OSMnx
        highway: OSM highway type (để fallback)
    
    Returns:
        int: Số làn xe (>= 1)
    """
    if raw_lanes is None:
        return DEFAULT_LANE_COUNT.get(highway, 2)
    if isinstance(raw_lanes, int):
        return max(1, raw_lanes)
    if isinstance(raw_lanes, list):
        try:
            return max(int(x) for x in raw_lanes)
        except (ValueError, TypeError):
            return DEFAULT_LANE_COUNT.get(highway, 2)
    if isinstance(raw_lanes, str):
        try:
            if ";" in raw_lanes:
                return max(int(x.strip()) for x in raw_lanes.split(";"))
            return max(1, int(raw_lanes))
        except ValueError:
            return DEFAULT_LANE_COUNT.get(highway, 2)
    return DEFAULT_LANE_COUNT.get(highway, 2)
```

- Độ phủ OSM: **58.5%** (41.5% cần fallback)

### 4.5 Fallback: `maxspeed`

```python
DEFAULT_SPEED_LIMIT: dict[str, int] = {
    "trunk": 60, "trunk_link": 50,
    "primary": 50, "primary_link": 40,
    "secondary": 40, "secondary_link": 40,
    "tertiary": 40, "tertiary_link": 30,
    "residential": 30, "living_street": 20,
}

def parse_maxspeed(raw_speed: str | int | None, highway: str) -> int:
    """
    Parse trường maxspeed từ OSM.
    
    Dạng có thể:
        - None         → fallback theo highway type
        - 50 (int)     → trực tiếp
        - "50" (str)   → parse int
        - "50 km/h"    → extract digits
    
    Args:
        raw_speed: Giá trị maxspeed thô từ OSMnx
        highway: OSM highway type (để fallback)
    
    Returns:
        int: Tốc độ giới hạn (km/h, >= 10)
    """
    if raw_speed is None:
        return DEFAULT_SPEED_LIMIT.get(highway, 30)
    if isinstance(raw_speed, int):
        return max(10, raw_speed)
    if isinstance(raw_speed, str):
        digits = "".join(c for c in raw_speed if c.isdigit())
        if digits:
            return max(10, int(digits))
        return DEFAULT_SPEED_LIMIT.get(highway, 30)
    return DEFAULT_SPEED_LIMIT.get(highway, 30)
```

- Độ phủ OSM: **30.0%** (70% cần fallback)

### 4.6 Fallback: `width`

```
KHÔNG sử dụng. Độ phủ 0.6% → skip hoàn toàn.
```

### 4.7 FRC Mapping (OSM highway → TomTom Functional Road Class)

```python
FRC_MAP: dict[str, int] = {
    "trunk":           0,   # FRC0 – Motorway / Expressway
    "trunk_link":      0,
    "primary":         2,   # FRC2 – Major road
    "primary_link":    3,
    "secondary":       4,   # FRC4 – Secondary road
    "secondary_link":  4,
    "tertiary":        5,   # FRC5 – Local connecting
    "tertiary_link":   5,
    "residential":     6,   # FRC6 – Local road
    "living_street":   6,
}

def get_frc(highway: str) -> int:
    """Ánh xạ OSM highway type → TomTom FRC. Fallback: FRC 6 (local)."""
    return FRC_MAP.get(highway, 6)
```

### 4.8 Design Capacity

```python
LANE_CAPACITY_PCU_PER_HOUR = 2000   # PCU/h per lane (HCM standard)

def calculate_design_capacity(lane_count: int) -> int:
    """
    Tính năng lực thiết kế đường.
    
    Công thức: capacity = lane_count × 2000 (PCU/h)
    
    Args:
        lane_count: Số làn xe (từ parse_lanes)
    
    Returns:
        int: PCU/h (vd: 3 lanes → 6000)
    """
    return max(1, lane_count) * LANE_CAPACITY_PCU_PER_HOUR
```

---

## 5. Incident Transform – Biến đổi sự cố

**File:** `src/utils/weather_mapping.py` (phần incident mapping) + `src/pipelines/real_time/incident_pipeline.py`

### 5.1 `magnitude_of_delay` Handling

```python
def normalize_magnitude(magnitude: int | None) -> int:
    """
    Chuẩn hóa magnitudeOfDelay từ TomTom.
    
    Mapping:
        None → 0 (unknown)
        0    → 0 (unknown)
        1    → 1 (minor)
        2    → 2 (moderate)
        3    → 3 (major)
        4    → 4 (undefined)
    
    Returns:
        int: 0–4
    """
    if magnitude is None:
        return 0
    return max(0, min(4, magnitude))
```

### 5.2 `is_active` Derivation

```python
from datetime import datetime
from zoneinfo import ZoneInfo

def derive_is_active(end_time: str | None) -> bool:
    """
    Xác định sự cố còn đang xảy ra hay không.
    
    Logic:
        - end_time is None → True (chưa có thời gian kết thúc, coi là đang xảy ra)
        - parse(end_time) > now(Asia/Ho_Chi_Minh) → True
        - Ngược lại → False
    """
    if end_time is None:
        return True
    from dateutil.parser import parse as dt_parse
    tz_hcm = ZoneInfo("Asia/Ho_Chi_Minh")
    end_dt = dt_parse(end_time)
    if end_dt.tzinfo is None:
        end_dt = end_dt.replace(tzinfo=tz_hcm)
    return end_dt > datetime.now(tz=tz_hcm)
```

### 5.3 Incident Geometry (LineString → Point centroid)

```python
def linestring_centroid(coordinates: list[list[float]]) -> tuple[float, float]:
    """
    Tính centroid của một LineString GeoJSON.
    
    Args:
        coordinates: [[lon, lat], [lon, lat], ...] – GeoJSON order
    
    Returns:
        (centroid_lon, centroid_lat)
    """
    if not coordinates:
        return (0.0, 0.0)
    avg_lon = sum(c[0] for c in coordinates) / len(coordinates)
    avg_lat = sum(c[1] for c in coordinates) / len(coordinates)
    return (avg_lon, avg_lat)
```

> **Lưu ý:** Output dùng cho `ST_GeomFromText('POINT(lon lat)', 4326)`.

---

## 6. Key Generation – Sinh khóa chính

**File:** `src/utils/math_calc.py`

### 6.1 `generate_traffic_flow_key`

```python
import hashlib

def generate_traffic_flow_key(segment_key: int, date_key: int, time_key: int) -> int:
    """
    Sinh traffic_flow_key (BIGINT PK) deterministic từ composite.
    
    Công thức: int(sha256(f"{segment_key}_{date_key}_{time_key}").hexdigest()[:15], 16)
    
    Tại sao:
        - Composite PK = (traffic_flow_key, date_key) do table partitioning
        - traffic_flow_key phải deterministic → cùng input = cùng output (idempotent UPSERT)
        - Lấy 15 hex chars → max ~1.15 × 10^18, nằm trong BIGINT range (max 9.2 × 10^18)
    
    Args:
        segment_key: FK → dim_segment
        date_key: YYYYMMDD (INT)
        time_key: Minute of day 0–1439 (INT)
    
    Returns:
        int: Positive BIGINT
    """
    raw = f"{segment_key}_{date_key}_{time_key}"
    hex_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:15]
    return int(hex_hash, 16)
```

### 6.2 `generate_incident_key`

```python
def generate_incident_key(incident_id: str) -> int:
    """
    Sinh incident_key (BIGINT PK) từ TomTom incident id.
    
    Công thức: int(sha256(incident_id.encode()).hexdigest()[:15], 16)
    """
    hex_hash = hashlib.sha256(incident_id.encode("utf-8")).hexdigest()[:15]
    return int(hex_hash, 16)
```

### 6.3 `generate_segment_key`

```python
def generate_segment_key(from_node: int, to_node: int, osmid: int) -> int:
    """
    Sinh segment_key (BIGINT PK) từ OSM edge triple.
    
    Công thức: int(sha256(f"{from_node}_{to_node}_{osmid}").hexdigest()[:15], 16)
    """
    raw = f"{from_node}_{to_node}_{osmid}"
    hex_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:15]
    return int(hex_hash, 16)
```

### 6.4 `generate_road_key`

```python
def generate_road_key(road_name: str) -> int:
    """
    Sinh road_key (BIGINT PK) từ tên đường.
    
    Công thức: int(sha256(name.encode()).hexdigest()[:15], 16)
    Lưu ý: road_name đã qua fallback_name(), không bao giờ None.
    """
    hex_hash = hashlib.sha256(road_name.encode("utf-8")).hexdigest()[:15]
    return int(hex_hash, 16)
```

---

## 7. Time Derivation – Chuyển đổi thời gian

**File:** `src/utils/math_calc.py`

### 7.1 `derive_date_key`

```python
from datetime import datetime
from zoneinfo import ZoneInfo

TZ_HCM = ZoneInfo("Asia/Ho_Chi_Minh")

def derive_date_key(ts: datetime | None = None) -> int:
    """
    Chuyển timestamp → date_key (YYYYMMDD INT).
    
    Args:
        ts: datetime object. Nếu None → dùng datetime.now(tz=TZ_HCM)
    
    Returns:
        int: VD 20260228
    
    QUAN TRỌNG: Luôn convert sang Asia/Ho_Chi_Minh trước khi format.
    Vì API có thể trả UTC, nhưng date_key phải theo giờ VN.
    """
    if ts is None:
        ts = datetime.now(tz=TZ_HCM)
    elif ts.tzinfo is None:
        ts = ts.replace(tzinfo=TZ_HCM)
    else:
        ts = ts.astimezone(TZ_HCM)
    return int(ts.strftime("%Y%m%d"))
```

### 7.2 `derive_time_key`

```python
def derive_time_key(ts: datetime | None = None) -> int:
    """
    Chuyển timestamp → time_key (minute of day, 0–1439).
    
    Công thức: hour * 60 + minute
    
    Args:
        ts: datetime object. Nếu None → dùng datetime.now(tz=TZ_HCM)
    
    Returns:
        int: 0 (00:00) đến 1439 (23:59)
    
    QUAN TRỌNG: Luôn convert sang Asia/Ho_Chi_Minh.
    """
    if ts is None:
        ts = datetime.now(tz=TZ_HCM)
    elif ts.tzinfo is None:
        ts = ts.replace(tzinfo=TZ_HCM)
    else:
        ts = ts.astimezone(TZ_HCM)
    return ts.hour * 60 + ts.minute
```

### 7.3 `derive_month_year_key`

```python
def derive_month_year_key(date_key: int) -> int:
    """
    Trích month_year_key từ date_key.
    
    Ví dụ: 20260228 → 202602
    """
    return date_key // 100
```

---

## 8. Geo Operations – Hàm tính toán không gian

**File:** `src/utils/geo_ops.py`

> **Lưu ý:** File này **được phép** import `shapely`, `geopandas` (thư viện pure geometry, không IO). KHÔNG import requests, sqlalchemy, database.

### 8.1 `haversine_distance`

```python
import math

EARTH_RADIUS_M = 6_371_000  # Bán kính Trái Đất (mét)

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Khoảng cách Haversine giữa 2 tọa độ (mét).
    
    Args:
        lat1, lon1: Tọa độ điểm 1 (WGS84 degrees)
        lat2, lon2: Tọa độ điểm 2
    
    Returns:
        float: Khoảng cách tính bằng mét
    """
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_M * c
```

### 8.2 `find_nearest_segment`

```python
def find_nearest_segment(
    lat: float, lon: float, segments_gdf: "geopandas.GeoDataFrame"
) -> int:
    """
    Tìm segment gần nhất với tọa độ cho trước.
    
    Args:
        lat, lon: Tọa độ điểm cần match (VD: centroid của TomTom coordinates)
        segments_gdf: GeoDataFrame chứa dim_segment (geometry_center column)
    
    Returns:
        int: segment_key của segment gần nhất
    
    Method:
        Dùng shapely.geometry.Point + geopandas .distance() → argmin
    """
    from shapely.geometry import Point
    point = Point(lon, lat)  # shapely dùng (x=lon, y=lat)
    distances = segments_gdf.geometry.distance(point)
    nearest_idx = distances.idxmin()
    return int(segments_gdf.loc[nearest_idx, "segment_key"])
```

### 8.3 WKT Helper Functions

```python
def coords_to_wkt_point(lon: float, lat: float) -> str:
    """Convert (lon, lat) → WKT Point string."""
    return f"POINT({lon} {lat})"

def coords_to_wkt_linestring(coords: list[tuple[float, float]]) -> str:
    """
    Convert list of (lon, lat) → WKT LineString.
    
    Args:
        coords: [(lon1, lat1), (lon2, lat2), ...]
    
    Returns:
        str: "LINESTRING(lon1 lat1, lon2 lat2, ...)"
    """
    pairs = ", ".join(f"{lon} {lat}" for lon, lat in coords)
    return f"LINESTRING({pairs})"
```

---

## 9. Hằng số toàn cục

> Tất cả hằng số dưới đây **BẮT BUỘC** sử dụng đúng giá trị. KHÔNG thay đổi.

### 9.1 PCU Coefficients

```python
PCU_MOTORCYCLE = 0.25
PCU_CAR = 1.0
PCU_BUS_TRUCK = 2.0
```

### 9.2 BPR Parameters

```python
BPR_ALPHA = 0.15           # BPR volume-delay coefficient
BPR_BETA = 4.0             # BPR exponent
LANE_CAPACITY = 2000       # PCU/h per lane
```

### 9.3 LOS Thresholds

```python
LOS_THRESHOLDS = {
    "A": (0.00, 0.15),
    "B": (0.15, 0.30),
    "C": (0.30, 0.45),
    "D": (0.45, 0.60),
    "E": (0.60, 0.80),
    "F": (0.80, 1.00),
}
```

### 9.4 Geospatial Constants

```python
WGS84 = "EPSG:4326"
UTM_48N = "EPSG:32648"
TZ_HCM = "Asia/Ho_Chi_Minh"
EARTH_RADIUS_M = 6_371_000

BBOX_DISTRICT_1 = {
    "min_lon": 106.663, "min_lat": 10.743,
    "max_lon": 106.723, "max_lat": 10.803,
}
CENTER_HCM = {"lat": 10.7764, "lon": 106.7011}
```

### 9.5 Default Infrastructure Values

```python
DEFAULT_LANE_COUNT = {
    "trunk": 4, "trunk_link": 3,
    "primary": 3, "primary_link": 2,
    "secondary": 2, "secondary_link": 2,
    "tertiary": 2, "tertiary_link": 2,
    "residential": 2, "living_street": 1,
}

DEFAULT_SPEED_LIMIT = {
    "trunk": 60, "trunk_link": 50,
    "primary": 50, "primary_link": 40,
    "secondary": 40, "secondary_link": 40,
    "tertiary": 40, "tertiary_link": 30,
    "residential": 30, "living_street": 20,
}

FRC_MAP = {
    "trunk": 0, "trunk_link": 0,
    "primary": 2, "primary_link": 3,
    "secondary": 4, "secondary_link": 4,
    "tertiary": 5, "tertiary_link": 5,
    "residential": 6, "living_street": 6,
}
```

---

## Tổng hợp: File → Function Mapping

| File | Hàm | Section |
|:-----|:----|:--------|
| `utils/math_calc.py` | `calculate_traffic_index()` | §1.1 |
| `utils/math_calc.py` | `calculate_los_level()` | §1.2 |
| `utils/math_calc.py` | `calculate_congestion_level()` | §1.3 |
| `utils/math_calc.py` | `calculate_delay_seconds()` | §1.4 |
| `utils/math_calc.py` | `calculate_quality_flag()` | §1.5 |
| `utils/math_calc.py` | `calculate_pcu()` | §2.2 |
| `utils/math_calc.py` | `estimate_pcu_from_speed()` | §2.3 |
| `utils/math_calc.py` | `generate_traffic_flow_key()` | §6.1 |
| `utils/math_calc.py` | `generate_incident_key()` | §6.2 |
| `utils/math_calc.py` | `generate_segment_key()` | §6.3 |
| `utils/math_calc.py` | `generate_road_key()` | §6.4 |
| `utils/math_calc.py` | `derive_date_key()` | §7.1 |
| `utils/math_calc.py` | `derive_time_key()` | §7.2 |
| `utils/math_calc.py` | `derive_month_year_key()` | §7.3 |
| `utils/weather_mapping.py` | `get_weather_severity()` | §3.1 |
| `utils/weather_mapping.py` | `get_icon_category_type()` | §3.2 |
| `utils/weather_mapping.py` | `normalize_magnitude()` | §5.1 |
| `utils/weather_mapping.py` | `derive_is_active()` | §5.2 |
| `utils/geo_ops.py` | `derive_node_type()` | §4.1 |
| `utils/geo_ops.py` | `fallback_name()` | §4.3 |
| `utils/geo_ops.py` | `parse_lanes()` | §4.4 |
| `utils/geo_ops.py` | `parse_maxspeed()` | §4.5 |
| `utils/geo_ops.py` | `get_frc()` | §4.7 |
| `utils/geo_ops.py` | `calculate_design_capacity()` | §4.8 |
| `utils/geo_ops.py` | `linestring_centroid()` | §5.3 |
| `utils/geo_ops.py` | `haversine_distance()` | §8.1 |
| `utils/geo_ops.py` | `find_nearest_segment()` | §8.2 |
| `utils/geo_ops.py` | `coords_to_wkt_point()` | §8.3 |
| `utils/geo_ops.py` | `coords_to_wkt_linestring()` | §8.3 |

---

> **Tham chiếu chéo:**
> - `spec_3_data_contracts.md` → Cấu trúc JSON raw, field contracts, Pydantic schemas
> - `spec_5_target_mapping.md` → Quy tắc UPSERT, column mapping, PostGIS, batch insert
> - `spec_1_blueprint.md` → Vị trí file, dependency graph
> - `spec_2_base_interface.md` → ABC interface, coding rules
