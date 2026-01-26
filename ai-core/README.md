# AI Core Module - Traffic Prediction & Computer Vision

Đây là module AI để training models, dự báo giao thông, và xử lý ảnh từ camera giao thông.

## 📁 Cấu trúc

```
ai-core/
├── src/
│   ├── vehicle_counter.py       # YOLO vehicle detection
│   └── forecast_service.py      # Traffic forecast microservice
├── notebooks/
│   └── traffic_forecast_experiment.ipynb  # EDA & model training
├── models/                      # Trained models (excluded from git)
├── requirements.txt             # Python dependencies
└── README.md                    # This file
```

## 🚀 Cài đặt & Chạy

### Cài đặt packages

```bash
pip install -r requirements.txt
```

### Cấu hình môi trường

```
AI_SERVICE_PORT=5000
AI_MODEL_PATH=./models/
```

### Chạy services

```bash
# Start forecast microservice
python src/forecast_service.py

# Test vehicle counter
python src/vehicle_counter.py --image path/to/image.jpg
```

## 📊 Modules

### vehicle_counter.py
Sử dụng YOLOv8 để đếm xe từ ảnh/video:
- Vehicle detection
- Vehicle counting
- Class classification (motorcycle, car, bus, truck)

### forecast_service.py
FastAPI microservice cho dự báo giao thông:
- Traffic speed forecast
- Vehicle count prediction
- LOS grade prediction

## 📚 Notebooks

- `traffic_forecast_experiment.ipynb`: EDA, feature engineering, model training

## 📝 Quy tắc

- Sử dụng pre-trained models (YOLOv8, scikit-learn)
- Luôn có reproducibility: `requirements.txt` với phiên bản cụ thể
- AI code phải đóng gói thành Class/Function có I/O rõ ràng
- Models được lưu trong `/models/` (gitignored)

---

Last Updated: Jan 2026
