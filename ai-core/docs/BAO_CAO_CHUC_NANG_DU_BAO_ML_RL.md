# Báo cáo tổng hợp chức năng dự báo tình trạng đoạn đường (ML + RL)

## 1) Mục tiêu và phạm vi

Mục tiêu của chức năng là dự báo mức độ ùn tắc cho từng segment theo horizon 15 hoặc 30 phút, sau đó phục vụ suy luận batch cho ứng dụng và các công cụ nội bộ.

Phạm vi triển khai thực tế gồm:
- Pipeline dữ liệu: Warehouse -> Forecast Mart -> Dataset cửa sổ thời gian.
- Mô hình ML giám sát để học baseline phân lớp ùn tắc.
- Tác tử RL (DQN) học chính sách dự báo với hàm thưởng định hướng lớp ưu tiên.
- Cơ chế hybrid warmstart: khởi tạo RL từ trọng số ML đã học.
- API public/internal cho suy luận batch, benchmark và fallback.

Lưu ý quan trọng về phạm vi hiện hành:
- Nhánh forecast endpoint độc lập (LSTM/RF/Ensemble trong thư mục forecast) vẫn là TODO.
- Luồng production hiện dùng nhánh congestion prediction dựa trên RL warmstart.

---

## 2) Trình tự triển khai A-Z theo kiến trúc mã nguồn

### Bước 1. Cấu hình và kết nối dữ liệu

Các file chính:
- src/core/config/settings.py
- src/core/config/forecast.py
- src/core/config/database.py
- src/core/config/mart.py
- src/core/config/models.py
- src/core/database.py

Những gì đã làm:
- Gom toàn bộ cấu hình vào một lớp AppSettings (Pydantic Settings), đọc từ .env.
- Tách cấu hình theo domain (database, mart, forecast, rl, model path) để giảm coupling.
- Tạo SQLAlchemy engine singleton có pool + keepalive + connect_timeout để ổn định trong môi trường chạy lâu.

Lý do chọn kỹ thuật:
- Dùng typed settings giúp fail-fast khi sai kiểu và dễ kiểm soát mặc định.
- Engine singleton + pool giúp giảm overhead tạo kết nối lặp lại.
- Keepalive và pre-ping giúp giảm lỗi connection stale trong train dài.

Trade-off:
- Ưu điểm: cấu hình tập trung, dễ mở rộng, vận hành ổn định.
- Nhược điểm: nếu alias env đặt không đồng nhất sẽ bị rơi về default (cần naming convention chặt).

---

### Bước 2. Lớp lấy dữ liệu

Các file chính:
- src/data_access/forecast_mart_repository.py
- src/data_access/warehouse_repository.py

Những gì đã làm:
- Thiết kế 2 nguồn dữ liệu:
  - Forecast Mart: bảng đã pre-join, ưu tiên cho tốc độ.
  - Warehouse query: fallback khi mart không khả dụng hoặc stale.
- Triển khai self-refresh cho mart theo cơ chế stale + cooldown + lookback.
- Bổ sung statement_timeout và lock_timeout cho query mart/warehouse để tránh treo pipeline.

Lý do chọn kỹ thuật:
- Mart cho tốc độ truy xuất tốt hơn vì đã precompute và gom cột phục vụ model.
- Fallback warehouse đảm bảo tính sẵn sàng khi mart lỗi hoặc trễ cập nhật.
- Timeout/lock timeout giúp hệ thống fail-soft thay vì hang vô thời hạn.

Trade-off:
- Ưu điểm: nhanh khi mart khỏe, vẫn chạy được khi mart lỗi.
- Nhược điểm: tăng độ phức tạp logic dữ liệu (2 đường đọc + điều phối stale).

---

### Bước 3. Gom và làm sạch dữ liệu

Các file chính:
- src/utils/data_loader.py
- src/utils/segment_processing.py
- src/features/traffic_features.py
- src/features/temporal_features.py
- src/features/sliding_window.py
- src/utils/preprocessing.py

