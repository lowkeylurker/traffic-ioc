# 📊 BÁO CÁO THỬ NGHIỆM KẾT NỐI TOMTOM API - UTRAFFIC

- **Ngày thực hiện:** 2026-02-18 08:07:11
- **Mục tiêu:** Kiểm tra cấu trúc dữ liệu đầu vào cho Kho dữ liệu (DW) và Engine CityFlow.

---

## 1. Search & Geocoding
**Mô tả:** Chuyển địa chỉ từ báo cáo của người dân sang tọa độ thực để lưu vào `dim_node`.

### 📥 Dữ liệu phản hồi (JSON):
```json
{
    "summary": {
        "query": "phố đi bộ nguyễn huệ quận 1",
        "queryType": "NON_NEAR",
        "queryTime": 147,
        "numResults": 1,
        "offset": 0,
        "totalResults": 761,
        "fuzzyLevel": 2
    },
    "results": [
        {
            "type": "Street",
            "id": "pHeTJQRqQlaXh0mZTM1haA",
            "score": 9.3124275208,
            "matchConfidence": {
                "score": 0.44486475964415323
            },
            "address": {
                "streetName": "Ngách 451/1 Phố Nguyễn Văn Cừ",
                "municipalitySubdivision": "Long Biên",
                "municipality": "Bồ Đề",
                "countrySubdivision": "Hà Nội",
                "countrySubdivisionName": "Hà Nội",
                "countrySubdivisionCode": "HN",
                "postalCode": "11812",
                "countryCode": "VN",
                "country": "Việt Nam",
                "countryCodeISO3": "VNM",
                "freeformAddress": "Ngách 451/1 Phố Nguyễn Văn Cừ, Long Biên, Hà Nội, Hà Nội, 11812",
                "localName": "Hà Nội"
            },
            "position": {
                "lat": 21.0478143,
                "lon": 105.8793939
            },
            "viewport": {
                "topLeftPoint": {
                    "lat": 21.04788,
                    "lon": 105.87913
                },
                "btmRightPoint": {
                    "lat": 21.0477,
                    "lon": 105.87955
                }
            }
        }
    ]
}
```

---

## 2. Traffic Flow & Incidents
**Mô tả:** Lấy vận tốc thực tế (`currentSpeed`) để nạp vào bảng `fact_traffic_flow`.

