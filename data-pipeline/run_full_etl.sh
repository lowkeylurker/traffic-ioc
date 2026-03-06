#!/usr/bin/env bash
# Full ETL Pipeline Runner
# Runs all dimension table ETL in proper dependency order

set -e

echo "🚀 Starting Full ETL Pipeline"
echo "=============================="

# Phase 1: Static dimensions (no dependencies)
echo ""
echo "📅 Phase 1: Static Dimensions"
python -m src.main run-static

# Phase 2: Spatial network (location → OSM → corridor)
echo ""
echo "🗺️  Phase 2: Spatial Network"
python -m src.main run-spatial

echo ""
echo "✅ Full ETL Complete!"
echo "=============================="
echo ""
echo "📊 Run 'python scripts/maintenance/check_coverage.py' to verify data coverage"