Những gì đã làm:
- Chuẩn hóa dữ liệu theo chu kỳ 15 phút bằng resample.
- Sinh đặc trưng thời gian:
  - day_of_week, is_peak_hour, time_key
  - time_sin/time_cos để mã hóa tính chu kỳ trong ngày.
- Sinh đặc trưng giao thông: traffic_index, LOS, congestion level.
- Làm sạch theo loại cột:
  - continuous: interpolate tuyến tính
  - categorical/static: ffill + bfill
  - fallback cuối: fillna cứng (unknown/0)
- Lọc peak hours (06:00-21:00) để tăng mật độ dữ liệu hữu ích cho mục tiêu dự báo đô thị.

Lý do chọn kỹ thuật:
- Nội suy tuyến tính phù hợp chuỗi liên tục ngắn hạn 15 phút.
- Cyclical encoding (sin/cos) xử lý tốt biên 23:59 -> 00:00 hơn one-hot hour thuần.
- Peak-hours-only giúp giảm nhiễu ngoài giờ hoạt động và tăng continuity valid windows.

Trade-off:
- Ưu điểm: pipeline sạch, ít NaN, giữ cấu trúc temporal nhất quán.
- Nhược điểm: nội suy có thể làm trơn quá mức các biến động đột ngột.

---

### Bước 4. Contract đặc trưng trước model

File chính:
- src/ml/feature_contract.py

Những gì đã làm:
- Chuẩn hóa cứng danh sách cột dynamic/static/categorical.
- Chuẩn hóa nhãn đích TARGET_COL, WINDOW_SIZE_DEFAULT, NUM_CLASSES, WINDOW_STEP_MINUTES.

Lý do chọn kỹ thuật:
- Contract rõ ràng giúp train/infer dùng đúng schema, tránh lệch cột.

Trade-off:
- Ưu điểm: nhất quán toàn pipeline.
- Nhược điểm: đổi schema cần cập nhật đồng bộ nhiều nơi.

---

### Bước 5. Dataset và mô hình ML

Các file chính:
- src/ml/data/dataset.py
- src/ml/models/traffic_model.py

#### 5.1 Dataset theo cửa sổ thời gian

Những gì đã làm:
- Tạo TrafficDataset dùng cửa sổ thời gian (window_size=12).
- target_offset_steps cho horizon 15/30 phút.
- find_valid_window_starts để chỉ giữ window liên tục và cùng segment.
- Split train/val theo mốc thời gian (temporal split), tránh leakage.
- Label encode categorical theo train; val unseen -> fallback class đầu.
- Scaler fit trên train và transform cho train/val.

Lý do chọn kỹ thuật:
- Temporal split phù hợp bài toán dự báo theo thời gian hơn random split.
- Window validity theo continuity giúp mô hình không học chuỗi đứt gãy.

Trade-off:
- Ưu điểm: dữ liệu huấn luyện phản ánh đúng temporal causality.
- Nhược điểm: số lượng sample hợp lệ có thể giảm đáng kể khi dữ liệu thưa.

#### 5.2 Kiến trúc mô hình ML

Kiến trúc hiện dùng fusion 3 nhánh:
- Dynamic sequence (5 biến) -> LSTM 2 tầng (hidden=64).
- Categorical context -> Embedding từng cột (dim=8).
- Static numeric context -> ghép với embedding -> context FNN.
- Fuse LSTM vector + context vector -> classifier head.

Lý do chọn kỹ thuật:
- LSTM xử lý quan hệ chuỗi ngắn hạn tốt hơn MLP thuần trên tabular.
- Embedding categorical hiệu quả hơn one-hot khi cardinality tăng.
- Fusion cho phép kết hợp lịch sử động + bối cảnh tĩnh/categorical trong một forward pass.

