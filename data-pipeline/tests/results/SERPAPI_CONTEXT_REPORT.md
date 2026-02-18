# 🕵️ Báo cáo Dữ liệu Bối cảnh SerpApi - UTRAFFIC

- **Ngày thực hiện:** 2026-02-18 08:06:36
- **Mục tiêu:** Thu thập dữ liệu sự kiện, địa điểm và tin tức để dự báo nhu cầu giao thông.

---

## 1. Google Events API
**Mô tả:** Xác định các sự kiện lớn gây biến động lưu lượng xe đổ về Quận 1.

### 📥 Dữ liệu mẫu (JSON):
```json
[
    {
        "title": "Mekong Discovery (Northbound)",
        "date": {
            "start_date": "Feb 19",
            "when": "Feb 19 – 26"
        },
        "address": [
            "Avalon Apartments, 53 Nguyễn Thị Minh Khai, Bến Nghé, Quận 3",
            "Ho Chi Minh City, Vietnam"
        ],
        "link": "https://www.virtuoso.com/cruises/sailings/18127572/mekong-discovery-northbound-19feb2026-26feb2026",
        "event_location_map": {
            "image": "https://www.google.com/maps/vt/data=yJmJgtpbHOcbVHUMVm3eg386hYkyE2o8hrpOb82Trv60UPvfXWJvPeT7Z5lqXuSkXat--BlD2emoZ1FV4Fg3f_JnY5DeoHwwm94FYwmMWkEKu5pTtY4",
            "link": "https://www.google.com/maps/place//data=!4m2!3m1!1s0x31752f376a7b5723:0xff6297c849dd8a61?sa=X&ved=2ahUKEwjaq-jWyuKSAxXxliYFHbVwIzoQ9eIBegQIAxAA",
            "serpapi_link": "https://serpapi.com/search.json?data=%214m2%213m1%211s0x31752f376a7b5723%3A0xff6297c849dd8a61&engine=google_maps&google_domain=google.com&hl=en&q=Events+in+HoChiMinh+City+District+1&type=place"
        },
        "description": "Cruise on the Avalon Waterways ship Avalon Saigon: Mekong Discovery (Northbound). Contact your Virtuoso Advisor for details on special amenities and exclusive benefits.",
        "ticket_info": [
            {
                "source": "Virtuoso",
                "link": "https://www.virtuoso.com/cruises/sailings/18127572/mekong-discovery-northbound-19feb2026-26feb2026",
                "link_type": "more info"
            }
        ],
        "venue": {
            "name": "Avalon Apartments",
            "rating": 4.2,
            "reviews": 40,
            "link": "https://www.google.com/search?sca_esv=8ee66ad7f9d1d3dd&q=Avalon+Apartments&ludocid=18402437913877776993&ibp=gwp%3B0,7"
        },
        "thumbnail": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQlLclEf0bEDKsiE_kto15Zu-7WdRXogO6l2z1-9wpM3n9iBv6_BPMhUf0&s",
        "image": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQK_F6b5yCBtRrJY8RK87dJcOkgalchby6iIfmXwtvUVA&s=10"
    }
]
...
```

---

## 2. Google Local API
**Mô tả:** Trích xuất thông tin địa điểm và độ bận rộn (Popular Times) để dự báo nhu cầu (Demand).

### 📥 Dữ liệu mẫu (JSON):
```json
{
    "position": 1,
    "rating": 4.3,
    "reviews": 5400,
    "reviews_original": "(5,4 N)",
    "description": "Trung tâm mua sắm rộng lớn có nhà hàng",
    "lsig": "AB86z5Ur7yr5JLfBcqzEgri1SqOc",
    "thumbnail": "https://serpapi.com/searches/69957310bf04d5fc9612001b/images/Gmz8EjrbofSauVUawaGKNyMsusnfWPRzCNwyio-TMvA.jpeg",
    "place_id": "9917239572823262924",
    "place_id_search": "https://serpapi.com/search.json?device=desktop&engine=google_local&gl=vn&google_domain=google.com&hl=vi&ludocid=9917239572823262924&q=Diamond+Plaza+Qu%E1%BA%ADn+1",
    "gps_coordinates": {
        "latitude": 10.780562,
        "longitude": 106.698456
    },
    "title": "Diamond Plaza",
    "type": "Trung tâm mua sắm",
    "phone": "028 3822 5500",
    "address": "34 Lê Duẩn",
    "hours": "Đang mở cửa · Đóng cửa vào 22:00"
}
...
```