### 📥 Dữ liệu phản hồi (JSON):
```json
{
    "flowSegmentData": {
        "frc": "FRC4",
        "currentSpeed": 16,
        "freeFlowSpeed": 25,
        "currentTravelTime": 494,
        "freeFlowTravelTime": 316,
        "confidence": 1,
        "roadClosure": false,
        "coordinates": {
            "coordinate": [
                {
                    "latitude": 10.770862269237494,
                    "longitude": 106.70249639235027
                },
                {
                    "latitude": 10.770909204369326,
                    "longitude": 106.70247627578266
                },
                {
                    "latitude": 10.770966926337183,
                    "longitude": 106.70245079479702
                },
                {
                    "latitude": 10.771059396741963,
                    "longitude": 106.7024105616618
                },
                {
                    "latitude": 10.771780961356413,
                    "longitude": 106.70209942541601
                },
                {
                    "latitude": 10.772271802165383,
                    "longitude": 106.70188753090378
                },
                {
                    "latitude": 10.772816246696575,
                    "longitude": 106.70166490755548
                },
                {
                    "latitude": 10.77324541189758,
                    "longitude": 106.70149056396946
                },
                {
                    "latitude": 10.774180153326684,
                    "longitude": 106.70108152709463
                },
                {
                    "latitude": 10.774284809273231,
                    "longitude": 106.70103861175039
                },
                {
                    "latitude": 10.774374643734964,
                    "longitude": 106.70100106082413
                },
                {
                    "latitude": 10.77449263891301,
                    "longitude": 106.70095278106186
                },
                {
                    "latitude": 10.774575803665257,
                    "longitude": 106.70091523013565
                },
                {
                    "latitude": 10.77496610130467,
                    "longitude": 106.70073820434061
                },
                {
                    "latitude": 10.775102870041305,
                    "longitude": 106.70067919574228
                },
                {
                    "latitude": 10.775383159298963,
                    "longitude": 106.70056251965013
                },
                {
                    "latitude": 10.775662130839217,
                    "longitude": 106.70044450245342
                },
                {
                    "latitude": 10.775798899259629,
                    "longitude": 106.70039085827312
                },
                {
                    "latitude": 10.776567386766267,
                    "longitude": 106.70004217110113
                },
                {
                    "latitude": 10.776678629143255,
                    "longitude": 106.69998316250275
                },
                {
                    "latitude": 10.776772579927023,
                    "longitude": 106.69992549500893
                },
                {
                    "latitude": 10.77684767466037,
                    "longitude": 106.69985709867905
                },
                {
                    "latitude": 10.776902595906353,
                    "longitude": 106.69979540787165
                },
                {
                    "latitude": 10.777012603049563,
                    "longitude": 106.69967739067499
                },
                {
                    "latitude": 10.777389476019035,
                    "longitude": 106.69926567159109
                },
                {
                    "latitude": 10.777762313834309,
                    "longitude": 106.69885931692528
                },
                {
                    "latitude": 10.778125682046907,
                    "longitude": 106.69846771440899
                },
                {
                    "latitude": 10.77864739009359,
                    "longitude": 106.69789103947062
                },
                {
                    "latitude": 10.778699676124807,
                    "longitude": 106.6978347130813
                },
                {
                    "latitude": 10.77905242133258,
                    "longitude": 106.69745249829663
                },
                {
                    "latitude": 10.779096637964658,
                    "longitude": 106.6974042185343
                },
                {
                    "latitude": 10.77915032369911,
                    "longitude": 106.69734655104048
                },
                {
                    "latitude": 10.779562023798375,
                    "longitude": 106.6969013043439
                },
                {
                    "latitude": 10.779618344328167,
                    "longitude": 106.69683961353655
                },
                {
                    "latitude": 10.780511566759795,
                    "longitude": 106.69586463055941
                },
                {
                    "latitude": 10.7814490028263,
                    "longitude": 106.69483868561099
                },
                {
                    "latitude": 10.781844561270606,
                    "longitude": 106.69440684995948
                },
                {
                    "latitude": 10.782324681572875,
                    "longitude": 106.69388113699245
                },
                {
                    "latitude": 10.782394422873578,
                    "longitude": 106.69380469403552
                },
                {
                    "latitude": 10.783078413734556,
                    "longitude": 106.69306038103372
                },
                {
                    "latitude": 10.783503529697668,
                    "longitude": 106.69259635887403
                },
                {
                    "latitude": 10.783716787333962,
                    "longitude": 106.69236568889869
                },
                {
                    "latitude": 10.783880394537798,
                    "longitude": 106.69218866310365
                },
                {
                    "latitude": 10.784337703783983,
                    "longitude": 106.69168843112226
                },
                {
                    "latitude": 10.784675703779302,
                    "longitude": 106.69131962738265
                },
                {
                    "latitude": 10.78472263675716,
                    "longitude": 106.69127000651588
                },
                {
                    "latitude": 10.785300652831197,
                    "longitude": 106.69063566408369
                },
                {
                    "latitude": 10.785461542008036,
                    "longitude": 106.69045729718414
                },
                {
                    "latitude": 10.785882702367873,
                    "longitude": 106.69000400386051
                }
            ]
        },
        "@version": "4"
    }
}
```

---

## 3. Routing API
**Mô tả:** Tính toán quãng đường ngắn nhất phục vụ việc kiểm chứng (Validate) Engine CityFlow.

