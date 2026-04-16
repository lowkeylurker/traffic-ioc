-- Thêm bảng Users để lấy thông tin từ Clerk nếu cần thiết
CREATE TABLE IF NOT EXISTS dim_user (
  user_id VARCHAR(255) PRIMARY KEY,
  clerk_id VARCHAR(255) UNIQUE,
  reputation_score INT DEFAULT 0,
  trust_weight FLOAT DEFAULT 1.0,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
);

-- Tạo bảng Confirmations để lưu lịch sử xác nhận của User B cho Incident
CREATE TABLE IF NOT EXISTS incident_confirmations (
  id BIGSERIAL PRIMARY KEY,
  report_key BIGINT NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  is_true BOOLEAN NOT NULL,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_confirmation_report FOREIGN KEY (report_key) REFERENCES fact_citizen_report(report_key) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT fk_confirmation_user FOREIGN KEY (user_id) REFERENCES dim_user(user_id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT uq_incident_confirm_report_user UNIQUE (report_key, user_id)
);

CREATE INDEX idx_incident_confirm_report ON incident_confirmations(report_key);
CREATE INDEX idx_incident_confirm_user ON incident_confirmations(user_id);
