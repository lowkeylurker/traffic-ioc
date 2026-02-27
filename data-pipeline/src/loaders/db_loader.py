"""
Database Loader - Insert/Upsert dữ liệu vào PostgreSQL
"""

import pandas as pd
from sqlalchemy import text
from contextlib import contextmanager
from typing import Dict, List, Optional
from datetime import datetime


class DatabaseLoader:
    """Quản lý việc load dữ liệu vào Database"""

    def __init__(self, engine):
        """
        Args:
            engine: SQLAlchemy engine instance
        """
        self.engine = engine

    @contextmanager
    def get_connection(self):
        """Context manager để quản lý connection"""
        conn = self.engine.connect()
        try:
            yield conn
        finally:
            conn.close()

    def upsert_traffic_flow(self, df: pd.DataFrame) -> int:
        """
        Insert hoặc Update dữ liệu luồng giao thông

        Args:
            df: DataFrame chứa dữ liệu với columns:
                segment_id, time_key, date_key, sensor_id, vehicle_count,
                current_speed, avg_speed, max_speed, occupancy_rate,
                pcu_value, los_grade, los_score

        Returns:
            Số records đã insert/update
        """
        with self.get_connection() as conn:
            # Sử dụng INSERT ON CONFLICT để upsert
            insert_query = """
            INSERT INTO fact_traffic_flow
            (segment_id, time_key, date_key, sensor_id, vehicle_count,
             current_speed, avg_speed, max_speed, occupancy_rate,
             pcu_value, los_grade, los_score, data_quality_flag)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (segment_id, time_key, sensor_id)
            DO UPDATE SET
                vehicle_count = EXCLUDED.vehicle_count,
                current_speed = EXCLUDED.current_speed,
                avg_speed = EXCLUDED.avg_speed,
                max_speed = EXCLUDED.max_speed,
                occupancy_rate = EXCLUDED.occupancy_rate,
                pcu_value = EXCLUDED.pcu_value,
                los_grade = EXCLUDED.los_grade,
                los_score = EXCLUDED.los_score,
                data_quality_flag = EXCLUDED.data_quality_flag
            """

            # Chuyển DF sang tuples và insert
            records = [tuple(row) for row in df.values]

            cursor = conn.connection.cursor()
            cursor.executemany(insert_query, records)
            conn.connection.commit()

            return len(records)

    def insert_incident(self, incident_data: Dict) -> Optional[int]:
        """
        Insert một sự cố giao thông

        Args:
            incident_data: Dict chứa thông tin sự cố
                          (segment_id, date_key, time_start, time_end,
                           incident_type, severity, etc.)

        Returns:
            ID của incident đã insert, hoặc None nếu lỗi
        """
        with self.get_connection() as conn:
            insert_query = """
            INSERT INTO fact_incident
            (segment_id, date_key, time_start, incident_type, severity,
             description, affected_lanes, estimated_delay_minutes)
            VALUES (:segment_id, :date_key, :time_start, :incident_type,
                    :severity, :description, :affected_lanes, :estimated_delay_minutes)
            RETURNING incident_id
            """

            try:
                result = conn.execute(text(insert_query), incident_data)
                conn.connection.commit()
                return result.scalar()
            except Exception as e:
                print(f"Error inserting incident: {e}")
                return None

    def insert_forecast(self, forecast_data: Dict) -> Optional[int]:
        """
        Insert một dự báo giao thông

        Args:
            forecast_data: Dict chứa thông tin dự báo

        Returns:
            ID của forecast đã insert, hoặc None nếu lỗi
        """
        with self.get_connection() as conn:
            insert_query = """
            INSERT INTO fact_forecast
            (segment_id, forecast_time, forecast_horizon, predicted_speed,
             predicted_vehicle_count, predicted_los_grade, confidence_score, model_version)
            VALUES (:segment_id, :forecast_time, :forecast_horizon, :predicted_speed,
                    :predicted_vehicle_count, :predicted_los_grade, :confidence_score, :model_version)
            RETURNING forecast_id
            """

            try:
                result = conn.execute(text(insert_query), forecast_data)
                conn.connection.commit()
                return result.scalar()
            except Exception as e:
                print(f"Error inserting forecast: {e}")
                return None


if __name__ == '__main__':
    from config import db_config

    # Test loader
    engine = db_config.get_engine()
    loader = DatabaseLoader(engine)

    # Test connection
    try:
        with loader.get_connection() as conn:
            result = conn.execute(text("SELECT COUNT(*) FROM fact_traffic_flow"))
            count = result.scalar()
            print(f"Total traffic flow records: {count}")
    except Exception as e:
        print(f"Error: {e}")
