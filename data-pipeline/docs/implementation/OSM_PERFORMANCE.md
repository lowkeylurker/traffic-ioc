# OSM Pipeline Performance Guide

## 📊 Tại sao OSM pipeline chạy lâu?

### **BBOX_HCM vs BBOX_DISTRICT_1**

| Bbox Type | Coverage | Size | Roads | Download Time | Use Case |
|-----------|----------|------|-------|---------------|----------|
| **BBOX_HCM** | Toàn bộ TP.HCM (24 quận) | 70km × 61km (4,270 km²) | ~50,000+ segments | **2-3 phút** | Production |
| **BBOX_DISTRICT_1** | Quận 1 only | 6km × 6km (36 km²) | ~2,000 segments | **20-30 giây** | Testing/MVP |

### Nguyên nhân chậm:

1. **Network I/O**: Download từ Overpass API qua internet
   - Data size: 10-50 MB XML/JSON cho full HCM
   - Bandwidth limited by OpenStreetMap servers

2. **Data parsing**: Convert OSM XML → NetworkX graph → GeoDataFrame
   - CPU intensive
   - Memory: ~500MB-1GB for full HCM

3. **Geometry transformation**: Nodes + Edges → WKT format for PostGIS
   - Parse coordinates
   - Generate LineString geometry

## ⚡ Tối ưu đã thực hiện

### 1. **OSMnx Cache** ✅
```python
ox.settings.use_cache = True
```
- Cache local trong `~/.cache/osmnx/`
- **Chỉ download 1 lần**, các lần sau dùng cache
- **Tốc độ tăng 10-20x** (từ 2 phút → 10 giây)

### 2. **Fast mode: District 1 only** ✅
```bash
# Instead of full HCM:
docker-compose exec data-pipeline python -m src.main run-spatial

# Use District 1 only (FAST):
docker-compose exec data-pipeline python -m src.main run-osm-district1
```

## 🚀 Commands

### Test/Development (Khuyến nghị)
```bash
# Download OSM cho Quận 1 only (~30 giây, ~2000 segments)
docker-compose exec data-pipeline python -m src.main run-osm-district1
```

### Production (Full HCM)
```bash
# Download toàn bộ TP.HCM (~2 phút lần đầu, ~10 giây với cache)
docker-compose exec data-pipeline python -m src.main run-spatial
```

## 📈 Expected Performance

### Lần đầu tiên (no cache):
- **BBOX_HCM**: 2-3 phút
- **BBOX_DISTRICT_1**: 20-30 giây

### Lần sau (with cache):
- **BBOX_HCM**: 10-15 giây
- **BBOX_DISTRICT_1**: 2-3 giây

## 🔍 Monitoring

Pipeline hiện có progress tracking:
```
⠋ OSM road network... ━━━━━━━━━━━━━━━━━━━━━━━━━━━ 0:00:25
  Coverage area: ~77.7km × 61.0km
  Extracted 12,345 nodes, 8,901 edges
```

## 💡 Tips

1. **Chạy `run-osm-district1` cho testing/MVP** → nhanh, đủ dữ liệu
2. **Chỉ chạy `run-spatial` (full HCM) khi cần production data**
3. Cache được lưu trong container → persistent volume nếu cần
4. Delete cache: `rm -rf ~/.cache/osmnx/` nếu muốn re-download

## 🗺️ Bbox Coordinates

```python
# District 1 (Quận 1) - 36 km²
BBOX_DISTRICT_1 = {
    "min_lon": 106.663,
    "min_lat": 10.743,
    "max_lon": 106.723,
    "max_lat": 10.803,
}

# Full HCM City - 4,270 km²
BBOX_HCM = {
    "min_lon": 106.4,
    "min_lat": 10.4,
    "max_lon": 107.1,
    "max_lat": 10.95,
}
```

## ⚠️ Troubleshooting

### Nếu vẫn chậm sau khi có cache:
1. Check network: `ping overpass-api.de`
2. Check disk space: `df -h ~/.cache/osmnx/`
3. Check PostgreSQL connection: `docker-compose exec data-pipeline python -m src.main health`

### NetworkX timeout errors:
```python
# Increase timeout in osm_pipeline.py
ox.settings.timeout = 300  # 5 minutes instead of default 180s
```