Trade-off:
- Ưu điểm: biểu diễn giàu ngữ cảnh, cân bằng temporal + context.
- Nhược điểm: phức tạp hơn baseline tree models, cần artifacts encode/scale đồng bộ lúc infer.

---

### Bước 6. Training và suy luận ML (trọng tâm)

Các file chính:
- src/ml/training/class_weighting.py
- src/ml/training/losses.py
- src/ml/training/loop.py
- scripts/run_ml_train.py
- src/ml/inference/predictor.py

#### 6.1 Thiết lập training ML

Thiết lập điển hình trong run_ml_train.py:
- EPOCHS=35
- BATCH_SIZE=256
- LR=1e-3
- PATIENCE=12
- AdamW + weight_decay=1e-4
- Label smoothing=0.05
- Scheduler ReduceLROnPlateau (patience=2, factor=0.5)
- use_class_weights=True, clip [0.8, 1.8]
- use_weighted_sampler=False
- Loss hiện tại chủ đạo: CrossEntropy

Lý do chọn các thông số:
- Batch 256: giảm nhiễu gradient, tận dụng GPU/throughput.
- LR 1e-3 với AdamW: điểm cân bằng hội tụ nhanh và ổn định.
- Patience 12: tránh dừng sớm giả khi metric dao động theo epoch.
- Class weights clip hẹp: xử lý mất cân bằng nhưng không over-penalize minority.
- Label smoothing 0.05: giảm overconfidence, cải thiện tổng quát hóa.

Trade-off:
- Class weights thay vì weighted sampler:
  - Ưu: giữ phân phối batch gần thực tế hơn.
  - Nhược: nếu imbalance rất nặng, minority có thể vẫn under-sampled trong từng batch.
- CE thay focal:
  - Ưu: ổn định hơn, ít tuning hơn.
  - Nhược: focal có thể đẩy mạnh learning ở hard examples nếu tune tốt.

#### 6.2 Kỹ thuật kiểm soát ổn định train

Đã áp dụng:
- Gradient clipping (max_norm=1.0).
- Early stopping theo val macro-F1.
- Theo dõi per-class precision/recall/F1 và confusion matrix.

Lý do chọn kỹ thuật:
- Bài toán mất cân bằng cần metric theo lớp, không chỉ accuracy tổng.
- Macro-F1 phù hợp mục tiêu giữ chất lượng đồng đều hơn giữa các lớp.

#### 6.3 Artifacts và infer

Đã triển khai lưu artifact chuẩn:
- Checkpoint model
- Scaler + LabelEncoders
- Metrics JSON

Infer dùng đúng scaler/encoder từ train để tránh train-serve skew.

---

### Bước 7. Agent RL, môi trường học và train RL (trọng tâm cao)

Các file chính:
- src/rl/environments/traffic_env.py
- src/rl/agents/dqn_agent.py
- src/rl/training/loop.py
- src/rl/training/runner.py
- scripts/run_rl_train_warmstart.py
- scripts/run_rl_train_pure.py (profile full)
- src/rl/inference/evaluator.py

#### 7.1 Thiết kế môi trường RL

Môi trường TrafficForecastingEnv:
- Observation gồm 3 phần:
  - dynamic: shape (12, 5)
  - static: shape (5,)
  - categorical: shape (4,)
- Action space: Discrete(NUM_CLASSES).
- Reward function theo mức sai khác action-target:
  - Đúng nhãn: thưởng dương lớn.
  - Lệch nhẹ: phạt nhẹ.
  - Lệch nặng: phạt mạnh.
  - Có phạt bất đối xứng cho under-predict khi target thuộc nhóm nặng.
- Có reward_scale và reward_clip để ổn định biên độ thưởng.

Lý do chọn kỹ thuật:
- Reward shaping theo mức độ sai phản ánh chi phí nghiệp vụ không đối xứng.
- Clip reward để tránh Q target bùng nổ do outlier.