---

## 3. Google News API
**Mô tả:** Cập nhật tin tức sự cố thời gian thực cho bảng `dim_traffic_news`.

### 📥 Dữ liệu mẫu (JSON):
```json
[
    {
        "position": 1,
        "title": "Cảnh sát giao thông TP.HCM hướng dẫn lộ trình thay thế tránh kẹt xe khi về quê ăn Tết",
        "source": {
            "name": "Báo Tuổi Trẻ",
            "icon": "https://encrypted-tbn2.gstatic.com/faviconV2?url=https://tuoitre.vn&client=NEWS_360&size=96&type=FAVICON&fallback_opts=TYPE,SIZE,URL"
        },
        "link": "https://tuoitre.vn/canh-sat-giao-thong-tp-hcm-huong-dan-lo-trinh-thay-the-tranh-ket-xe-khi-ve-que-an-tet-20260212072717211.htm",
        "thumbnail": "https://cdn2.tuoitre.vn/thumb_w/480/471584752817336320/2026/2/12/edit-ket-xe-9-17708555584961496317094.jpeg",
        "thumbnail_small": "https://news.google.com/api/attachments/CC8iK0NnNHhjMDk0YVZRM2JHb3pjbGd4VFJEQkFoamdBeWdLTWdhTlZKSm9yZ1k",
        "date": "02/12/2026, 01:30 AM, +0000 UTC",
        "iso_date": "2026-02-12T01:30:00Z"
    },
    {
        "position": 2,
        "title": "Mưa dầm, Thành phố Hồ Chí Minh kẹt xe nhiều nơi",
        "source": {
            "name": "Báo Nhân Dân điện tử",
            "icon": "https://encrypted-tbn0.gstatic.com/faviconV2?url=https://nhandan.vn&client=NEWS_360&size=96&type=FAVICON&fallback_opts=TYPE,SIZE,URL"
        },
        "link": "https://nhandan.vn/mua-dam-thanh-pho-ho-chi-minh-ket-xe-nhieu-noi-post890066.html",
        "thumbnail": "https://cdn.nhandan.vn/images/866344f237128d0a1e4da6918e32f0a7a4f7d7a3ee238adc41cb21a7ad0208c6c36315287e113dfcdae3116b997ed2da2c2cf8c9f3388c91003ccd5c59486c02/ket-xe-cong-truong-me-linh-192.jpg",
        "thumbnail_small": "https://news.google.com/api/attachments/CC8iK0NnNXNkMVZJZFdKM1NXTk5lR1JsVFJDZkF4ampCU2dLTWdZZGNZNVJxUVU",
        "date": "06/27/2025, 07:00 AM, +0000 UTC",
        "iso_date": "2025-06-27T07:00:00Z"
    },
    {
        "position": 3,
        "title": "Tuyến đường thường xuyên kẹt xe ở TPHCM sẽ mở rộng lên 6-8 làn, xây thêm cầu và hầm chui",
        "source": {
            "name": "Laodong.vn",
            "icon": "https://encrypted-tbn1.gstatic.com/faviconV2?url=https://laodong.vn&client=NEWS_360&size=96&type=FAVICON&fallback_opts=TYPE,SIZE,URL"
        },
        "link": "https://laodong.vn/xa-hoi/tuyen-duong-thuong-xuyen-ket-xe-o-tphcm-se-mo-rong-len-6-8-lan-xay-them-cau-va-ham-chui-1597321.ldo",
        "thumbnail": "https://media-cdn-v2.laodong.vn/storage/newsportal/2025/10/24/1597321/Ket-Xe-Nguyen-Tat-Th.jpg?w=800&h=496&crop=auto&scale=both",
        "thumbnail_small": "https://news.google.com/api/attachments/CC8iL0NnNHlTRFZQYmtoR1oxSTRTMmhSVFJDeEFSaWRBaWdCTWdrQkVJUUxJU1F1RVFF",
        "date": "10/24/2025, 07:00 AM, +0000 UTC",
        "iso_date": "2025-10-24T07:00:00Z"
    }
]
...
```

---

## 4. Google Trends API
**Mô tả:** Theo dõi mức độ quan tâm của người dân để đưa vào mô hình ML dự báo sớm.

