# 🌦️ Báo cáo Thời tiết (Free Tier 2.5) - UTRAFFIC

> **Lưu ý:** Đây là dữ liệu từ gói Free không cần thẻ tín dụng.

## 1. Thời tiết hiện tại (Current Weather)
```json
{
    "coord": {
        "lon": 106.7011,
        "lat": 10.7764
    },
    "weather": [
        {
            "id": 500,
            "main": "Rain",
            "description": "mưa nhẹ",
            "icon": "10d"
        }
    ],
    "base": "stations",
    "main": {
        "temp": 34.43,
        "feels_like": 41.26,
        "temp_min": 34.43,
        "temp_max": 34.95,
        "pressure": 1007,
        "humidity": 55,
        "sea_level": 1007,
        "grnd_level": 1006
    },
    "visibility": 10000,
    "wind": {
        "speed": 3.6,
        "deg": 0,
        "gust": 8.75
    },
    "rain": {
        "1h": 0.16
    },
    "clouds": {
        "all": 20
    },
    "dt": 1771401818,
    "sys": {
        "type": 2,
        "id": 2093009,
        "country": "VN",
        "sunrise": 1771369976,
        "sunset": 1771412501
    },
    "timezone": 25200,
    "id": 1566083,
    "name": "Thành phố Hồ Chí Minh",
    "cod": 200
}
```

---

## 2. Dự báo 5 ngày / 3 giờ (Forecast)
```json
{
    "cod": "200",
    "message": 0,
    "cnt": 40,
    "list": [
        {
            "dt": 1771405200,
            "main": {
                "temp": 34.43,
                "feels_like": 41.43,
                "temp_min": 32.22,
                "temp_max": 34.43,
                "pressure": 1007,
                "sea_level": 1007,
                "grnd_level": 1007,
                "humidity": 58,
                "temp_kf": 2.21
            },
            "weather": [
                {
                    "id": 801,
                    "main": "Clouds",
                    "description": "mây thưa",
                    "icon": "02d"
                }
            ],
            "clouds": {
                "all": 20
            },
            "wind": {
                "speed": 5.21,
                "deg": 149,
                "gust": 4.31
            },
            "visibility": 10000,
            "pop": 0,
            "sys": {
                "pod": "d"
            },
            "dt_txt": "2026-02-18 09:00:00"
        },
        {
            "dt": 1771416000,
            "main": {
                "temp": 32.48,
                "feels_like": 37.26,
                "temp_min": 28.58,
                "temp_max": 32.48,
                "pressure": 1008,
                "sea_level": 1008,
                "grnd_level": 1008,
                "humidity": 57,
                "temp_kf": 3.9
            },
            "weather": [
                {
                    "id": 802,
                    "main": "Clouds",
                    "description": "mây rải rác",
                    "icon": "03n"
                }
            ],
            "clouds": {
                "all": 35
            },
            "wind": {
                "speed": 5.77,
                "deg": 140,
                "gust": 10.67
            },
            "visibility": 10000,
            "pop": 0,
            "sys": {
                "pod": "n"
            },
            "dt_txt": "2026-02-18 12:00:00"
        },
        {
            "dt": 1771426800,
            "main": {
                "temp": 29.82,
                "feels_like": 32.49,
                "temp_min": 27.52,
                "temp_max": 29.82,
                "pressure": 1010,
                "sea_level": 1010,
                "grnd_level": 1011,
                "humidity": 60,
                "temp_kf": 2.3
            },
            "weather": [
                {
                    "id": 802,
                    "main": "Clouds",
                    "description": "mây rải rác",
                    "icon": "03n"
                }
            ],
            "clouds": {
                "all": 36
            },
            "wind": {
                "speed": 4.16,
                "deg": 111,
                "gust": 7.62
            },
            "visibility": 10000,
            "pop": 0,
            "sys": {
                "pod": "n"
            },
            "dt_txt": "2026-02-18 15:00:00"
        }
    ],
    "city": {
        "id": 1566083,
        "name": "Thành phố Hồ Chí Minh",
        "coord": {
            "lat": 10.776,
            "lon": 106.7
        },
        "country": "VN",
        "population": 1000000,
        "timezone": 25200,
        "sunrise": 1771369977,
        "sunset": 1771412501
    }
}
```

---

