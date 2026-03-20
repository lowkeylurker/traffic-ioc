-- A2 Incident Monitoring Schema
-- Creates schema for fact_incidents table with PostGIS support

-- Create custom types for incidents
CREATE TYPE incident_type AS ENUM ('ACCIDENT', 'FLOOD', 'CONSTRUCTION', 'FIRE', 'OTHER');

CREATE TYPE incident_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TYPE incident_status AS ENUM ('OPEN', 'RESOLVED', 'PENDING');

-- Create fact_incidents table
CREATE TABLE fact_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    geom GEOMETRY (POINT, 4326) NOT NULL, -- Tọa độ WGS84
    type incident_type NOT NULL,
    severity incident_severity DEFAULT 'LOW',
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status incident_status DEFAULT 'OPEN',
    source VARCHAR(50) DEFAULT 'SENSOR', -- SENSOR, ADMIN, USER_REPORT
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index cho truy vấn không gian
CREATE INDEX idx_incidents_geom ON fact_incidents USING GIST (geom);
-- Index cho lọc trạng thái (thường xuyên query status='OPEN')
CREATE INDEX idx_incidents_status ON fact_incidents (status);
-- Index cho created_at để sắp xếp
CREATE INDEX idx_incidents_created_at ON fact_incidents (created_at DESC);

-- Seed sample data for testing
INSERT INTO fact_incidents (geom, type, severity, title, description, status) VALUES
  (ST_SetSRID(ST_MakePoint(106.701, 10.775), 4326), 'ACCIDENT', 'HIGH', 'Va chạm xe tải', 'Va chạm giữa 2 xe tải tại ngã tư Lê Lợi', 'OPEN'),
  (ST_SetSRID(ST_MakePoint(106.695, 10.782), 4326), 'FLOOD', 'MEDIUM', 'Ngập úng đường Pasteur', 'Mưa lớn gây ngập cục bộ', 'OPEN'),
  (ST_SetSRID(ST_MakePoint(106.705, 10.785), 4326), 'CONSTRUCTION', 'LOW', 'Sửa chữa đường', 'Thi công mở rộng đường', 'OPEN'),
  (ST_SetSRID(ST_MakePoint(106.699, 10.78), 4326), 'FIRE', 'CRITICAL', 'Cháy tại trung tâm thương mại', 'Cháy lớn đang được xử lý', 'OPEN');