### 📥 Dữ liệu mẫu (JSON):
```json
{
    "timeline_data": [
        {
            "date": "Feb 16 – 22, 2025",
            "timestamp": "1739664000",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "19",
                    "extracted_value": 19
                }
            ]
        },
        {
            "date": "Feb 23 – Mar 1, 2025",
            "timestamp": "1740268800",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "24",
                    "extracted_value": 24
                }
            ]
        },
        {
            "date": "Mar 2 – 8, 2025",
            "timestamp": "1740873600",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "21",
                    "extracted_value": 21
                }
            ]
        },
        {
            "date": "Mar 9 – 15, 2025",
            "timestamp": "1741478400",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "21",
                    "extracted_value": 21
                }
            ]
        },
        {
            "date": "Mar 16 – 22, 2025",
            "timestamp": "1742083200",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "23",
                    "extracted_value": 23
                }
            ]
        },
        {
            "date": "Mar 23 – 29, 2025",
            "timestamp": "1742688000",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "24",
                    "extracted_value": 24
                }
            ]
        },
        {
            "date": "Mar 30 – Apr 5, 2025",
            "timestamp": "1743292800",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "30",
                    "extracted_value": 30
                }
            ]
        },
        {
            "date": "Apr 6 – 12, 2025",
            "timestamp": "1743897600",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "37",
                    "extracted_value": 37
                }
            ]
        },
        {
            "date": "Apr 13 – 19, 2025",
            "timestamp": "1744502400",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "33",
                    "extracted_value": 33
                }
            ]
        },
        {
            "date": "Apr 20 – 26, 2025",
            "timestamp": "1745107200",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "47",
                    "extracted_value": 47
                }
            ]
        },
        {
            "date": "Apr 27 – May 3, 2025",
            "timestamp": "1745712000",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "81",
                    "extracted_value": 81
                }
            ]
        },
        {
            "date": "May 4 – 10, 2025",
            "timestamp": "1746316800",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "30",
                    "extracted_value": 30
                }
            ]
        },
        {
            "date": "May 11 – 17, 2025",
            "timestamp": "1746921600",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "26",
                    "extracted_value": 26
                }
            ]
        },
        {
            "date": "May 18 – 24, 2025",
            "timestamp": "1747526400",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "18",
                    "extracted_value": 18
                }
            ]
        },
        {
            "date": "May 25 – 31, 2025",
            "timestamp": "1748131200",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "27",
                    "extracted_value": 27
                }
            ]
        },
        {
            "date": "Jun 1 – 7, 2025",
            "timestamp": "1748736000",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "28",
                    "extracted_value": 28
                }
            ]
        },
        {
            "date": "Jun 8 – 14, 2025",
            "timestamp": "1749340800",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "32",
                    "extracted_value": 32
                }
            ]
        },
        {
            "date": "Jun 15 – 21, 2025",
            "timestamp": "1749945600",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "20",
                    "extracted_value": 20
                }
            ]
        },
        {
            "date": "Jun 22 – 28, 2025",
            "timestamp": "1750550400",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "33",
                    "extracted_value": 33
                }
            ]
        },
        {
            "date": "Jun 29 – Jul 5, 2025",
            "timestamp": "1751155200",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "25",
                    "extracted_value": 25
                }
            ]
        },
        {
            "date": "Jul 6 – 12, 2025",
            "timestamp": "1751760000",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "31",
                    "extracted_value": 31
                }
            ]
        },
        {
            "date": "Jul 13 – 19, 2025",
            "timestamp": "1752364800",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "100",
                    "extracted_value": 100
                }
            ]
        },
        {
            "date": "Jul 20 – 26, 2025",
            "timestamp": "1752969600",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "64",
                    "extracted_value": 64
                }
            ]
        },
        {
            "date": "Jul 27 – Aug 2, 2025",
            "timestamp": "1753574400",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "30",
                    "extracted_value": 30
                }
            ]
        },
        {
            "date": "Aug 3 – 9, 2025",
            "timestamp": "1754179200",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "32",
                    "extracted_value": 32
                }
            ]
        },
        {
            "date": "Aug 10 – 16, 2025",
            "timestamp": "1754784000",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "34",
                    "extracted_value": 34
                }
            ]
        },
        {
            "date": "Aug 17 – 23, 2025",
            "timestamp": "1755388800",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "28",
                    "extracted_value": 28
                }
            ]
        },
        {
            "date": "Aug 24 – 30, 2025",
            "timestamp": "1755993600",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "56",
                    "extracted_value": 56
                }
            ]
        },
        {
            "date": "Aug 31 – Sep 6, 2025",
            "timestamp": "1756598400",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "56",
                    "extracted_value": 56
                }
            ]
        },
        {
            "date": "Sep 7 – 13, 2025",
            "timestamp": "1757203200",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "36",
                    "extracted_value": 36
                }
            ]
        },
        {
            "date": "Sep 14 – 20, 2025",
            "timestamp": "1757808000",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "28",
                    "extracted_value": 28
                }
            ]
        },
        {
            "date": "Sep 21 – 27, 2025",
            "timestamp": "1758412800",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "28",
                    "extracted_value": 28
                }
            ]
        },
        {
            "date": "Sep 28 – Oct 4, 2025",
            "timestamp": "1759017600",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "38",
                    "extracted_value": 38
                }
            ]
        },
        {
            "date": "Oct 5 – 11, 2025",
            "timestamp": "1759622400",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "30",
                    "extracted_value": 30
                }
            ]
        },
        {
            "date": "Oct 12 – 18, 2025",
            "timestamp": "1760227200",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "37",
                    "extracted_value": 37
                }
            ]
        },
        {
            "date": "Oct 19 – 25, 2025",
            "timestamp": "1760832000",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "32",
                    "extracted_value": 32
                }
            ]
        },
        {
            "date": "Oct 26 – Nov 1, 2025",
            "timestamp": "1761436800",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "29",
                    "extracted_value": 29
                }
            ]
        },
        {
            "date": "Nov 2 – 8, 2025",
            "timestamp": "1762041600",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "29",
                    "extracted_value": 29
                }
            ]
        },
        {
            "date": "Nov 9 – 15, 2025",
            "timestamp": "1762646400",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "34",
                    "extracted_value": 34
                }
            ]
        },
        {
            "date": "Nov 16 – 22, 2025",
            "timestamp": "1763251200",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "35",
                    "extracted_value": 35
                }
            ]
        },
        {
            "date": "Nov 23 – 29, 2025",
            "timestamp": "1763856000",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "32",
                    "extracted_value": 32
                }
            ]
        },
        {
            "date": "Nov 30 – Dec 6, 2025",
            "timestamp": "1764460800",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "30",
                    "extracted_value": 30
                }
            ]
        },
        {
            "date": "Dec 7 – 13, 2025",
            "timestamp": "1765065600",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "24",
                    "extracted_value": 24
                }
            ]
        },
        {
            "date": "Dec 14 – 20, 2025",
            "timestamp": "1765670400",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "25",
                    "extracted_value": 25
                }
            ]
        },
        {
            "date": "Dec 21 – 27, 2025",
            "timestamp": "1766275200",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "31",
                    "extracted_value": 31
                }
            ]
        },
        {
            "date": "Dec 28, 2025 – Jan 3, 2026",
            "timestamp": "1766880000",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "44",
                    "extracted_value": 44
                }
            ]
        },
        {
            "date": "Jan 4 – 10, 2026",
            "timestamp": "1767484800",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "29",
                    "extracted_value": 29
                }
            ]
        },
        {
            "date": "Jan 11 – 17, 2026",
            "timestamp": "1768089600",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "26",
                    "extracted_value": 26
                }
            ]
        },
        {
            "date": "Jan 18 – 24, 2026",
            "timestamp": "1768694400",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "23",
                    "extracted_value": 23
                }
            ]
        },
        {
            "date": "Jan 25 – 31, 2026",
            "timestamp": "1769299200",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "25",
                    "extracted_value": 25
                }
            ]
        },
        {
            "date": "Feb 1 – 7, 2026",
            "timestamp": "1769904000",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "33",
                    "extracted_value": 33
                }
            ]
        },
        {
            "date": "Feb 8 – 14, 2026",
            "timestamp": "1770508800",
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "87",
                    "extracted_value": 87
                }
            ]
        },
        {
            "date": "Feb 15 – 21, 2026",
            "timestamp": "1771113600",
            "partial_data": true,
            "values": [
                {
                    "query": "kẹt xe",
                    "value": "45",
                    "extracted_value": 45
                }
            ]
        }
    ]
}
...
```

---

