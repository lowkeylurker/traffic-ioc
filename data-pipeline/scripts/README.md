# Data Pipeline Scripts

Utility and analysis scripts for the Traffic IoC Data Pipeline.

## 📋 Analysis Scripts

### Q1 Analysis
- **get_q1_stats.py**
  - Generate statistics for Q1 corridor data
  - Query and analyze Q1-specific metrics
  - Output formatted reports

- **query_q1_etl.py**
  - ETL query execution and validation for Q1 data
  - Direct database queries for Q1 analysis
  - Results export and formatting

### Corridor Coverage Analysis
- **analyze_corridor_coverage.py**
  - Comprehensive corridor coverage metrics
  - Coverage gap analysis
  - Density and distribution analysis

- **show_q1_etl_corridors.py**
  - Display Q1 ETL corridor results
  - Format and present corridor data
  - Visual representation

### Coverage Reporting
- **quick_check.py**
  - Quick coverage validation checks
  - Rapid health check of data quality
  - Early warning for anomalies

- **show_all_coverage.py**
  - Complete coverage overview
  - All corridors and segments
  - Comprehensive dashboard

- **test_coverage_filter.py**
  - Filter and test coverage metrics
  - Coverage-based data validation
  - Quality assurance

## 🔧 Maintenance
- **maintenance/** - Maintenance and internal scripts

## Usage

Run scripts from the data-pipeline root:

```bash
# From docker
docker-compose exec data-pipeline python scripts/get_q1_stats.py

# From local environment
python scripts/query_q1_etl.py
```

## Environment

All scripts use PostgreSQL connection from environment:
```
DB_CONNECTION_STRING=postgresql://traffic_admin:traffic_pass@postgres:5432/traffic_ioc
```

---

**Last Updated:** 2026-03-09
