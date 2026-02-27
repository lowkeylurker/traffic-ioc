"""
OpenWeather API Extractor - Lấy dữ liệu thời tiết
"""

import os
import requests
from typing import Dict, Optional


class WeatherExtractor:
    """Lấy dữ liệu thời tiết từ OpenWeather API"""

    BASE_URL = "https://api.openweathermap.org/data/2.5/weather"

    def __init__(self):
        self.api_key = os.getenv('OPENWEATHER_API_KEY')
        if not self.api_key:
            raise ValueError("OPENWEATHER_API_KEY must be set in .env file")

    def fetch_current_weather(self, latitude: float, longitude: float) -> Optional[Dict]:
        """
        Lấy dữ liệu thời tiết hiện tại

        Args:
            latitude: Tọa độ vĩ độ
            longitude: Tọa độ kinh độ

        Returns:
            Dict chứa dữ liệu thời tiết hoặc None nếu có lỗi
        """
        params = {
            'lat': latitude,
            'lon': longitude,
            'appid': self.api_key,
            'units': 'metric'
        }

        try:
            response = requests.get(self.BASE_URL, params=params, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error fetching weather data: {e}")
            return None

    def extract_weather_metrics(self, data: Dict) -> Optional[Dict]:
        """
        Trích xuất các metric thời tiết chính

        Args:
            data: Response từ OpenWeather API

        Returns:
            Dict chứa các metric thời tiết
        """
        try:
            main = data.get('main', {})
            weather = data.get('weather', [{}])[0]
            rain = data.get('rain', {})

            return {
                'temperature': main.get('temp'),
                'humidity': main.get('humidity'),
                'pressure': main.get('pressure'),
                'weather_condition': weather.get('main'),  # 'Clear', 'Rain', etc.
                'rainfall_mm': rain.get('1h', 0),  # Mưa trong 1 giờ qua
                'wind_speed': data.get('wind', {}).get('speed'),
                'visibility': data.get('visibility'),
                'cloudiness': data.get('clouds', {}).get('all')
            }
        except Exception as e:
            print(f"Error extracting weather metrics: {e}")
            return None


if __name__ == '__main__':
    # Test extractor
    extractor = WeatherExtractor()
    # Sài Gòn: 10.7769, 106.7009
    data = extractor.fetch_current_weather(10.7769, 106.7009)
    if data:
        metrics = extractor.extract_weather_metrics(data)
        print("Weather Metrics:", metrics)
