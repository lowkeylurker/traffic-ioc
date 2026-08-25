"""Seed script to index foundational Vietnamese Traffic Decrees (NĐ 100/2019, NĐ 123/2021)."""

import os
import sys

# Ensure root package path is available
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.api.routes.ingest import IngestionPipeline, IngestionRequest

SAMPLE_ND100_2019 = """
# CHƯƠNG I: QUY ĐỊNH CHUNG

## Điều 1. Phạm vi điều chỉnh
1. Nghị định này quy định về hành vi vi phạm hành chính, hình thức, mức xử phạt, biện pháp khắc phục hậu quả đối với từng hành vi vi phạm hành chính trong lĩnh vực giao thông đường bộ và đường sắt.

# CHƯƠNG II: HÀNH VI VI PHẠM, HÌNH THỨC, MỨC XỬ PHẠT VÀ BIỆN PHÁP KHẮC PHỤC HẬU QUẢ VI PHẠM HÀNH CHÍNH TRONG LĨNH VỰC GIAO THÔNG ĐƯỜNG BỘ

## Mục 1: VI PHẠM QUY TẮC GIAO THÔNG ĐƯỜNG BỘ

## Điều 5. Xử phạt người điều khiển xe ô tô và các loại xe tương tự xe ô tô vi phạm quy tắc giao thông đường bộ

1. Phạt tiền từ 200.000 đồng đến 400.000 đồng đối với một trong các hành vi vi phạm sau đây:
- Điểm a) Không chấp hành hiệu lệnh, chỉ dẫn của biển báo hiệu, vạch kẻ đường;
- Điểm b) Chuyển hướng không nhường đường cho các xe đi ngược chiều, người đi bộ, xe lăn của người khuyết tật đang qua đường tại nơi có vạch kẻ đường dành cho người đi bộ.

3. Phạt tiền từ 800.000 đồng đến 1.000.000 đồng đối với một trong các hành vi vi phạm sau đây:
- Điểm a) Điều khiển xe chạy quá tốc độ quy định từ 05 km/h đến dưới 10 km/h;
- Điểm c) Chở người trên xe được chở không thắt dây an toàn khi xe đang chạy.

5. Phạt tiền từ 4.000.000 đồng đến 6.000.000 đồng đối với người điều khiển xe thực hiện một trong các hành vi vi phạm sau đây:
- Điểm a) Không chấp hành hiệu lệnh của đèn tín hiệu giao thông;
- Điểm đ) Điều khiển xe chạy quá tốc độ quy định từ 10 km/h đến 20 km/h.

6. Phạt tiền từ 6.000.000 đồng đến 8.000.000 đồng đối với người điều khiển xe thực hiện một trong các hành vi vi phạm sau đây:
- Điểm c) Điều khiển xe trên đường mà trong máu hoặc hơi thở có nồng độ cồn chưa vượt quá 50 miligam/100 mililít máu hoặc chưa vượt quá 0,25 miligam/1 lít khí thở.

8. Phạt tiền từ 16.000.000 đồng đến 18.000.000 đồng đối với người điều khiển xe thực hiện một trong các hành vi vi phạm sau đây:
- Điểm a) Điều khiển xe trên đường mà trong máu hoặc hơi thở có nồng độ cồn vượt quá 50 miligam đến 80 miligam/100 mililít máu hoặc vượt quá 0,25 miligam đến 0,4 miligam/1 lít khí thở.

10. Phạt tiền từ 30.000.000 đồng đến 40.000.000 đồng đối với người điều khiển xe thực hiện một trong các hành vi vi phạm sau đây:
- Điểm a) Điều khiển xe trên đường mà trong máu hoặc hơi thở có nồng độ cồn vượt quá 80 miligam/100 mililít máu hoặc vượt quá 0,4 miligam/1 lít khí thở;
- Điểm b) Không chấp hành yêu cầu kiểm tra về nồng độ cồn của người thi hành công vụ.

11. Ngoài việc bị phạt tiền, người điều khiển xe thực hiện hành vi vi phạm còn bị áp dụng các hình thức xử phạt bổ sung sau đây:
- Điểm a) Thực hiện hành vi quy định tại điểm a khoản 5 Điều này bị tước quyền sử dụng Giấy phép lái xe từ 01 tháng đến 03 tháng;
- Điểm h) Thực hiện hành vi quy định tại khoản 10 Điều này bị tước quyền sử dụng Giấy phép lái xe từ 22 tháng đến 24 tháng.

## Điều 6. Xử phạt người điều khiển xe mô tô, xe gắn máy (kể cả xe máy điện), các loại xe tương tự xe mô tô và các loại xe tương tự xe gắn máy vi phạm quy tắc giao thông đường bộ

1. Phạt tiền từ 100.000 đồng đến 200.000 đồng đối với một trong các hành vi vi phạm sau đây:
- Điểm a) Không chấp hành hiệu lệnh, chỉ dẫn của biển báo hiệu, vạch kẻ đường;
- Điểm p) Không bật đèn chiếu sáng trong thời gian từ 19 giờ ngày hôm trước đến 05 giờ ngày hôm sau hoặc khi sương mù, thời tiết xấu hạn chế tầm nhìn.

2. Phạt tiền từ 400.000 đồng đến 600.000 đồng đối với người điều khiển xe thực hiện một trong các hành vi vi phạm sau đây:
- Điểm b) Không chấp hành hiệu lệnh của đèn tín hiệu giao thông;
- Điểm k) Không đội “mũ bảo hiểm cho người đi mô tô, xe máy” hoặc đội “mũ bảo hiểm cho người đi mô tô, xe máy” không cài quai đúng quy cách khi điều khiển xe tham gia giao thông trên đường bộ;
- Điểm l) Chở người ngồi trên xe không đội “mũ bảo hiểm cho người đi mô tô, xe máy” hoặc đội “mũ bảo hiểm cho người đi mô tô, xe máy” không cài quai đúng quy cách, trừ trường hợp chở người bệnh đi cấp cứu, trẻ em dưới 06 tuổi, áp giải người có hành vi vi phạm pháp luật.

4. Phạt tiền từ 800.000 đồng đến 1.000.000 đồng đối với người điều khiển xe thực hiện một trong các hành vi vi phạm sau đây:
- Điểm a) Điều khiển xe chạy quá tốc độ quy định từ 10 km/h đến 20 km/h;
- Điểm h) Sử dụng điện thoại di động, thiết bị âm thanh (trừ thiết bị trợ thính) khi đang điều khiển xe chạy trên đường.

6. Phạt tiền từ 2.000.000 đồng đến 3.000.000 đồng đối với người điều khiển xe thực hiện một trong các hành vi vi phạm sau đây:
- Điểm c) Điều khiển xe trên đường mà trong máu hoặc hơi thở có nồng độ cồn chưa vượt quá 50 miligam/100 mililít máu hoặc chưa vượt quá 0,25 miligam/1 lít khí thở.

7. Phạt tiền từ 4.000.000 đồng đến 5.000.000 đồng đối với người điều khiển xe thực hiện một trong các hành vi vi phạm sau đây:
- Điểm a) Điều khiển xe chạy quá tốc độ quy định trên 20 km/h;
- Điểm c) Điều khiển xe trên đường mà trong máu hoặc hơi thở có nồng độ cồn vượt quá 50 miligam đến 80 miligam/100 mililít máu hoặc vượt quá 0,25 miligam đến 0,4 miligam/1 lít khí thở.

8. Phạt tiền từ 6.000.000 đồng đến 8.000.000 đồng đối với người điều khiển xe thực hiện một trong các hành vi vi phạm sau đây:
- Điểm a) Điều khiển xe trên đường mà trong máu hoặc hơi thở có nồng độ cồn vượt quá 80 miligam/100 mililít máu hoặc vượt quá 0,4 miligam/1 lít khí thở;
- Điểm b) Không chấp hành yêu cầu kiểm tra về nồng độ cồn của người thi hành công vụ.

10. Ngoài việc bị phạt tiền, người điều khiển xe thực hiện hành vi vi phạm còn bị áp dụng các hình thức xử phạt bổ sung sau đây:
- Điểm b) Thực hiện hành vi quy định tại điểm b khoản 2 Điều này bị tước quyền sử dụng Giấy phép lái xe từ 01 tháng đến 03 tháng;
- Điểm g) Thực hiện hành vi quy định tại điểm a, điểm b khoản 8 Điều này bị tước quyền sử dụng Giấy phép lái xe từ 22 tháng đến 24 tháng.
"""


def seed_database():
    pipeline = IngestionPipeline()
    print("🌱 Bắt đầu nạp văn bản pháp luật mẫu vào Qdrant và PostgreSQL...")

    req = IngestionRequest(
        kb_code="vietnam_traffic_legislation",
        kb_name="Cơ sở dữ liệu Pháp luật Giao thông Đường bộ Việt Nam",
        doc_code="ND-100-2019",
        doc_title="Nghị định 100/2019/NĐ-CP của Chính phủ về xử phạt vi phạm hành chính giao thông đường bộ",
        source_url="https://vanban.chinhphu.vn/?pageid=27160&docid=198888",
        filename="ND100_2019_ND_CP.md",
        content_text=SAMPLE_ND100_2019,
    )

    res = pipeline.process_ingestion(req)
    print(f"✅ Đã nạp thành công văn bản: {res.doc_code} - {res.doc_title}")
    print(f"📊 Số lượng chunk được bóc tách và làm giàu ngữ cảnh: {res.chunks_count}")
    print(f"🎯 Điểm vector được đồng bộ vào Qdrant ({res.collection_name}): {res.points_upserted}")


if __name__ == "__main__":
    seed_database()
