# 📘 TÀI LIỆU CẤU TRÚC DỮ LIỆU CITYFLOW (JSON REFERENCE)

Tài liệu này tổng hợp chi tiết tất cả các trường dữ liệu trong 3 tệp cấu hình chính của Engine CityFlow: `config.json`, `flow.json`, và `roadnet.json`.

---

## 1. Tệp Cấu hình Hệ thống (`config.json`)
Định nghĩa các tham số môi trường và đường dẫn tệp tin cho phiên giả lập.

| Trường | Giải thích | Chi tiết kỹ thuật |
| :--- | :--- | :--- |
| **`interval`** | Bước thời gian giả lập | Đơn vị: giây. Ví dụ: `0.5` nghĩa là mỗi bước di chuyển hệ thống tính toán cho 0.5 giây thực tế. |
| **`seed`** | Hạt giống ngẫu nhiên | Đảm bảo tính lặp lại của kết quả giả lập. |
| **`dir`** | Thư mục gốc | Các đường dẫn tệp khác trong config sẽ được tính tương đối từ thư mục này. |
| **`roadnetFile`** | Tệp hạ tầng | Đường dẫn đến tệp định nghĩa mạng lưới đường bộ (`roadnet.json`). |
| **`flowFile`** | Tệp lưu lượng | Đường dẫn đến tệp định nghĩa luồng phương tiện (`flow.json`). |
| **`rlTrafficLight`** | Điều khiển đèn AI | `true`: Cho phép điều khiển đèn qua Python API; `false`: Dùng cấu hình đèn mặc định. |
| **`saveReplay`** | Lưu kết quả xem lại | Nếu `true`, hệ thống yêu cầu cung cấp `roadnetLogFile` và `replayLogFile`. |
| **`roadnetLogFile`** | Tệp log hạ tầng | Tệp roadnet đặc biệt dành riêng cho việc xem lại (replay). |
| **`replayLogFile`** | Tệp log vị trí | Chứa vị trí xe và trạng thái đèn giao thông của từng bước giả lập. |
| **`laneChange`** | Chỉnh làn | Bật/tắt tính năng phương tiện thay đổi làn đường (Mặc định: `false`). |

---

## 2. Tệp Luồng Giao thông (`flow.json`)
Định nghĩa hành vi vật lý của phương tiện và mật độ giao thông.

### A. Tham số Phương tiện (`vehicle`)
* **`length` / **`width`**: Kích thước vật lý của xe (mét).
* **`maxPosAcc` / **`maxNegAcc`**: Gia tốc và độ giảm tốc tối đa ($m/s^2$).
* **`usualPosAcc` / **`usualNegAcc`**: Gia tốc và độ giảm tốc thường dùng ($m/s^2$).
* **`minGap`**: Khoảng cách tĩnh tối thiểu chấp nhận được với xe phía trước (mét).
* **`maxSpeed`**: Tốc độ hành trình tối đa xe có thể đạt được ($m/s$).
* **`headwayTime`**: Khoảng cách động mong muốn (giây). Công thức: $Gap = Speed \times headwayTime$.

### B. Logic Luồng xe (`flow logic`)
* **`route`**: Lộ trình mà phương tiện sẽ tuân theo (chỉ định điểm đầu, cuối và các điểm trung gian).
* **`interval`**: Khoảng thời gian giữa hai xe liên tiếp xuất hiện (giây). Nếu quá nhỏ, xe sẽ bị giữ lại (held) cho đến khi đường đủ chỗ.
* **`startTime` / **`endTime`**: Khung thời gian luồng xe này hoạt động (giây).

---

## 3. Tệp Hạ tầng Mạng lưới (`roadnet.json`)
Định nghĩa cấu trúc đồ thị giao thông (Nút và Cạnh).

### A. Đường (`Road`)
Đại diện cho một đoạn đường định hướng từ nút giao này đến nút giao khác.
* **`id`**: Định danh duy nhất của đoạn đường.
* **`lanes`**: Danh sách các làn đường bên trong đoạn đường.
    * **`width`**: Độ rộng của làn đường.
    * **`maxSpeed`**: Tốc độ giới hạn trên làn đường đó.

### B. Nút giao (`Intersection`)
Điểm giao cắt giữa các con đường, nơi có các hướng rẽ và đèn tín hiệu.
* **`id`**: Định danh duy nhất của nút giao.
* **`point`**: Tọa độ tâm của nút giao $(x, y)$.
* **`roadLinks`**: Kết nối giữa hai con đường bên trong nút giao.
* **`laneLinks`**: Chi tiết kết nối từ một làn cụ thể của đường vào tới một làn cụ thể của đường ra.
* **`trafficLight`**: Hệ thống đèn giao thông.
    * **`phases`**: Các pha đèn quy định hướng nào được phép di chuyển.

---

## ⚠️ Lưu ý quan trọng về đơn vị
- **Vận tốc**: Luôn đổi từ $km/h$ sang $m/s$ ($v_{m/s} = v_{km/h} / 3.6$).
- **Tọa độ**: Chuyển đổi từ GPS (Lat/Long) sang tọa độ phẳng (Mét) để Engine tính toán va chạm chính xác.
- **Thời gian**: Tất cả các tham số thời gian (`interval`, `headwayTime`, `startTime`) đều tính bằng Giây.