Trade-off:
- Ưu điểm: policy học nhanh hơn reward nhị phân đúng/sai.
- Nhược điểm: reward shaping cần tuning, có nguy cơ bias quá mạnh vào một lớp nếu weighting không hợp lý.

#### 7.2 Thiết kế agent DQN

Đã triển khai:
- Replay Buffer để phá tương quan mẫu liên tiếp.
- Target Network sync định kỳ để ổn định target bootstrap.
- Epsilon-greedy exploration với decay.
- Double DQN tùy chọn để giảm overestimation bias.
- Loss: SmoothL1 (Huber) cho độ bền với outlier.
- Optimizer AdamW, gradient clipping.

Lý do chọn kỹ thuật:
- DQN phù hợp action rời rạc mức ùn tắc.
- Replay + target net là bộ kỹ thuật nền tảng giảm dao động học Q.
- Double DQN cải thiện chất lượng ước lượng giá trị kỳ vọng.

Trade-off:
- Ưu điểm: cấu trúc đã kiểm chứng, triển khai thực tế tốt.
- Nhược điểm: sample-inefficient hơn các phương pháp policy-gradient hiện đại trong không gian trạng thái lớn.

#### 7.3 Thiết lập train RL theo hai chế độ

a) Warmstart RL (SL -> RL)
- Episodes: 24
- LR: 5e-5
- epsilon_start/min/decay: 0.4 / 0.05 / 0.92
- warmup_steps: 2000
- replay_capacity: 100000
- early-stop: patience=4, min_delta=0.0005
- reward_clip: 20

Lý do:
- Warmstart bắt đầu từ policy gần tốt nên cần LR thấp để fine-tune an toàn.
- Epsilon khởi đầu thấp hơn pure RL để giảm phá hỏng tri thức từ ML.

b) Pure RL from DW
- Episodes: 80
- LR: 2e-4
- epsilon_start/min/decay: 1.0 / 0.10 / 0.995
- warmup_steps: 5000
- replay_capacity: 200000
- early-stop: patience=6, eval_interval=2
- reward_clip: 30

Lý do:
- Pure RL cần khám phá mạnh hơn (epsilon start 1.0) vì không có prior.
- Cần tập nhớ lớn và nhiều episode để hội tụ đủ.

Trade-off warmstart vs pure:
- Warmstart:
  - Ưu: hội tụ nhanh, ổn định hơn, tiết kiệm compute.
  - Nhược: bị giới hạn bởi chất lượng/thiên lệch của mô hình ML khởi tạo.
- Pure:
  - Ưu: tự học từ reward objective, có thể vượt baseline ML.
  - Nhược: tốn tài nguyên, nhạy cảm hyperparameter, dễ dao động.

#### 7.4 Window balancing và class-aware reward

Đã áp dụng các kỹ thuật giảm lệch lớp:
- Undersampling có kiểm soát trên majority windows.
- Class-aware reward weights xây dựng từ phân phối train windows.

Lý do:
- Mất cân bằng lớp là điểm nghẽn chính khi học hành vi cho congestion nặng.
- Kết hợp sampling + reward weighting giúp tăng xác suất học đúng ở lớp khó.

Trade-off:
- Ưu điểm: cải thiện recall lớp quan trọng.
- Nhược điểm: nếu quá tay có thể giảm độ chính xác lớp dễ và làm policy thiên lệch.

#### 7.5 Đánh giá RL

Đã theo dõi:
- macro_f1_0_3 (focus labels 0..3)
- focus_recall_3
- confusion matrix
- per-class metrics
- no_improve count cho early stopping

Lý do:
- Chỉ accuracy không đủ phản ánh mục tiêu phát hiện congestion nặng.

---

### Bước 8. Mô hình kết hợp ML + RL (Hybrid) để ra model cuối

