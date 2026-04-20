# Báo cáo Kỹ thuật: Hệ thống Dự báo và Điều phối Giao thông Thông minh (SL & RL)

Báo cáo này được tổng hợp trực tiếp từ các module Python trong AI Core, đặc biệt là [data_loader.py](ai-core/src/utils/data_loader.py), [dataset.py](ai-core/src/ml/dataset.py), [traffic_model.py](ai-core/src/ml/traffic_model.py), [train.py](ai-core/src/ml/train.py), [inference.py](ai-core/src/ml/inference.py), [agent.py](ai-core/src/rl/agent.py), [traffic_env.py](ai-core/src/rl/traffic_env.py), [inference_rl.py](ai-core/src/rl/inference_rl.py), và [main_rl.py](ai-core/src/rl/main_rl.py). Phần trình bày nhấn mạnh không chỉ “what” hệ thống làm, mà quan trọng hơn là “why” từng quyết định thiết kế lại được chọn.

## 1. Tổng quan Ý tưởng

### Abstract
Bài toán cốt lõi của hệ thống là dự báo trạng thái giao thông 15 phút tới từ một cửa sổ lịch sử gồm 12 timesteps, tương đương 3 giờ dữ liệu. Mỗi mẫu đầu vào không chỉ là chuỗi thời gian thuần túy mà là tổ hợp của tốc độ, lưu lượng, chỉ số ùn tắc, độ trễ, chất lượng dữ liệu, cùng các đặc trưng tĩnh như số làn, tốc độ dòng tự do, ngày trong tuần, ca làm việc và mức độ thời tiết.

### Motivation
Đây là bài toán khó vì dữ liệu giao thông thực tế có nhiễu cao, đứt quãng, và thiếu ổn định theo thời gian. Cảm biến có thể hỏng, API ngoài có thể đứt mạch, và nhiều đoạn đường không có quan sát liên tục đủ dài. Vì vậy, mô hình không thể chỉ học từ trung bình thống kê đơn giản; nó phải học được cả động lực thời gian lẫn ngữ cảnh không gian - thời gian.

### Kiến trúc 2 giai đoạn
Hệ thống được chia thành hai tầng:

1. Giai đoạn 1 - **Supervised Learning**: xây dựng “bộ não” dự báo cơ sở, học quan hệ giữa 12 timesteps quá khứ và nhãn congestion_level 15 phút tới.
2. Giai đoạn 2 - **Reinforcement Learning**: biến năng lực dự báo thành năng lực điều phối, tức tối ưu quyết định trong không gian hành động có rủi ro cao.

Why: nếu đi thẳng vào RL từ đầu, agent sẽ học rất chậm, dễ bất ổn và khó hội tụ vì tín hiệu thưởng ngoài đời quá thưa. SL tạo nền nhận thức ban đầu, còn RL tinh chỉnh hành vi theo mục tiêu vận hành thực tế. Đây là đúng tinh thần **Offline-to-Online**.

## 2. Pipeline Dữ liệu & Tiền xử lý

### Luồng dữ liệu
Pipeline dữ liệu trong [data_loader.py](ai-core/src/utils/data_loader.py) đi theo hướng rõ ràng: truy vấn bulk từ PostgreSQL, resample về 15 phút, rồi xử lý từng segment bằng một hàm chuẩn hóa duy nhất. Các đặc trưng được chia thành ba nhánh:

- Dynamic: current_speed_kmh, pcu_volume, traffic_index, delay_seconds, quality_flag.
- Static: default_lane_count, static_free_flow, time_sin, time_cos, weather_severity.
- Categorical: osm_highway_type, district, shift_code, day_of_week.

Why: cách tách nhánh này giúp mô hình học đúng bản chất dữ liệu. Dynamic cần mô hình chuỗi như LSTM; Static và Categorical cần cơ chế nén ngữ cảnh như Embedding và MLP. Nếu trộn tất cả vào một vector phẳng, mô hình sẽ mất cấu trúc inductive bias.

### Làm sạch dữ liệu và lý do chấp nhận drop
Trong `process_single_segment`, dữ liệu được resample, nội suy các biến liên tục, sau đó loại bỏ các mốc không có target_label. Đây là một quyết định quan trọng: hệ thống chấp nhận mất một phần dữ liệu nếu nhãn bị khuyết dài, thay vì cố ffill/bfill target hoặc kéo dài nhãn cũ sang vùng mới.

