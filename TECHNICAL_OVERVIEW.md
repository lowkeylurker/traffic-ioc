# 🚀 Traffic IoC - Comprehensive Technical Overview

**Last Updated:** April 28, 2026  
**Scope:** Complete smart traffic management system for Ho Chi Minh City (HCMC), Vietnam

---

## 📑 Table of Contents

1. [System Architecture & Data Flow](#1-system-architecture--data-flow)
2. [APIs & External Data Sources](#2-apis--external-data-sources)
3. [Congestion Detection](#3-congestion-detection)
4. [Incident Handling](#4-incident-handling)
5. [Database Schema & Data Model](#5-database-schema--data-model)
6. [ETL Pipeline Architecture](#6-etl-pipeline-architecture)
7. [Processing Components & Relationships](#7-processing-components--relationships)
8. [System Stack & Technologies](#8-system-stack--technologies)

---

## 1. System Architecture & Data Flow

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TRAFFIC IOC MONOREPO SYSTEM                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL DATA SOURCES                               │
├──────────────────────────────────────────────────────────────────────────────┤
│  • TomTom Traffic Flow API (v4)       - Real-time traffic speed & incidents  │
│  • OpenWeatherMap Grid API            - Weather data (500m grid mode)        │
│  • OSM (OpenStreetMap)                - Network topology (nodes, ways)       │
│  • Camera AI / YOLO Detection         - Vehicle counting (future)            │
└──────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│                      DATA PIPELINE LAYER (Python ETL)                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ REAL-TIME EXTRACTION (Every 15 min, 06:00-21:00 VN Time)              │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │  1. Weather Pipeline      → Extract grid cells weather data            │ │
│  │  2. Traffic Pipeline      → Extract TomTom flow data per segment       │ │
│  │  3. Incident Pipeline     → Extract traffic incidents from TomTom      │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│         ↓                                                                    │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ TRANSFORMATION (Pure Functions - Deterministic)                        │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │  • Calculate Traffic Index (TI = 1 - current_speed/free_flow_speed)    │ │
│  │  • Map to LOS Level (A-F classification based on HCM 2010 standards)   │ │
│  │  • Calculate Congestion Level (0-5 based on LOS)                       │ │
│  │  • Estimate PCU Volume (Bureau of Public Roads model)                  │ │
│  │  • Calculate Travel Delay (actual_time - free_flow_time)               │ │
│  │  • Normalize weather severity & map coordinates                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│         ↓                                                                    │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ LOADING (UPSERT with Idempotency)                                      │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │  → fact_traffic_flow    (INSERT ON CONFLICT DO UPDATE)                 │ │
│  │  → fact_incident        (INSERT ON CONFLICT DO UPDATE)                 │ │
│  │  → dim_weather          (INSERT ON CONFLICT DO UPDATE)                 │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│         ↓ (After realtime succeeds)                                         │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ BATCH ANALYTICS (Nightly Aggregation)                                  │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │  • Baseline Speed       → Aggregate historical speed statistics        │ │
│  │  • Corridor Performance → Calculate TTI, efficiency, bottlenecks (Q1)  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│                      PostgreSQL DATA WAREHOUSE                               │
├──────────────────────────────────────────────────────────────────────────────┤
│  PostGIS-enabled, Partitioned Fact Tables, Galaxy Schema                     │
│                                                                              │
│  ┌─────────────────────────┐  ┌─────────────────────────┐                  │
│  │  Fact Tables            │  │  Dimension Tables       │                  │
│  ├─────────────────────────┤  ├─────────────────────────┤                  │
│  │ • fact_traffic_flow     │  │ • dim_segment           │                  │
│  │ • fact_incident         │  │ • dim_corridor          │                  │
│  │ • fact_event            │  │ • dim_location          │                  │
│  │ • fact_corridor_perf    │  │ • dim_date/time         │                  │
│  │ • fact_risk_prediction  │  │ • dim_weather           │                  │
│  │ • fact_simulation       │  │ • dim_node/way/road     │                  │
│  └─────────────────────────┘  └─────────────────────────┘                  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│                      BACKEND API LAYER (Node.js/Express)                     │
├──────────────────────────────────────────────────────────────────────────────┤
│  REST API with 3 modules:                                                    │
│  • /api/v1/map              - Segments, status, real-time traffic           │
│  • /api/v1/analytics        - Speed comparison, reliability, corridors      │
│  • /api/v1/simulation       - Forecasting, route optimization               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│                      FRONTEND LAYER (React/Vite)                             │
├──────────────────────────────────────────────────────────────────────────────┤
│  3 Main Pages:                                                               │
│  • Real-Time Monitoring   - Interactive Mapbox GL, weather, alerts          │
│  • Analytics & Statistics - Speed comparison, vehicle mix, heatmap          │
│  • Simulation & Forecast  - 60-min forecasts, route optimization            │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Complete Data Flow

**Real-Time Cycle (Every 15 minutes):**

```
06:00-21:00 (VN Time) → 61 cycles/day

[START CYCLE]
    ↓
[Weather Extraction]
  • Query OpenWeatherMap API per 500m grid cell
  • Extract: temperature, humidity, precipitation, cloud cover
  • Map to severity levels (0-5)
    ↓
[Traffic Extraction]
  • Query TomTom Traffic Flow API per critical segment
  • TomTom Key Pool: Auto-rotate among N keys if quota exhausted
  • Per-key 403 handling: Block key, retry point with next key
  • Extract: current_speed, free_flow_speed, travel_time
    ↓
[Incident Extraction]
  • Query TomTom Incidents API per HCMC bounding box
  • Extract: incident_type, location, severity, geometry
    ↓
[TRANSFORMATION (Pure Functions)]
  • Calculate Traffic Index, LOS, Congestion, PCU, Delay
  • Validate schemas with Pydantic
  • Map geometry to nearest segment
    ↓
[LOADING]
  • UPSERT fact_traffic_flow  (partitioned by date_key)
  • UPSERT fact_incident      (partitioned by date_key)
  • UPSERT dim_weather        (non-partitioned)
    ↓
[IF SUCCESS → BATCH IMMEDIATELY]
    ↓
[Baseline Speed Calculation]
  • Aggregate historical speed for each segment
  • Store in fact_baseline_speed
    ↓
[Corridor Performance Calculation - Q1 ONLY]
  • Aggregate data per corridor
  • Calculate: TTI, efficiency, bottlenecks
  • Store in fact_corridor_performance
    ↓
[END CYCLE]
```

**Daily Health Check (05:50 VN Time):**
```
Probe each TomTom API key
  → Report: usable_keys, blocked_keys, effective_budget/cycle
  → Auto-compute safe_traffic_segment_limit for realtime
```

### 1.3 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **ETL over Real-time Ingestion** | Easier retry logic, batch processing, UPSERT idempotency |
| **TomTom Key Pool** | Single key insufficient; pool allows ~N times budget (N=1-20 keys) |
| **Gold Corridor Mode** | Quality-first approach: concentrate budget on priority corridors rather than broad coverage |
| **UPSERT-based Loading** | Ensures idempotency; safe for retry scenarios without duplicate data |
| **Partitioned Fact Tables** | Fast purging of old data; query optimization by date ranges |
| **Galaxy Schema** | Star schema + conformed dimensions; fits traffic domain well (segments, corridors, time, weather) |
| **Python ETL + Node.js API** | Python for data transformation; Node.js for REST API serving |

---

## 2. APIs & External Data Sources

### 2.1 TomTom Traffic Flow API (v4)

**Endpoint:** `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json`

**Purpose:** Retrieve real-time traffic speed and flow metrics for a specific segment

**Request Parameters:**
```python
{
    "key": "<API_KEY>",              # TomTom API key
    "point": "<LAT>,<LON>",          # Segment center coordinates (WGS84)
    "unit": "KMPH"                   # Speed unit (kilometers per hour)
}
```

**Response Sample:**
```json
{
  "flowSegmentData": {
    "freeFlowSpeed": 60,
    "currentSpeed": 25,
    "currentTravelTime": 120,
    "freeFlowTravelTime": 60,
    "confidence": 0.85,
    "roadClosure": false
  }
}
```

**Data Extraction Process:**
1. Select a segment from priority corridor list (based on budget)
2. Use segment's `geometry_center` (stored in `dim_segment`)
3. Make request with available TomTom key (from pool)
4. If 403 → Mark key blocked, retry with next key
5. If network error → Retry up to 3 times (via tenacity)
6. Store raw response in transformer

**Key Pool Management:**
```python
class TomTomKeyPool:
    - DAILY_LIMIT_PER_KEY = 2500 (free tier)
    - Auto-rotate: get_next_key() → key with lowest daily usage
    - mark_blocked(key) → Block key for remaining day if 403
    - record_success(key) → Increment daily counter
    - Auto-reset: On date change, reset usage counters
```

**Budget Formula:**
```
Budget/cycle = (N_keys × 2500) ÷ 61 cycles/day
Safe_segment_limit = (Budget/cycle - 3) × 0.90

Example:
  5 keys → 12,500/day → ~204/cycle → ~180 safe segments/cycle
  20 keys → 50,000/day → ~819/cycle → ~734 safe segments/cycle
```

### 2.2 OpenWeatherMap Current Weather API

**Endpoint:** `https://api.openweathermap.org/data/2.5/weather`

**Purpose:** Retrieve weather conditions for correlation with traffic metrics

**Runtime Mode:** Grid-based (Option C) - 500m cells

**Request Parameters:**
```python
{
    "lat": <LAT>,
    "lon": <LON>,
    "appid": "<OWM_API_KEY>",
    "units": "metric"
}
```

**Response Mapping:**
```python
Weather API Response → Severity Level (0-5)
- Clear:     severity = 0  (Free flow conditions)
- Cloudy:    severity = 1
- Rain:      severity = 3  (Moderate impact)
- Drizzle:   severity = 2
- Storm:     severity = 4  (Heavy impact)
- Snow:      severity = 5  (Severe impact)
```

**Grid Processing:**
1. Load all segments for this realtime cycle
2. Group segments by 500m grid cell using spatial indexing
3. For each active grid cell center, make ONE OWM call
4. Assign returned weather_key to all segments in that cell
5. Throttle calls: `OWM_GRID_MIN_CALL_INTERVAL_SEC = 0.9s` (prevent 429)

**Monitoring 429 Rate Limits:**
- Log marker: `"OWM429: rate limit hit for cell=..."`
- If >5 events/day → increase interval (0.9 → 1.1)
- If still frequent → add another OWM key

### 2.3 OpenStreetMap (OSM) Network Data

**Purpose:** Build initial network topology (nodes, ways, segments)

**Integration Points:**
- `OSMnx` library to download OSM network for HCMC
- Extract ways (road sections) and nodes (intersections)
- Filter by highway type: `primary, secondary, tertiary, trunk`
- Store in dimensions: `dim_way`, `dim_node`, `dim_segment`

**Query Example (OSMnx):**
```python
import osmnx as ox
G = ox.graph_from_place("Ho Chi Minh City, Vietnam")
# Convert to GeoDataFrame and extract coordinates
```

---

## 3. Congestion Detection

### 3.1 Algorithm Overview

Congestion detection uses a **hierarchical classification system** based on traffic speed ratios:

```
Traffic Index (TI) = 1.0 - (Current_Speed / Free_Flow_Speed)
                   = 1.0 - (V_current / V_freeflow)
                   = Clamp[0.0, 1.0]

Where:
  • V_current = Actual observed speed (km/h)
  • V_freeflow = Maximum unobstructed speed (km/h)
  • TI ∈ [0, 1]: 0 = free flow, 1 = complete gridlock
```

### 3.2 Level of Service (LOS) Classification

Based on **HCM 2010 standards**, Traffic Index → LOS A-F mapping:

| LOS | Traffic Index Range | Congestion Level | Description |
|-----|-------------------|------------------|-------------|
| **A** | 0.00 - 0.15 | 0 | Free flow, minimal delays |
| **B** | 0.15 - 0.30 | 1 | Reasonably free flow, slight congestion |
| **C** | 0.30 - 0.45 | 2 | Stable flow, but approaching instability |
| **D** | 0.45 - 0.60 | 3 | Approaching unstable flow |
| **E** | 0.60 - 0.80 | 4 | Unstable flow, significant congestion |
| **F** | 0.80 - 1.00 | 5 | Forced/breakdown flow, gridlock |

### 3.3 Calculation Implementation

**File:** `data-pipeline/src/utils/math_calc.py`

```python
def calculate_traffic_index(current_speed: float, free_flow_speed: float) -> float:
    """
    Calculate normalized traffic congestion index.
    Returns NaN if free_flow_speed <= 0 or speeds are invalid.
    """
    if free_flow_speed <= 0:
        return float('nan')
    ti = 1.0 - (current_speed / free_flow_speed)
    return float(np.clip(ti, 0.0, 1.0))

def calculate_los_level(traffic_index: float) -> str:
    """Map traffic index to LOS level A-F"""
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

def calculate_congestion_level(los_level: str) -> int:
    """Map LOS to numeric level 0-5"""
    mapping = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4, "F": 5}
    return mapping.get(los_level.upper(), 0)
```

### 3.4 Data Storage

**Stored Fields in `fact_traffic_flow`:**
```sql
fact_traffic_flow
├── traffic_index       DECIMAL(3,2)  -- [0.00, 1.00]
├── los_level           CHAR(1)       -- 'A' to 'F'
├── congestion_level    SMALLINT      -- 0 to 5
├── current_speed_kmh   DECIMAL(5,2)  -- Actual speed
├── free_flow_speed_kmh DECIMAL(5,2)  -- Reference speed
├── delay_seconds       INT           -- Travel delay
└── timestamp           TIMESTAMP     -- When recorded
```

### 3.5 Real-Time Visualization

**Frontend Color Mapping:**
```typescript
function getLosColor(losLevel: string): string {
  const colorMap = {
    "A": "#00AA00",  // Green - free flow
    "B": "#CCFF00",  // Yellow-green
    "C": "#FFFF00",  // Yellow
    "D": "#FF9900",  // Orange
    "E": "#FF6600",  // Red-orange
    "F": "#FF0000"   // Red - gridlock
  };
  return colorMap[losLevel] || "#CCCCCC";
}
```

**Dashboard Alert Conditions:**
- LOS E or F detected → Show alert
- TTI > 1.5 → "High travel time"
- >5 active incidents → "High incident count"

---

## 4. Incident Handling

### 4.1 Incident Data Pipeline

**Extraction:**

```python
class IncidentExtractor(BaseExtractor):
    """Query TomTom Incidents API v5"""
    
    BASE_URL = "https://api.tomtom.com/traffic/services/5/incidentDetails"
    
    def extract(self, **kwargs):
        bbox = kwargs.get("bbox", BBOX_HCM)  # HCMC bounding box
        
        # Request parameters
        params = {
            "key": self.api_key,
            "bbox": f"{min_lat},{min_lon},{max_lat},{max_lon}",
            "fields": "{incidents{type,geometry,properties{...}}}",
            "timeValidityFilter": "present"  # Current incidents only
        }
        
        # Returns: list of incident objects with properties:
        # - type: accident, roadwork, flood, congestion, etc.
        # - geometry: Point coordinates
        # - properties: iconCategory, magnitudeOfDelay, startTime, endTime
```

**Response Mapping:**

```python
{
  "incidents": [
    {
      "type": "accident",
      "geometry": {
        "type": "Point",
        "coordinates": [106.6789, 10.7722]  # [lon, lat]
      },
      "properties": {
        "iconCategory": 1,           # Incident type icon
        "magnitudeOfDelay": 4,       # Delay severity (0-4)
        "startTime": "2026-04-28T...",
        "endTime": "2026-04-28T...",
        "from": "Nguyen Hue Blvd",
        "to": "Pasteur St",
        "delay": 300,                # Delay in seconds
        "length": 200                # Incident zone length (m)
      }
    }
  ]
}
```

### 4.2 Transformation & Severity Mapping

```python
class IncidentTransformer(BaseTransformer):
    """Transform raw incidents to fact_incident schema"""
    
    def transform(self, raw_data: list[dict]) -> list[dict]:
        transformed = []
        
        for incident in raw_data:
            # Extract geometry
            geometry = incident["geometry"]["coordinates"]
            coords_wkt = coords_to_wkt_point(geometry)  # WKT format
            
            # Map incident type
            incident_type = incident["type"]  # accident, roadwork, etc.
            
            # Map severity
            magnitude = incident["properties"]["magnitudeOfDelay"]
            severity = {
                0: 1,  # None → Low
                1: 2,  # Minimal → Medium
                2: 3,  # Moderate
                3: 4,  # Severe
                4: 5   # Very severe
            }.get(magnitude, 3)
            
            # Calculate fields
            date_key = derive_date_key(incident["properties"]["startTime"])
            time_key = derive_time_key(incident["properties"]["startTime"])
            delay_seconds = incident["properties"]["delay"]
            
            # Check if active (end_time not yet reached)
            is_active = derive_is_active(
                start=incident["properties"]["startTime"],
                end=incident["properties"].get("endTime")
            )
            
            # Build record
            record = {
                "incident_key": generate_incident_key(...),
                "segment_key": self._find_nearest_segment(coords_wkt),
                "incident_type": incident_type,
                "severity_level": severity,
                "timestamp": incident["properties"]["startTime"],
                "date_key": date_key,
                "time_key": time_key,
                "geometry": coords_wkt,
                "is_active": is_active,
                "delay_seconds": delay_seconds
            }
            transformed.append(record)
        
        return transformed
```

### 4.3 Storage & Queries

**Fact Table:**
```sql
fact_incident
├── incident_key       BIGINT (PK)     -- Unique ID
├── segment_key        BIGINT (FK)     -- Nearest segment
├── date_key           INT (FK/PK)     -- Partition key (YYYYMMDD)
├── time_key           INT (FK)        -- Time of day
├── incident_type      VARCHAR(50)     -- Type classification
├── severity_level     SMALLINT        -- 1-5
├── timestamp          TIMESTAMP       -- When occurred
├── is_active          BOOLEAN         -- Currently ongoing?
├── delay_seconds      INT             -- Associated delay
├── geometry           GEOMETRY(Point)  -- PostGIS point
└── inserted_at        TIMESTAMP       -- ETL load time
```

**Queries (Examples):**
```sql
-- Find active incidents in last hour
SELECT * FROM fact_incident
WHERE is_active = true
  AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY severity_level DESC;

-- Incident count by type
SELECT incident_type, COUNT(*) as count
FROM fact_incident
WHERE date_key = 20260428
GROUP BY incident_type
ORDER BY count DESC;

-- Find incidents near a corridor
SELECT f.incident_key, f.severity_level, ST_Distance(f.geometry, s.geometry_center) as dist_m
FROM fact_incident f
JOIN bridge_corridor_segment bcs ON ...
WHERE bcs.corridor_key = 12345
  AND ST_DWithin(f.geometry, s.geometry_center, 500)  -- Within 500m
ORDER BY dist_m;
```

---

## 5. Database Schema & Data Model

### 5.1 Schema Overview (Galaxy Schema)

```
┌─────────────────────────────────────────────────────────────────┐
│                        FACT TABLES                              │
├─────────────────────────────────────────────────────────────────┤
│ • fact_traffic_flow              (PARTITIONed by date_key)      │
│ • fact_incident                  (PARTITIONed by date_key)      │
│ • fact_event                                                     │
│ • fact_traffic_risk_prediction   (PARTITIONed by date_key)      │
│ • fact_simulation_scenario                                       │
│ • fact_corridor_performance                                      │
│ • fact_baseline_speed (derived from batch)                       │
└─────────────────────────────────────────────────────────────────┘
         │
         │ (Foreign Keys)
         ↓
┌─────────────────────────────────────────────────────────────────┐
│                      DIMENSION TABLES                            │
├─────────────────────────────────────────────────────────────────┤
│ INFRASTRUCTURE:                                                 │
│ • dim_segment          - Road segments (LineString geometry)    │
│ • dim_node             - Intersections (Point geometry)          │
│ • dim_way              - Road sections (groups of segments)      │
│ • dim_road             - Named roads                             │
│                                                                 │
│ MANAGEMENT & LOCATION:                                          │
│ • dim_corridor         - Priority traffic corridors             │
│ • dim_location         - Admin boundaries (Polygon geometry)     │
│ • bridge_corridor_segment - N-N bridge (ordered)                │
│                                                                 │
│ TIME & CALENDAR:                                                │
│ • dim_date             - Days (Key: YYYYMMDD)                  │
│ • dim_time_of_day      - Minutes (Key: 0-1439)                 │
│ • dim_shift            - Work shifts                            │
│ • dim_month_year       - Months (Key: YYYYMM)                  │
│ • dim_holiday          - Holiday definitions                    │
│ • bridge_date_holiday  - N-N bridge                             │
│                                                                 │
│ CONTEXTUAL:                                                     │
│ • dim_weather          - Weather conditions                     │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Key Tables Deep Dive

**`dim_segment` - Road Segments (Atomic Level)**

```sql
CREATE TABLE dim_segment (
    segment_key         BIGINT PRIMARY KEY,
    from_node_key       BIGINT REFERENCES dim_node,
    to_node_key         BIGINT REFERENCES dim_node,
    way_key             BIGINT REFERENCES dim_way,
    location_key        BIGINT REFERENCES dim_location,
    segment_id_source   BIGINT,                   -- TomTom/OSM ID
    length_m            DECIMAL(10,2),            -- Segment length (m)
    geometry_center     GEOMETRY(Point, 4326),    -- Center point
    geometry_linestring GEOMETRY(LineString, 4326),-- Full shape
    is_one_way          BOOLEAN DEFAULT FALSE,
    record_timestamp    TIMESTAMP DEFAULT NOW()
);

-- Total segments in HCMC Q1: ~920 (gold corridor priority mode)
-- Central districts: ~11,678 segments across 60+ corridors
```

**`fact_traffic_flow` - Real-Time Traffic Data**

```sql
CREATE TABLE fact_traffic_flow (
    traffic_flow_key    BIGINT NOT NULL,
    segment_key         BIGINT NOT NULL REFERENCES dim_segment,
    time_key            INT NOT NULL REFERENCES dim_time_of_day,
    date_key            INT NOT NULL REFERENCES dim_date,
    weather_key         INT REFERENCES dim_weather,
    timestamp           TIMESTAMP NOT NULL,
    
    -- Raw TomTom data
    current_speed_kmh   DECIMAL(5,2),
    free_flow_speed_kmh DECIMAL(5,2),
    
    -- Derived metrics
    traffic_index       DECIMAL(3,2),            -- [0.00, 1.00]
    los_level           CHAR(1),                 -- A-F
    congestion_level    SMALLINT,                -- 0-5
    delay_seconds       INT,
    pcu_volume          DECIMAL(10,2),           -- PCU vehicles/hour
    
    -- Quality flags
    quality_flag        SMALLINT DEFAULT 1,      -- 1-9 confidence
    is_closed           BOOLEAN DEFAULT FALSE,
    
    inserted_at         TIMESTAMP NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (traffic_flow_key, date_key)
)
PARTITION BY RANGE (date_key);  -- Monthly partitions

-- Growth: ~2,400-11,000 rows/day depending on segment count
-- Q1 mode: ~920 segments × 61 cycles = ~56,120 rows/day
```

**`fact_corridor_performance` - Aggregated Corridor Metrics**

```sql
CREATE TABLE fact_corridor_performance (
    corridor_perf_key       BIGINT PRIMARY KEY,
    corridor_key            BIGINT NOT NULL REFERENCES dim_corridor,
    time_key                INT NOT NULL REFERENCES dim_time_of_day,
    date_key                INT NOT NULL REFERENCES dim_date,
    bottleneck_seg_key      BIGINT REFERENCES dim_segment,
    timestamp               TIMESTAMP NOT NULL,
    
    -- Aggregated metrics
    avg_corridor_speed      DECIMAL(5,2),        -- Avg speed (km/h)
    total_delay_seconds     INT,                 -- Sum of delays
    travel_time_index       DECIMAL(4,2),        -- TTI
    corridor_efficiency     DECIMAL(3,2),        -- 0.0-1.0
    active_incident_count   INT,                 -- # incidents
    
    corridor_version        INT DEFAULT 1,
    inserted_at             TIMESTAMP NOT NULL DEFAULT NOW()
);

-- One row per corridor per time_key (typically hourly aggregates)
-- Q1 mode: ~10-30 corridors × 24 hours = 240-720 rows/day
```

**`dim_corridor` - Priority Traffic Corridors**

```sql
CREATE TABLE dim_corridor (
    corridor_key        BIGINT PRIMARY KEY,
    corridor_name       VARCHAR(255) NOT NULL,  -- E.g., "Nguyễn Văn Linh"
    importance_level    SMALLINT,               -- Priority (1-5)
    corridor_version    INT NOT NULL DEFAULT 1,
    target_avg_speed    DECIMAL(5,2),           -- Target km/h
    total_length_m      DECIMAL(12,2),
    direction           VARCHAR(10),            -- NB/SB/EB/WB
    record_timestamp    TIMESTAMP DEFAULT NOW()
);

-- Current Q1 Gold Corridors (~6-10):
-- Cách Mạng Tháng 8, Nguyễn Văn Linh, Nguyễn Hữu Thọ, 
-- Phạm Văn Đồng, Quốc Lộ 1A Urban, Trường Chinh, etc.
```

### 5.3 Bridge Tables (N-N Relationships)

```sql
-- Corridor-Segment mapping (ordered)
bridge_corridor_segment (
    corridor_key    BIGINT REFERENCES dim_corridor,
    segment_key     BIGINT REFERENCES dim_segment,
    sequence_order  INT NOT NULL,                -- Position in corridor
    PRIMARY KEY (corridor_key, segment_key)
);

-- Date-Holiday mapping
bridge_date_holiday (
    date_key    INT REFERENCES dim_date,
    holiday_key INT REFERENCES dim_holiday,
    PRIMARY KEY (date_key, holiday_key)
);
```

### 5.4 Partitioning Strategy

**Fact tables partitioned by `date_key` (RANGE partitioning):**

```sql
-- Monthly partitions for 2024
fact_traffic_flow_202401 PARTITION FOR VALUES FROM (20240101) TO (20240201)
fact_traffic_flow_202402 PARTITION FOR VALUES FROM (20240201) TO (20240301)
...
fact_traffic_flow_202412 PARTITION FOR VALUES FROM (20241201) TO (20250101)

-- Benefits:
-- • DROP PARTITION for fast data purge (instead of DELETE)
-- • Query planner eliminates partitions not in date range
-- • Parallel scans across partitions
-- • Lower maintenance overhead
```

---

## 6. ETL Pipeline Architecture

### 6.1 Pipeline Execution Model

```
┌──────────────────────────────────────────────────────┐
│        ETL SCHEDULER (APScheduler in Python)         │
│                    Container:                        │
│              etl-scheduler:latest                    │
└──────────────────────────────────────────────────────┘

Daily Schedule:

05:50 VN Time  →  [HEALTH CHECK]
               →  health-tomtom-keys
               →  Probe all TomTom keys
               →  Report: usable_keys, blocked_keys, budget/cycle

06:00-21:00    →  [REALTIME CYCLE] (Every 15 minutes, 61 cycles)
Every 15 min   →  run-realtime --budget-mode
               →  Weather → Traffic → Incidents
               →  Loads: fact_traffic_flow, fact_incident, dim_weather
               │
               └──→ IF SUCCESS ──→ run-batch
                                   ├─ Baseline speed (all)
                                   └─ Corridor perf (Q1 only)
```

### 6.2 Core Pipeline Modules

**Directory Structure:**
```
data-pipeline/
├── src/
│   ├── pipelines/
│   │   ├── base.py                    # BaseExtractor, BaseTransformer, BaseLoader
│   │   ├── real_time/
│   │   │   ├── weather_pipeline.py    # Weather extraction & transformation
│   │   │   ├── traffic_pipeline.py    # Traffic flow ETL
│   │   │   └── incident_pipeline.py   # Incidents ETL
│   │   └── ml_features/
│   │       ├── baseline_pipeline.py   # Baseline speed aggregation
│   │       └── corridor_pipeline.py   # Corridor performance calculation
│   │
│   ├── core/
│   │   ├── config.py                  # Environment variables
│   │   ├── database.py                # SQLAlchemy engine
│   │   ├── api_key_pool.py           # TomTom key rotation
│   │   └── logger.py                  # Logging setup
│   │
│   ├── domain/
│   │   ├── math/
│   │   │   ├── __init__.py           # calculate_traffic_index, calculate_los_level, ...
│   │   │   └── constants.py          # BPR_ALPHA, BPR_BETA, LOS_THRESHOLDS
│   │   ├── geo/
│   │   │   ├── __init__.py           # Spatial functions
│   │   │   └── constants.py          # BBOX_HCM, BBOX_TARGET_DISTRICT
│   │   └── weather/
│   │       └── mapping.py            # OWM → Severity mapping
│   │
│   ├── schemas/
│   │   └── tomtom_schema.py          # Pydantic models for API responses
│   │
│   └── utils/
│       └── math_calc.py              # PCU calculation, key generation
│
├── scheduler/
│   ├── app.py                        # APScheduler entrypoint
│   └── Dockerfile
│
└── tests/
    └── ...
```

### 6.3 Base Classes (Template Pattern)

```python
class BaseExtractor(ABC):
    """Abstraction for API data extraction"""
    
    def __init__(self, api_key: str = "", **kwargs):
        self.api_key = api_key
        self.session = requests.Session()
        self.logger = get_logger(self.__class__.__name__)
    
    @retry(stop=stop_after_attempt(3), wait=wait_fixed(2))
    def _get(self, url: str, params: dict) -> dict:
        """HTTP GET with automatic retry on transient failures"""
        response = self.session.get(url, params=params, timeout=10)
        response.raise_for_status()
        return response.json()
    
    @abstractmethod
    def extract(self, **kwargs) -> dict | list[dict]:
        """Override to implement specific API extraction logic"""
        pass

class BaseTransformer(ABC):
    """Pure transformation (no I/O, deterministic)"""
    
    def __init__(self):
        self.logger = get_logger(self.__class__.__name__)
    
    @abstractmethod
    def transform(self, raw_data: list[dict]) -> list[dict]:
        """Override to implement business logic transformations"""
        pass

class BaseLoader(ABC):
    """UPSERT-based data loading with idempotency"""
    
    TABLE_NAME: str
    CONFLICT_KEYS: list[str]        # Unique constraint columns
    UPDATE_COLUMNS: list[str]       # Columns to update on conflict
    BATCH_SIZE: int = 200
    
    def _upsert_batch(self, records: list[dict]) -> int:
        """Generic UPSERT using INSERT ... ON CONFLICT DO UPDATE"""
        # Implementation: Generate dynamic SQL for given table
```

### 6.4 Realtime Pipeline Execution

```python
@app.command("run-realtime")
def run_realtime(
    budget_mode: bool = typer.Option(False),
    segment_limit: int = typer.Option(None)
) -> None:
    """Execute one realtime ETL cycle"""
    
    engine = get_engine()
    
    # 1. Weather Extraction & Loading
    weather_extractor = WeatherExtractor(api_key=OWM_API_KEY)
    weather_data = weather_extractor.extract(grid_mode=True)  # 500m cells
    
    weather_transformer = WeatherTransformer()
    weather_records = weather_transformer.transform(weather_data)
    
    weather_loader = WeatherLoader(engine)
    weather_count = weather_loader.load(weather_records)
    
    # 2. Compute Segment Budget (if budget_mode)
    if budget_mode:
        safe_limit = compute_safe_segment_limit()
    else:
        safe_limit = segment_limit or 1000
    
    # 3. Traffic Extraction with Budget
    traffic_extractor = TrafficExtractor(
        key_pool=get_key_pool(),
        max_workers=8
    )
    
    segments = load_segments_by_target_corridors(limit=safe_limit)
    traffic_data = traffic_extractor.extract(points=segments)
    
    # 4. Traffic Transformation
    traffic_transformer = TrafficTransformer()
    traffic_records = traffic_transformer.transform(traffic_data)
    
    traffic_loader = TrafficLoader(engine)
    traffic_count = traffic_loader.load(traffic_records)
    
    # 5. Incident Extraction & Loading
    incident_extractor = IncidentExtractor(api_key=TOMTOM_API_KEY)
    incident_data = incident_extractor.extract(bbox=BBOX_HCM)
    
    incident_transformer = IncidentTransformer()
    incident_records = incident_transformer.transform(incident_data)
    
    incident_loader = IncidentLoader(engine)
    incident_count = incident_loader.load(incident_records)
    
    # 6. Report
    logger.info(f"Realtime cycle complete: weather={weather_count}, "
                f"traffic={traffic_count}, incidents={incident_count}")
```

### 6.5 Batch Pipeline Execution

```python
@app.command("run-batch")
def run_batch() -> None:
    """Execute batch analytics (after realtime succeeds)"""
    
    engine = get_engine()
    
    # 1. Baseline Speed (ALL segments, historical aggregation)
    baseline_transformer = BaselineTransformer(engine)
    baseline_records = baseline_transformer.transform()
    
    baseline_loader = BaselineLoader(engine)
    baseline_count = baseline_loader.load(baseline_records)
    
    # 2. Corridor Performance (Q1 only, near-realtime aggregation)
    corridor_transformer = CorridorTransformer(engine)
    corridor_records = corridor_transformer.transform(
        bbox=BBOX_TARGET_DISTRICT
    )
    
    corridor_loader = CorridorPerformanceLoader(engine)
    corridor_count = corridor_loader.load(corridor_records)
    
    logger.info(f"Batch complete: baseline={baseline_count}, "
                f"corridor_perf={corridor_count}")
```

### 6.6 Key Design Patterns

| Pattern | Implementation | Benefit |
|---------|----------------| --------|
| **Template Method** | BaseExtractor, BaseTransformer, BaseLoader | Consistent ETL structure |
| **Retry Policy** | `tenacity` library with exponential backoff | Resilience to transient errors |
| **UPSERT Idempotency** | `INSERT ON CONFLICT DO UPDATE` | Safe re-execution |
| **Key Pool Rotation** | TomTomKeyPool.get_next_key() | Budget amplification |
| **Pure Functions** | Transformer = no I/O, only calculations | Testable, reproducible |
| **Batch Processing** | Load in batches of 200 | Memory efficient |
| **Partitioned Loading** | Date-based partitions | Fast purge, query optimization |

---

## 7. Processing Components & Relationships

### 7.1 Component Interaction Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                   FRONTEND (React/Vite)                         │
│  ┌─────────────────┬──────────────────┬─────────────────┐      │
│  │ RealTimePage    │ AnalyticsPage    │ SimulationPage  │      │
│  │ • Interactive   │ • Dashboards     │ • Forecasts     │      │
│  │   Mapbox GL     │ • Charts         │ • Route Opt.    │      │
│  │ • Weather info  │ • Statistics     │ • Predictions   │      │
│  └────────┬────────┴────────┬─────────┴────────┬────────┘      │
│           │                 │                  │                 │
│           └─────────────────┼──────────────────┘                │
│                             │ HTTP REST                         │
│                             ↓                                   │
├─────────────────────────────────────────────────────────────────┤
│                  BACKEND API (Express.js)                       │
│  ┌──────────────────┬────────────────┬──────────────────┐      │
│  │ Map Module       │ Analytics      │ Simulation       │      │
│  │ /api/v1/map      │ /api/v1/       │ /api/v1/         │      │
│  │                  │ analytics      │ simulation       │      │
│  │ • GET /segments  │ • speed-comp   │ • forecast       │      │
│  │ • GET /status    │ • reliability  │ • routing        │      │
│  │ • GET /status/:id│ • vehicle-mix  │                  │      │
│  └────────┬─────────┴────────┬───────┴────────┬────────┘      │
│           │                  │                │                 │
│           └──────────────────┼────────────────┘                │
│                              │ SQL Queries via Prisma          │
│                              ↓                                  │
├─────────────────────────────────────────────────────────────────┤
│            PostgreSQL DATA WAREHOUSE (PostGIS)                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Fact Tables:              Dimensions:                   │  │
│  │  • fact_traffic_flow       • dim_segment                 │  │
│  │  • fact_incident           • dim_corridor                │  │
│  │  • fact_corridor_perf      • dim_time_of_day             │  │
│  │  • fact_baseline_speed     • dim_weather                 │  │
│  │                            • dim_location                │  │
│  │                            • bridge_* (N-N)              │  │
│  └──────────────┬───────────────────────────────────────────┘  │
│                 │                                                │
│                 ↑ (SQL INSERT/UPDATE/SELECT)                    │
│                 │                                                │
├─────────────────────────────────────────────────────────────────┤
│               DATA PIPELINE (Python ETL)                        │
│  ┌──────────────┬──────────────┬──────────────┐               │
│  │ Weather      │ Traffic      │ Incident     │               │
│  │ Pipeline     │ Pipeline     │ Pipeline     │               │
│  │              │              │              │               │
│  │ Extract (OWM)│ Extract      │ Extract      │               │
│  │     ↓        │ (TomTom)     │ (TomTom)     │               │
│  │ Transform    │     ↓        │     ↓        │               │
│  │ (Severity)   │ Transform    │ Transform    │               │
│  │     ↓        │ (TI, LOS)    │ (Severity)   │               │
│  │ Load         │     ↓        │     ↓        │               │
│  │ (dim_weather)│ Load         │ Load         │               │
│  │              │ (fact_traffic│ (fact_       │               │
│  │              │  _flow)      │ incident)    │               │
│  └──────────────┴──────────────┴──────────────┘               │
│         ↓                                                       │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Batch Analytics (After realtime succeeds)               │ │
│  │  ├─ Baseline Speed Pipeline                              │ │
│  │  │  (Aggregate historical statistics)                    │ │
│  │  │  Loads: fact_baseline_speed                           │ │
│  │  │                                                        │ │
│  │  └─ Corridor Performance Pipeline                        │ │
│  │     (Aggregate metrics per corridor)                     │ │
│  │     Loads: fact_corridor_performance                     │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  Run Schedule:                                                 │
│  • Every 15 min: realtime → batch (chained)                   │
│  • Daily 05:50: health-tomtom-keys (budget check)             │
│  ├─ Extract: TomTom, OpenWeatherMap, OSM                      │
│  ├─ Transform: Calculate metrics, validate schemas            │
│  └─ Load: UPSERT with idempotency                             │
└─────────────────────────────────────────────────────────────────┘
         │                          │
         │ (Containers)             │
         ↓                          ↓
    ┌─────────────┐           ┌──────────────┐
    │data-pipeline│           │etl-scheduler │
    │container    │           │container     │
    └─────────────┘           └──────────────┘
    (Exec CLI)                (APScheduler)
```

### 7.2 Component Responsibilities

| Component | Language | Responsibility |
|-----------|----------|---|
| **Frontend Pages** | React/TS | Render UI, user interactions, real-time updates |
| **Backend API** | Express/TS | REST endpoints, data validation, query orchestration |
| **Prisma ORM** | TypeScript | Type-safe DB queries, auto-generated client |
| **Data Pipeline** | Python | ETL logic, data transformation, quality checks |
| **ETL Scheduler** | Python | Schedule jobs, retry logic, error reporting |
| **PostgreSQL** | SQL | Data persistence, ACID transactions, spatial queries |
| **PostGIS** | Extension | Geometric calculations, spatial indexing |
| **Redis** | Optional | Caching, session management (not currently used) |

### 7.3 Data Flow Example: "Real-time Traffic Update"

**User Action:** Opens real-time map page

```
1. [FRONTEND] Component mounts → GET /api/v1/map/segments
   ↓
2. [BACKEND] analyticsController.getSegments()
   ├─ Query: SELECT * FROM fact_traffic_flow f
   │         JOIN dim_segment s ON f.segment_key = s.segment_key
   │         ORDER BY f.timestamp DESC LIMIT 500
   ├─ Transform: snake_case → camelCase
   └─ Return: JSON array of segments with traffic_index, los_level
   ↓
3. [FRONTEND] Render colored segments on Mapbox GL
   └─ Color: traffic_index → LOS A-F → Green/Red
   ↓
4. [USER] Hovers over segment
   ├─ GET /api/v1/map/status/:segment_id
   └─ Display: current_speed, free_flow_speed, delay, incidents nearby
```

**Behind Scenes (Data Population):**

```
(Every 15 minutes)
1. [SCHEDULER] Trigger run-realtime
   ↓
2. [TRAFFIC_PIPELINE] Extract
   ├─ Load Q1 segments: SELECT * FROM dim_segment WHERE ... LIMIT 180
   ├─ For each segment: GET /tomtom/.../flowSegmentData
   │                    ?point=lat,lon&key=<from_pool>
   └─ Return: current_speed, free_flow_speed, travel_time
   ↓
3. [TRAFFIC_PIPELINE] Transform
   ├─ traffic_index = 1.0 - (25/60) = 0.583
   ├─ los = calculate_los_level(0.583) = 'D'
   ├─ congestion = calculate_congestion_level('D') = 3
   ├─ delay = 120 - 60 = 60 seconds
   └─ pcu = estimate_pcu_from_speed(25, lane_count=2)
   ↓
4. [TRAFFIC_PIPELINE] Load
   └─ INSERT fact_traffic_flow (...) 
      ON CONFLICT (traffic_flow_key, date_key)
      DO UPDATE SET traffic_index=EXCLUDED.traffic_index, ...
   ↓
5. [BACKEND] Subsequent queries read latest fact_traffic_flow
   ↓
6. [FRONTEND] Auto-refresh map every 30s or on user request
```

### 7.4 Error Handling & Resilience

```python
# 1. Extractor Level: Retry on transient errors
@retry(
    stop=stop_after_attempt(3),
    wait=wait_fixed(2),
    retry=retry_if_exception_type((requests.ConnectionError, requests.Timeout))
)
def _get(self, url, params):
    # Only retries on network errors, not on 403/401

# 2. API Key Pool Level: Graceful degradation
def extract(self, points):
    for idx, point in enumerate(points):
        key = pool.get_next_key()
        if key is None:
            logger.warning(f"All keys exhausted, skipping point {idx}")
            continue
        
        try:
            data = self._get(url, params={'key': key, 'point': point})
            pool.record_success(key)
        except DataExtractionError as e:
            if "403" in str(e):
                pool.mark_blocked(key)
                # Retry same point with next key
            else:
                logger.warning(f"Skip point {idx}: {e}")

# 3. Transformer Level: Data validation
try:
    record = TomTomFlowResponse.model_validate(api_response)
    # Validated data guaranteed to be in schema
except ValidationError as e:
    logger.error(f"Schema validation failed: {e}")
    continue  # Skip invalid record

# 4. Loader Level: Transaction rollback
try:
    session.begin_nested()  # Savepoint
    session.execute(insert_stmt)
    session.commit()
except SQLAlchemy Exception as e:
    session.rollback()
    logger.error(f"Load failed for batch: {e}")
```

---

## 8. System Stack & Technologies

### 8.1 Technology Selection

| Layer | Component | Version | Rationale |
|-------|-----------|---------|-----------|
| **Frontend** | React | 18.2 | Modern, component-based, large ecosystem |
| | Vite | 5.0 | Fast build, HMR, optimized bundling |
| | TypeScript | 5.3 | Type safety, better IDE support |
| | Mapbox GL | 2.15 | Professional map library, PostGIS compatible |
| | Chart.js | 4.4 | Lightweight charting, good for real-time |
| | Ant Design | 5.11 | Comprehensive UI component library |
| | Zustand | 4.4 | Minimal state management (prefer Context) |
| **Backend** | Express.js | Latest | Lightweight, flexible routing, good middleware |
| | TypeScript | 5.3 | Type safety, better errors |
| | Prisma ORM | Latest | Type-safe, auto-generated client, migrations |
| **Data Pipeline** | Python | 3.10+ | Rich data libraries, fast development |
| | SQLAlchemy | 2.0 | ORM, UPSERT support, connection pooling |
| | Pandas | 2.x | Data manipulation, time-series handling |
| | Psycopg2 | 2.9+ | PostgreSQL driver, raw SQL execution |
| | Tenacity | 8.x | Retry logic, exponential backoff |
| | Pydantic | 2.x | Schema validation, type hints |
| | OSMnx | 1.x | OpenStreetMap network extraction |
| **Database** | PostgreSQL | 15+ | ACID, PostGIS, partitioning |
| | PostGIS | 3.3+ | Spatial queries, geometry types |
| | pgRouting | 3.5+ | Routing algorithms (optional) |
| **Infrastructure** | Docker | Latest | Containerization, reproducibility |
| | Docker Compose | 2.0+ | Local orchestration |
| | Azure PostgreSQL | Flexible Server | Managed DB (production) |
| **Scheduling** | APScheduler | 3.10+ | Background job scheduling |
| | Cron (Linux) | Native | System-level scheduling (production) |

### 8.2 Deployment Architecture

**Local Development:**
```
docker-compose up -d
├── postgres:15 (with PostGIS, pgRouting)
├── data-pipeline:latest (Python ETL)
├── etl-scheduler:latest (APScheduler)
├── ai-core:latest (FastAPI for ML)
├── backend:latest (Express API)
└── frontend:latest (React dev server)
```

**Production (Proposed):**
```
Azure Cloud
├── Azure Database for PostgreSQL (Managed)
│   └── PostGIS extension enabled
│
├── Container Registry (ACR)
│   └── Push: data-pipeline:1.0, etl-scheduler:1.0, backend:1.0, frontend:1.0
│
├── AKS (Kubernetes)
│   ├── Namespace: traffic-ioc
│   ├── StatefulSet: data-pipeline (for ETL)
│   ├── Deployment: backend (REST API)
│   ├── Deployment: frontend (React SPA)
│   └── CronJob: etl-scheduler (APScheduler)
│
└── Azure Key Vault
    └── Store: TOMTOM_API_KEYS, OWM_API_KEY, DB_PASSWORD
```

### 8.3 Performance Characteristics

| Component | Typical Performance | Bottleneck |
|-----------|-------------------|-----------|
| Weather extraction | ~220 calls × 0.9s throttle = 3-4 min | OWM API rate limiting |
| Traffic extraction | ~180 segments × 0.5s = 90s (parallel) | TomTom per-key quota |
| Incident extraction | ~10-50 incidents, 2-3 sec | Network latency |
| Traffic transformation | ~180 records × 1ms = 0.18s | CPU (minimal) |
| Data loading (UPSERT) | ~180 traffic + ~10 incident = 50-100ms | DB I/O |
| **Total realtime cycle** | ~5-10 minutes | API extraction |
| Batch baseline calc | ~5-10 min | Complex SQL aggregation |
| Batch corridor calc | ~2-3 min | Complex SQL aggregation |
| **Total batch** | ~10-15 minutes | SQL aggregation |

### 8.4 Scalability Considerations

**Horizontal Scaling (for more coverage):**
- Increase TomTom API keys (linear budget increase)
- Increase segment count in realtime cycle
- Use multi-threading for API extraction (`max_workers=8-16`)

**Vertical Scaling (for faster processing):**
- Increase PostgreSQL server resources (RAM, CPU)
- Add connection pooling (PgBouncer)
- Create materialized views for slow queries
- Add Redis cache layer for frequently accessed segments

**Data Retention:**
- Partition by date; DROP old partitions
- Recommended retention: 90 days of fine-grained, 1 year aggregated
- Archive to Azure Blob Storage if needed for compliance

---

## Summary: Key Takeaways

### ✅ System Strengths

1. **Modular Architecture**: Clear separation between extraction, transformation, loading
2. **Idempotent Operations**: Safe re-execution via UPSERT; handles failures gracefully
3. **API Key Optimization**: TomTom pool multiplies budget without added cost
4. **Robust Metrics**: LOS/Congestion calculation follows HCM 2010 standards
5. **PostGIS Integration**: Spatial queries for segment-to-incident mapping
6. **Dashboard Insights**: Real-time + batch analytics for decision makers

### ⚡ Critical Flows

1. **Real-Time:** Extract → Transform → Load (every 15 min)
2. **Batch:** Aggregate statistics (nightly, after realtime)
3. **API Key Health:** Daily budget check (05:50) ensures resilience
4. **Weather Grid:** 500m cells reduce OWM calls vs. per-segment approach
5. **Congestion Classification:** Traffic Index → LOS A-F → UI colors

### 🔧 Operational Responsibilities

- **Data Engineer:** Monitor ETL scheduler, API key health, data quality
- **Backend Engineer:** REST API performance, query optimization
- **Frontend Engineer:** Dashboard UX, real-time map updates
- **DevOps:** Infrastructure, monitoring, alerting, scaling

---

**End of Technical Overview**
