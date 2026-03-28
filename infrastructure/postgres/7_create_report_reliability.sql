-- ==============================================================================
-- FILE: 7_create_report_reliability.sql
-- DESCRIPTION: Tạo bảng mart report_reliability ở cấp corridor
-- ==============================================================================

CREATE TABLE IF NOT EXISTS report_reliability (
    report_key BIGSERIAL PRIMARY KEY,
    corridor_key BIGINT NOT NULL REFERENCES dim_corridor (corridor_key),
    time_window VARCHAR(20) NOT NULL,
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    t_avg DECIMAL(12, 4),
    t_95 DECIMAL(12, 4),
    t_freeflow DECIMAL(12, 4),
    buffer_index DECIMAL(12, 6),
    pti DECIMAL(12, 6),
    cause_accident_count INT NOT NULL DEFAULT 0,
    cause_flood_count INT NOT NULL DEFAULT 0,
    cause_construction_count INT NOT NULL DEFAULT 0,
    source_period VARCHAR(20) NOT NULL,
    job_run_id VARCHAR(120),
    computed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    quality_flag SMALLINT DEFAULT 1,
    CONSTRAINT uq_report_reliability_corridor_window_period UNIQUE (
        corridor_key,
        time_window,
        period_start,
        period_end
    )
);

CREATE INDEX IF NOT EXISTS idx_report_reliability_corridor_period ON report_reliability (
    corridor_key,
    period_start,
    period_end
);

CREATE INDEX IF NOT EXISTS idx_report_reliability_window_period ON report_reliability (
    time_window,
    period_start,
    period_end
);

CREATE INDEX IF NOT EXISTS idx_report_reliability_window_buffer ON report_reliability (
    time_window,
    period_start,
    period_end,
    buffer_index DESC
);

CREATE INDEX IF NOT EXISTS idx_report_reliability_window_pti ON report_reliability (
    time_window,
    period_start,
    period_end,
    pti DESC
);