Why: với feature thiếu, nội suy là chấp nhận được vì nó chỉ ảnh hưởng đầu vào. Nhưng với label thiếu, ffill/bfill sẽ tạo **Label Noise** trực tiếp, biến một giá trị suy diễn thành “sự thật huấn luyện”. Trong bài toán giao thông, nhãn sai còn nguy hiểm hơn mất mẫu vì nó làm méo biên quyết định và đẩy mô hình học lệch hướng. Do đó, drop có kiểm soát là lựa chọn đúng.

### Chống **Data Leakage** và **Label Leakage**
Trong [dataset.py](ai-core/src/ml/dataset.py), dữ liệu được chia train/val bằng `split_time` theo mốc thời gian thay vì chia theo index ngẫu nhiên. Đồng thời, LabelEncoder và MinMaxScaler chỉ fit trên tập train.

Why: nếu fit trên toàn bộ dữ liệu trước khi chia, validation đã “nhìn thấy tương lai” qua thống kê chuẩn hóa và từ vựng categorical. Đây là một dạng **Data Leakage** cổ điển nhưng cực kỳ nguy hiểm trong time series. Cách làm hiện tại giữ đúng ranh giới thời gian thực, nên đánh giá gần với thực tế triển khai hơn.

### Đoạn code đáng giá nhất
```python
split_time = df_working['timestamp'].quantile(train_ratio)
df_train = df_working[df_working['timestamp'] < split_time].copy()
df_val = df_working[df_working['timestamp'] >= split_time].copy()

scaler = TrafficScaler()
scaler.fit(df_train)

for col in cat_cols:
    le = LabelEncoder()
    le.fit(df_train[col].astype(str))
    df_train[col] = le.transform(df_train[col].astype(str))
```

## 3. Giai đoạn 1: Supervised Learning

### Kiến trúc `TrafficCongestionModel`
Mô hình trong [traffic_model.py](ai-core/src/ml/traffic_model.py) kết hợp hai khối chính:

- LSTM cho luồng Dynamic.
- Embedding + FNN cho luồng Categorical và Static.

Why: LSTM là lựa chọn tự nhiên cho chuỗi 12 timesteps vì nó giữ được phụ thuộc ngắn và trung hạn theo thời gian. Embedding biến các biến rời rạc như quận, ca làm việc, loại đường thành vector học được, thay vì ép chúng thành số nguyên ngụ ý thứ tự sai. FNN phía context giúp nén ngữ cảnh trước khi hợp nhất với vector thời gian từ LSTM.

### Cách mô hình hợp nhất tín hiệu
Mô hình lấy hidden state cuối của LSTM, ghép với context vector rồi đưa qua classifier để sinh ra 6 logits cho 6 mức congestion.

```python
lstm_out, _ = self.lstm(x_dynamic)
lstm_vector = lstm_out[:, -1, :]
x_context_full = torch.cat([x_static, x_embedded], dim=1)
context_vector = self.context_fnn(x_context_full)
fused_vector = torch.cat([lstm_vector, context_vector], dim=1)
logits = self.classifier(fused_vector)
```

Why: fusion kiểu này giữ được cả “dòng chảy” quá khứ lẫn “bối cảnh” hiện tại. Đây là cách thiết kế phù hợp với giao thông, vì ùn tắc không chỉ do lịch sử tốc độ mà còn do loại đường, quận, ca làm việc và thời tiết.

### Metric đánh giá và thành quả
Pipeline train trong [train.py](ai-core/src/ml/train.py) đánh giá bằng Accuracy, Macro-F1, Recall theo lớp, và đặc biệt có theo dõi minority recall cho các lớp ùn tắc nặng. Checkpoint tốt nhất được lưu theo Macro-F1 thay vì Accuracy thuần.

Why: trong bài toán giao thông, Accuracy dễ đánh lừa khi dữ liệu mất cân bằng. Dự báo đúng phần lớn các lớp thoáng nhưng bỏ sót các lớp kẹt nặng là thất bại vận hành. Vì vậy Macro-F1 và minority recall mới là chỉ số phù hợp.

## 4. Giai đoạn 2: Reinforcement Learning

### Động lực
Xác suất dự báo thuần túy là chưa đủ để điều phối giao thông. Một mô hình SL có thể nói “mức 4 là 62%”, nhưng trong vận hành thực tế, quyết định không chỉ là chọn lớp có xác suất cao nhất. Quan trọng hơn là hậu quả của sai lầm.

