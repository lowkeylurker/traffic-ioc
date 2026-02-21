"""
Main ETL Pipeline - Entry point
Orchestrate Extract → Transform → Load workflow
"""

import logging
import sys
from datetime import datetime
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

from config import db_config
from extractors.tomtom_api import TomTomExtractor
from extractors.weather_api import WeatherExtractor
from transformers.calc_los import LOSCalculator, PCUCalculator
from loaders.db_loader import DatabaseLoader

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class TrafficETLPipeline:
    """Main ETL Pipeline cho dữ liệu giao thông"""

    def __init__(self):
        self.db_config = db_config
        self.engine = self.db_config.get_engine()
        self.loader = DatabaseLoader(self.engine)

        self.tomtom = TomTomExtractor()
        self.weather = WeatherExtractor()

        self.los_calc = LOSCalculator()
        self.pcu_calc = PCUCalculator()

    def extract(self):
        """Extract phase - Lấy dữ liệu từ các source bên ngoài"""
        logger.info("Starting EXTRACT phase...")

        try:
            # Extract traffic data từ TomTom
            logger.info("Fetching traffic data from TomTom...")
            # Ví dụ: Sài Gòn coordinates
            traffic_data = self.tomtom.fetch_traffic_flow("10.7769,106.7009")
            if traffic_data:
                metrics = self.tomtom.extract_traffic_metrics(traffic_data)
                logger.info(f"Traffic metrics: {metrics}")

            # Extract weather data từ OpenWeather
            logger.info("Fetching weather data...")
            weather_data = self.weather.fetch_current_weather(10.7769, 106.7009)
            if weather_data:
                weather_metrics = self.weather.extract_weather_metrics(weather_data)
                logger.info(f"Weather metrics: {weather_metrics}")

            logger.info("EXTRACT phase completed successfully")
            return True
        except Exception as e:
            logger.error(f"Error during EXTRACT phase: {e}")
            return False

    def transform(self):
        """Transform phase - Xử lý & tính toán dữ liệu"""
        logger.info("Starting TRANSFORM phase...")

        try:
            # Ví dụ tính toán LOS
            current_speed = 30  # km/h
            free_flow_speed = 50  # km/h

            los_grade, los_score = self.los_calc.calculate_los(current_speed, free_flow_speed)
            logger.info(f"LOS Grade: {los_grade}, Score: {los_score}")

            # Ví dụ tính toán PCU
            total_vehicles = 150
            pcu_value = self.pcu_calc.estimate_pcu_from_total_vehicles(total_vehicles)
            logger.info(f"Estimated PCU for {total_vehicles} vehicles: {pcu_value:.2f}")

            logger.info("TRANSFORM phase completed successfully")
            return True
        except Exception as e:
            logger.error(f"Error during TRANSFORM phase: {e}")
            return False

    def load(self):
        """Load phase - Đưa dữ liệu vào Database"""
        logger.info("Starting LOAD phase...")

        try:
            # Test database connection
            if self.db_config.test_connection():
                logger.info("Database connection successful")
                # TODO: Load prepared dataframes to database
                logger.info("LOAD phase completed successfully")
                return True
            else:
                logger.error("Database connection failed")
                return False
        except Exception as e:
            logger.error(f"Error during LOAD phase: {e}")
            return False

    def run(self):
        """Chạy toàn bộ ETL pipeline"""
        logger.info("=" * 50)
        logger.info("Starting Traffic ETL Pipeline")
        logger.info("=" * 50)

        start_time = datetime.now()

        # Execute phases
        extract_ok = self.extract()
        if not extract_ok:
            logger.error("Pipeline stopped at EXTRACT phase")
            return False

        transform_ok = self.transform()
        if not transform_ok:
            logger.error("Pipeline stopped at TRANSFORM phase")
            return False

        load_ok = self.load()
        if not load_ok:
            logger.error("Pipeline stopped at LOAD phase")
            return False

        # Success
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()

        logger.info("=" * 50)
        logger.info(f"ETL Pipeline completed successfully in {duration:.2f} seconds")
        logger.info("=" * 50)

        return True


if __name__ == '__main__':
    pipeline = TrafficETLPipeline()
    success = pipeline.run()
    sys.exit(0 if success else 1)