### 📥 Dữ liệu phản hồi (JSON):
```json
{
    "formatVersion": "0.0.12",
    "routes": [
        {
            "summary": {
                "lengthInMeters": 1001,
                "travelTimeInSeconds": 347,
                "trafficDelayInSeconds": 0,
                "trafficLengthInMeters": 0,
                "departureTime": "2026-02-18T15:07:13+07:00",
                "arrivalTime": "2026-02-18T15:13:00+07:00"
            },
            "legs": [
                {
                    "summary": {
                        "lengthInMeters": 1001,
                        "travelTimeInSeconds": 347,
                        "trafficDelayInSeconds": 0,
                        "trafficLengthInMeters": 0,
                        "departureTime": "2026-02-18T15:07:13+07:00",
                        "arrivalTime": "2026-02-18T15:13:00+07:00"
                    },
                    "points": [
                        {
                            "latitude": 10.77959,
                            "longitude": 106.69889
                        },
                        {
                            "latitude": 10.77929,
                            "longitude": 106.69922
                        },
                        {
                            "latitude": 10.77926,
                            "longitude": 106.69925
                        },
                        {
                            "latitude": 10.77909,
                            "longitude": 106.69948
                        },
                        {
                            "latitude": 10.779,
                            "longitude": 106.69959
                        },
                        {
                            "latitude": 10.77898,
                            "longitude": 106.69973
                        },
                        {
                            "latitude": 10.77901,
                            "longitude": 106.69987
                        },
                        {
                            "latitude": 10.77895,
                            "longitude": 106.69994
                        },
                        {
                            "latitude": 10.77816,
                            "longitude": 106.69922
                        },
                        {
                            "latitude": 10.77776,
                            "longitude": 106.69886
                        },
                        {
                            "latitude": 10.77681,
                            "longitude": 106.69798
                        },
                        {
                            "latitude": 10.77638,
                            "longitude": 106.69759
                        },
                        {
                            "latitude": 10.77579,
                            "longitude": 106.69705
                        },
                        {
                            "latitude": 10.7751,
                            "longitude": 106.6964
                        },
                        {
                            "latitude": 10.77535,
                            "longitude": 106.69613
                        },
                        {
                            "latitude": 10.77544,
                            "longitude": 106.69606
                        },
                        {
                            "latitude": 10.77549,
                            "longitude": 106.69602
                        },
                        {
                            "latitude": 10.77554,
                            "longitude": 106.69601
                        },
                        {
                            "latitude": 10.77564,
                            "longitude": 106.696
                        },
                        {
                            "latitude": 10.77568,
                            "longitude": 106.69601
                        },
                        {
                            "latitude": 10.77576,
                            "longitude": 106.69558
                        },
                        {
                            "latitude": 10.77581,
                            "longitude": 106.69537
                        },
                        {
                            "latitude": 10.77589,
                            "longitude": 106.69521
                        },
                        {
                            "latitude": 10.77613,
                            "longitude": 106.69532
                        },
                        {
                            "latitude": 10.77627,
                            "longitude": 106.6954
                        },
                        {
                            "latitude": 10.77666,
                            "longitude": 106.69498
                        }
                    ]
                }
            ],
            "sections": [
                {
                    "startPointIndex": 0,
                    "endPointIndex": 25,
                    "sectionType": "TRAVEL_MODE",
                    "travelMode": "car"
                }
            ]
        }
    ]
}
```

---

## 4. Snap to Roads
**Mô tả:** Nắn chỉnh tọa độ GPS bị lệch từ báo cáo sự cố của người dân về đúng tim đường.

### 📥 Dữ liệu phản hồi (JSON):
```json
{
    "type": "about:blank",
    "title": "Not found",
    "detail": "The requested resource was not found",
    "status": 404
}
```

---

## 5. Map Display API
**Mô tả:** Cung cấp URL hiển thị bản đồ trực quan cho dashboard điều hành Sở GTVT.

### 📥 Dữ liệu phản hồi (JSON):
```json
{
    "api_type": "Raster Tile",
    "tile_url_example": "https://api.tomtom.com/map/1/tile/basic/main/15/26108/15773.png?key=nYiEtOLKFLyDntCB7Lyb8O8pzaiV6eWx",
    "usage": "Nhúng vào Leaflet/Mapbox trên Dashboard để hiển thị bản đồ nền."
}
```

---