Kiến trúc kết hợp đã triển khai:
1) ML supervised học representation + classifier baseline.
2) RL warmstart nạp trọng số ML làm policy khởi tạo.
3) RL fine-tune theo reward nghiệp vụ (phạt bất đối xứng sai lệch congestion).
4) API production dùng warmstart RL predictor theo horizon 15/30.
5) Có fallback nearest-segment cùng corridor khi segment chính không đủ dữ liệu cửa sổ.

Vì sao chọn hybrid thay vì chỉ ML hoặc chỉ RL:
- Chỉ ML:
  - Dễ train và ổn định, nhưng khó encode trực tiếp objective nghiệp vụ bất đối xứng.
- Chỉ RL:
  - Linh hoạt theo reward, nhưng cold-start nặng và tốn compute.
- Hybrid:
  - Lấy ổn định/hội tụ nhanh từ ML + tính định hướng mục tiêu từ RL.

Trade-off hybrid:
- Ưu điểm:
  - Rút ngắn thời gian hội tụ RL.
  - Tăng khả năng tối ưu mục tiêu nghiệp vụ theo reward.
  - Dễ triển khai vận hành nhờ artifacts chuẩn hóa.
- Nhược điểm:
  - Hệ thống phức tạp hơn (2 pipeline train + đồng bộ artifacts).
  - Cần kiểm soát chặt consistency class/schema giữa ML và RL.

---

### Bước 9. API và tích hợp phục vụ ứng dụng

Các file chính:
- src/schemas/congestion_rl_schema.py
- src/api/routes/congestion.py
- src/api/app.py
- src/main.py

Những gì đã làm:
- Public batch API cho app: dự báo theo danh sách segment, horizon 15/30.
- Internal API cho benchmark/debug fallback.
- Chuẩn hóa reason_code:
  - DIRECT
  - FALLBACK_NEAREST
  - NO_VALID_WINDOW, ...
- Tích hợp fallback nearest segment trong cùng corridor khi không có valid window trực tiếp.

Lý do chọn kỹ thuật fallback:
- Trong dữ liệu thực tế, không phải segment nào cũng đủ 12-step liên tục tại thời điểm request.
- Fallback giữ khả dụng dịch vụ thay vì trả rỗng hàng loạt.

Trade-off:
- Ưu điểm: tăng success rate, giảm no_data.
- Nhược điểm: đánh đổi độ chính xác cục bộ vì dùng proxy segment gần nhất.

---

## 3) Tổng hợp ưu điểm và hạn chế

### 3.1 Ưu điểm

- Kiến trúc dữ liệu có failover mart -> warehouse, tăng độ bền vận hành.
- Feature engineering theo chuỗi thời gian chặt chẽ (resample, cyclical encoding, continuity windows).
- Mô hình ML fusion (LSTM + embedding + static context) phù hợp bài toán.
- RL setup có đầy đủ kỹ thuật ổn định: replay, target net, double DQN, clipping, early stop.
- Hybrid warmstart giúp rút ngắn hội tụ và bám objective nghiệp vụ tốt hơn.
- API batch có fallback theo corridor để tăng tính sẵn sàng cho ứng dụng.

### 3.2 Hạn chế / kỹ thuật cần cải tiến

- Nhánh forecast endpoint độc lập (LSTM/RF/Ensemble) vẫn chưa hoàn thiện (TODO).
- Một số đoạn RL/ML lịch sử vẫn còn giả định 6 lớp ở vài thành phần đánh giá/lịch sử, cần tiếp tục đồng bộ triệt để theo NUM_CLASSES hiện hành.
- Inference ML predictor hiện còn hardcode số lớp khi khởi tạo model, cần đồng bộ tuyệt đối với feature_contract.
- Query SQL trong một số hàm đang dùng f-string cho điều kiện thời gian/ID, cần tiến thêm về parameter binding đồng bộ để giảm rủi ro.

---

## 4) Vì sao các thông số train được set như hiện tại