Why: dự báo đúng trung bình chưa chắc đã an toàn. Bỏ lọt một đoạn đường sắp kẹt nặng gây rủi ro lớn hơn nhiều so với việc báo động giả một đoạn đường đang thoáng. RL giải bài toán này bằng cách tối ưu trực tiếp reward theo hậu quả.

### Môi trường, State và Action
Trong [traffic_env.py](ai-core/src/rl/traffic_env.py), môi trường định nghĩa:

- Action space: 6 hành động, tương ứng 6 mức congestion.
- Observation space: một dict gồm dynamic, static, categorical.
- Episode: tuần tự quét qua data loader và đánh giá từng state.

Why: đây là cách mô hình hóa giao thông như một bài toán quyết định tuần tự. Agent không chỉ nhìn một mẫu độc lập mà nhìn một lát cắt có cấu trúc của thực tại.

### **Asymmetric Reward**
Trọng tâm của RL nằm ở hàm thưởng/phạt bất đối xứng. Đây là nơi hệ thống mã hóa triết lý vận hành: phạt cực nặng khi bỏ lọt nguy cơ kẹt xe nghiêm trọng, nhưng phạt mềm hơn khi báo động giả.

```python
def calculate_reward(self, action, target):
    if action == target:
        return 10.0

    diff = action - target

    if abs(diff) == 1:
        return -2.0

    if abs(diff) >= 2:
        base_penalty = -5.0 * abs(diff)

        if target >= 4 and action <= 2:
            return base_penalty - 20.0

        elif target <= 2 and action >= 4:
            return base_penalty - 5.0

        return base_penalty
```

Why: đây là một **Asymmetric Reward** đúng nghĩa. Nếu thực tế là mức 5 mà agent đoán mức 0, reward là -5×5 - 20 = -45. Sai lầm này không chỉ là “sai số lớn”, mà là **False Negative** mang tính thảm họa: hệ thống đánh giá thấp ùn tắc nặng, dẫn tới điều phối sai và làm kẹt xe trầm trọng hơn. Ngược lại, **False Positive** kiểu báo kẹt quá mức bị phạt nhẹ hơn vì nó gây bất tiện, nhưng không tạo vòng xoáy kẹt xe cục bộ mạnh như bỏ lọt rủi ro.

### **DQN** và **Offline-to-Online**
Trong [agent.py](ai-core/src/rl/agent.py), agent dùng DQN với policy network và target network, replay buffer, epsilon-greedy, và khởi tạo từ trọng số pre-trained của SL.

Why: đây chính là chiến lược **Offline-to-Online**. SL học offline từ dữ liệu lịch sử để có “trực giác” ban đầu. Sau đó DQN chuyển sang tối ưu online trên môi trường thưởng/phạt mô phỏng, thay vì học từ số 0. Cách làm này giảm đáng kể thời gian hội tụ và tăng ổn định.

Các chi tiết đáng chú ý:

- `self.policy_net.load_state_dict(pretrained_weights)` để nạp kiến thức nền.
- `self.target_net.load_state_dict(self.policy_net.state_dict())` để đồng bộ ban đầu.
- `self.epsilon_decay = 0.85` để giảm khám phá khá nhanh.
- `self.optimizer = optim.AdamW(..., lr=1e-5)` để tinh chỉnh nhẹ, tránh phá vỡ kiến thức gốc.

Why: vì model đã học xong biểu diễn cơ bản ở SL, RL chỉ nên chỉnh hành vi ra quyết định. Learning rate nhỏ và epsilon decay nhanh giúp agent sớm chuyển từ “thử bừa” sang “ra quyết định có cơ sở”. Trong [main_rl.py](ai-core/src/rl/main_rl.py), reward episode được theo dõi và checkpoint theo total reward, đúng tinh thần tối ưu vận hành thay vì tối ưu loss học thuật.

## 5. Triển khai Suy luận Thực tế

### Luồng inference
Trong [inference_rl.py](ai-core/src/rl/inference_rl.py), hệ thống không trả về xác suất như SL mà trả về **Q-Values**. Đây là khác biệt quan trọng.

