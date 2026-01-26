"""
Tính toán mức độ tắc nghẽn (Level of Service - LOS)
"""

from typing import Tuple, Dict


class LOSCalculator:
    """Tính toán LOS (A-F) dựa trên tốc độ và density"""
    
    # LOS thresholds (tốc độ km/h)
    LOS_THRESHOLDS = {
        'A': 55,
        'B': 45,
        'C': 35,
        'D': 25,
        'E': 15,
        'F': 0
    }
    
    @staticmethod
    def calculate_los(current_speed: float, free_flow_speed: float) -> Tuple[str, int]:
        """
        Tính LOS dựa trên tỷ lệ tốc độ hiện tại so với tốc độ tự do
        
        Args:
            current_speed: Tốc độ hiện tại (km/h)
            free_flow_speed: Tốc độ tự do (km/h)
        
        Returns:
            Tuple (los_grade: str, los_score: int 0-100)
        """
        if free_flow_speed <= 0:
            return 'F', 0
        
        speed_ratio = current_speed / free_flow_speed
        
        # LOS score: 100 (A) -> 0 (F)
        los_score = int(speed_ratio * 100)
        los_score = max(0, min(100, los_score))  # Clamp 0-100
        
        # Xác định grade
        if speed_ratio >= 0.91:
            los_grade = 'A'
        elif speed_ratio >= 0.76:
            los_grade = 'B'
        elif speed_ratio >= 0.55:
            los_grade = 'C'
        elif speed_ratio >= 0.40:
            los_grade = 'D'
        elif speed_ratio >= 0.20:
            los_grade = 'E'
        else:
            los_grade = 'F'
        
        return los_grade, los_score
    
    @staticmethod
    def calculate_los_by_speed(current_speed: float) -> str:
        """
        Tính LOS dựa trên tốc độ tuyệt đối
        
        Args:
            current_speed: Tốc độ hiện tại (km/h)
        
        Returns:
            LOS grade (A-F)
        """
        for grade, threshold in sorted(
            LOSCalculator.LOS_THRESHOLDS.items(), 
            key=lambda x: x[1], 
            reverse=True
        ):
            if current_speed >= threshold:
                return grade
        return 'F'


class PCUCalculator:
    """
    Tính toán PCU (Passenger Car Unit) - đơn vị quy đổi xe chuẩn
    Quy đổi các loại xe khác nhau sang đơn vị xe con
    """
    
    # PCU conversion factors theo loại xe
    # Tham khảo: HCM Transport Development Strategy
    PCU_FACTORS = {
        'motorcycle': 0.5,
        'car': 1.0,
        'bus': 2.5,
        'truck_2_axle': 2.0,
        'truck_3_plus_axle': 3.0,
        'van': 1.5
    }
    
    @staticmethod
    def calculate_pcu(vehicle_counts: Dict[str, int]) -> float:
        """
        Tính PCU tổng từ danh sách số lượng xe theo loại
        
        Args:
            vehicle_counts: Dict {loại xe: số lượng}
                           vd: {'car': 50, 'motorcycle': 100, 'bus': 5}
        
        Returns:
            Tổng PCU
        """
        total_pcu = 0.0
        for vehicle_type, count in vehicle_counts.items():
            factor = PCUCalculator.PCU_FACTORS.get(vehicle_type, 1.0)
            total_pcu += count * factor
        
        return total_pcu
    
    @staticmethod
    def estimate_pcu_from_total_vehicles(total_vehicles: int) -> float:
        """
        Ước tính PCU từ tổng số xe (khi không biết chi tiết từng loại)
        Giả định: 60% xe máy, 35% ô tô, 5% xe buýt
        
        Args:
            total_vehicles: Tổng số xe
        
        Returns:
            Ước tính PCU
        """
        estimated_counts = {
            'motorcycle': int(total_vehicles * 0.6),
            'car': int(total_vehicles * 0.35),
            'bus': int(total_vehicles * 0.05)
        }
        return PCUCalculator.calculate_pcu(estimated_counts)


if __name__ == '__main__':
    # Test LOS calculation
    los_calc = LOSCalculator()
    grade, score = los_calc.calculate_los(current_speed=30, free_flow_speed=50)
    print(f"LOS: {grade} (Score: {score})")
    
    # Test PCU calculation
    pcu_calc = PCUCalculator()
    vehicles = {'motorcycle': 100, 'car': 50, 'bus': 10}
    pcu = pcu_calc.calculate_pcu(vehicles)
    print(f"PCU: {pcu:.2f}")