### ML

- window_size=12:
  - 12 bước * 15 phút = 3 giờ lịch sử, đủ nắm short-term temporal pattern.
- horizon 15/30 phút:
  - khớp bài toán điều hành giao thông gần-thời-gian-thực.
- batch_size=256:
  - tăng throughput và ổn định gradient trên tập lớn.
- AdamW + weight_decay:
  - cân bằng hội tụ nhanh và regularization.
- class weights clip hẹp:
  - giảm imbalance nhưng tránh over-bias minority.
- early stopping theo macro-F1:
  - phù hợp mục tiêu đa lớp mất cân bằng.

### RL

- warmstart LR thấp hơn pure:
  - tránh phá tri thức nền từ ML.
- epsilon schedule khác nhau giữa warmstart/pure:
  - warmstart cần ít khám phá hơn, pure cần khám phá mạnh hơn.
- replay capacity/warmup lớn trong pure:
  - giảm dao động khi bắt đầu học từ đầu.
- reward shaping + class-aware weights:
  - phản ánh chi phí sai dự báo không đối xứng trong nghiệp vụ.

---

## 5) Kịch bản thuyết trình nhanh với giáo viên hướng dẫn

Bạn có thể trình bày theo flow sau:

1. Bài toán và mục tiêu nghiệp vụ
- Dự báo congestion theo segment với horizon 15/30 phút, phục vụ API batch cho app.

2. Dữ liệu và độ bền pipeline
- Mart ưu tiên tốc độ, warehouse fallback đảm bảo availability.
- Self-refresh theo stale/cooldown/lookback để cân bằng freshness và tải DB.

3. ML baseline
- Dataset cửa sổ 12 bước, temporal split.
- Mô hình fusion LSTM + context embeddings.
- Huấn luyện với regularization + class-imbalance handling.

4. RL tối ưu hóa hành vi
- Môi trường gym với reward bất đối xứng.
- DQN + replay + target net + double DQN + early stop.

5. Hybrid ML + RL
- Warmstart từ ML để tăng tốc hội tụ RL.
- Kết quả cuối dùng RL warmstart trong API production.

6. Trade-off và hướng cải tiến
- Ưu: chính xác hơn ở mục tiêu nghiệp vụ trọng điểm, vận hành bền.
- Nhược: hệ thống phức tạp hơn, cần tiếp tục chuẩn hóa class contract và hoàn thiện nhánh forecast TODO.

---

## 6) Kế hoạch cải tiến đề xuất sau báo cáo

- Đồng bộ tuyệt đối NUM_CLASSES trên toàn bộ ML/RL/inference/evaluation.
- Chuẩn hóa env alias để tránh cấu hình bị ignore im lặng.
- Hoàn thiện forecast endpoint độc lập (RF/LSTM/Ensemble) hoặc dọn code TODO nếu không dùng.
- Thêm test tích hợp cho các case:
  - mart stale + refresh
  - mart timeout + warehouse fallback
  - fallback nearest segment trong API batch
- Thêm dashboard theo dõi drift và per-class recall theo thời gian thực.

---

## 7) Kết luận

Giải pháp hiện tại đã hình thành một pipeline dự báo đầy đủ từ dữ liệu đến phục vụ API với trọng tâm là hybrid ML + RL:
- ML cung cấp biểu diễn mạnh và baseline ổn định.
- RL tinh chỉnh theo objective nghiệp vụ thông qua reward design.
- Hybrid warmstart giúp cân bằng tốc độ hội tụ, độ ổn định và hiệu quả vận hành.

Điểm mạnh lớn nhất là tính thực dụng cho production (có fallback, có timeout, có artifacts chuẩn). Điểm cần hoàn thiện tiếp theo là đồng bộ class contract triệt để và đóng nốt nhánh forecast độc lập để hệ thống gọn, nhất quán, dễ bảo trì dài hạn.
