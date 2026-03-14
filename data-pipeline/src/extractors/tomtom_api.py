"""
TomTom API Extractor - Lấy dữ liệu giao thông từ TomTom API
"""

import os
import requests
from datetime import datetime
from typing import Dict, List, Optional


class TomTomExtractor:
    """Lấy dữ liệu giao thông từ TomTom API"""
    
    BASE_URL = "https://api.tomtom.com/traffic/services/4/flowSegmentData/relative"
    
    def __init__(self):
        self.api_key = os.getenv('TOMTOM_API_KEY')
        if not self.api_key:
            raise ValueError("TOMTOM_API_KEY must be set in .env file")
    
    def fetch_traffic_flow(self, coordinates: str, zoom: int = 12) -> Optional[Dict]:
        """
        Lấy dữ liệu luồng giao thông từ TomTom
        
        Args:
            coordinates: Tọa độ (vd: "10.7769,106.7009")
            zoom: Mức zoom (10-18)
        
        Returns:
            Dict chứa dữ liệu giao thông hoặc None nếu có lỗi
        """
        params = {
            'point': coordinates,
            'zoom': zoom,
            'key': self.api_key,
            'unit': 'KMPH'
        }
        
        try:
            response = requests.get(self.BASE_URL, params=params, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error fetching data from TomTom: {e}")
            return None
    
    def extract_traffic_metrics(self, data: Dict) -> Optional[Dict]:
        """
        Trích xuất các metric giao thông chính từ response
        
        Args:
            data: Response từ TomTom API
        
        Returns:
            Dict chứa các metric chính
        """
        try:
            flow_segment_data = data.get('flowSegmentData', {})
            return {
                'current_speed': flow_segment_data.get('currentSpeed'),
                'free_flow_speed': flow_segment_data.get('freeFlowSpeed'),
                'current_travel_time': flow_segment_data.get('currentTravelTime'),
                'free_flow_travel_time': flow_segment_data.get('freeFlowTravelTime'),
                'confidence': flow_segment_data.get('confidence'),
                'road_closure': flow_segment_data.get('roadClosure'),
                'timestamp': datetime.utcnow().isoformat()
            }
        except Exception as e:
            print(f"Error extracting metrics: {e}")
            return None


if __name__ == '__main__':
    # Test extractor
    extractor = TomTomExtractor()
    # Tọa độ Sài Gòn (10.7769, 106.7009)
    data = extractor.fetch_traffic_flow("10.7769,106.7009")
    if data:
        metrics = extractor.extract_traffic_metrics(data)
        print("Traffic Metrics:", metrics)