```python
q_values = self.agent_net(x_dynamic, x_static, x_cat)
best_action = torch.argmax(q_values, dim=1).item()

return {
    'predicted_level': best_action,
    'status_description': self.level_names[best_action],
    'q_values': np.round(q_list, 2)
}
```

Why: xác suất chỉ nói lớp nào “có vẻ đúng”, còn Q-Values nói hành động nào có kỳ vọng thưởng dài hạn cao nhất. Với điều phối giao thông, đây là mức trừu tượng phù hợp hơn vì mục tiêu không phải là khớp nhãn lịch sử, mà là giảm hậu quả xấu trong tương lai gần.

### Khắc phục lỗi Type Casting
Một lớp lỗi production thường gặp là dữ liệu lẫn `numpy.object_`, `Timestamp`, hoặc cột phát sinh ngoài schema. Trong code hiện tại, cách phòng thủ đã được làm khá đúng:

- chuyển thời gian bằng `pd.to_datetime`;
- chọn cột theo tên cố định;
- ép `to_numpy(dtype=np.float32)` và `to_numpy(dtype=np.int64)` trước khi tạo tensor;
- encoding categorical bằng encoder đã fit từ train.

Why: khi đã khóa schema theo tên và ép dtype rõ ràng, bạn triệt tiêu phần lớn lỗi casting ngầm. Nếu một dataframe rộng hơn vẫn lọt vào pipeline, lớp hardening bổ sung nên là loại bỏ cột dư bằng `drop(errors='ignore')` và ép các cột số sang float trước khi scale. Nhưng ở nhánh inference hiện tại, lựa chọn chắc tay nhất là không để dataframe “đi tự do” vào model.

### Khắc phục lỗi `TrafficDataset` với 12 dòng
Ghi chú repo cho thấy một bug quan trọng: `TrafficDataset(window_size=12)` cần 13 dòng để sinh ra 1 sample hợp lệ vì phải có 12 input + 1 target. Nếu chỉ đưa đúng 12 dòng, dataset sẽ không có valid window và sinh lỗi index out of range.

Why: đây là lỗi logic cửa sổ trượt, không phải lỗi PyTorch.

Cách sửa an toàn nhất trong production là như trong [inference_rl.py](ai-core/src/rl/inference_rl.py): không dùng `TrafficDataset` để cắt mẫu ở runtime, mà cắt tensor trực tiếp theo cột. Nếu buộc phải tái sử dụng `TrafficDataset`, có thể áp dụng kỹ thuật **Dummy Row Injection**, tức thêm một dòng mồi để đủ chiều dài cửa sổ. Tuy nhiên, cách hiện tại tốt hơn vì nó tránh phụ thuộc vào một abstraction được thiết kế cho training chứ không phải inference.

### Bộ lọc nghiệp vụ
`forecast_for_request` chỉ giữ các dự báo nằm trong khung 09:15 - 21:15 và chỉ chấp nhận cửa sổ 12 bước liên tục cách nhau đúng 165 phút.

Why: điều này bảo đảm kết quả điều phối không bị rơi vào vùng dữ liệu ít ý nghĩa hoặc không có khả năng tác động nghiệp vụ. Hệ thống không nên đưa ra khuyến nghị cho cửa sổ đứt gãy hoặc ngoài giờ vận hành mục tiêu.

## 6. Tổng kết

Hệ thống đã hoàn thành đúng mục tiêu ban đầu theo hướng một kiến trúc hai tầng: SL tạo năng lực dự báo có cấu trúc, RL chuyển năng lực đó thành quyết định điều phối mang tính rủi ro - lợi ích. Pipeline dữ liệu đã xử lý tương đối chặt chẽ về thời gian, giảm **Data Leakage**, giữ schema ổn định và tách rõ dynamic/static/categorical. Mô hình SL có kiến trúc hợp lý cho chuỗi thời gian giao thông, còn tầng RL bổ sung được triết lý vận hành thực tế thông qua **Asymmetric Reward**, **DQN**, và **Offline-to-Online** transfer.

Điểm đáng giá nhất của toàn hệ thống không nằm ở một model đơn lẻ, mà ở cách các module ghép nối với nhau: data loader tạo đầu vào sạch, dataset dựng cửa sổ hợp lệ, model học biểu diễn, RL tối ưu hành động, và inference production trả về Q-Values có thể dùng ngay cho điều phối. Nói cách khác, đây là một hệ thống đã đi đúng từ “dự báo” sang “điều hành”.