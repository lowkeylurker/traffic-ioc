import { GoogleGenerativeAI } from '@google/generative-ai';
import { Job, Worker } from 'bullmq';
import { prisma } from '../config/prisma';
import { getRedisConnection } from '../config/redis';
import { Logger } from '../utils/logger';
import { NEWS_QUEUE_NAME } from './newsQueue';

const logger = new Logger('TrafficNewsWorker');

const REDIS_NEWS_KEY = 'latest_traffic_news';

/**
 * Lấy dữ liệu tóm tắt từ Database
 */
async function fetchTrafficData() {
  // Lấy đoạn đường có TTI (Travel Time Index) cao nhất (điểm nghẽn)
  // Lưu ý: Tên bảng và schema có thể thay đổi tùy thuộc vào Prisma schema thực tế.
  // Ở đây sử dụng Query raw hoặc các bảng giả định tương tự như project đang dùng.
  let highestTTI = { road: 'Chưa có dữ liệu', value: 0, delaySeconds: 0 };
  try {
    const ttiRaw = await prisma.$queryRaw<any[]>`
      WITH latest_corridor_flow AS (
        SELECT DISTINCT ON (corridor_key)
          corridor_key, travel_time_index, total_delay_seconds, timestamp
        FROM fact_corridor_performance
        WHERE timestamp >= NOW() - INTERVAL '15 minutes'
          AND timestamp::date = CURRENT_DATE
      )
      SELECT 
        dc.corridor_name as corridor, 
        f.travel_time_index as tti, 
        f.total_delay_seconds as delay,
        dc.total_length_m as length,
        dc.target_avg_speed as target_speed
      FROM latest_corridor_flow f
      JOIN dim_corridor dc ON f.corridor_key = dc.corridor_key
      WHERE dc.target_avg_speed IS NOT NULL AND dc.target_avg_speed > 0
      ORDER BY f.travel_time_index DESC NULLS LAST
      LIMIT 1
    `;
    if (ttiRaw && ttiRaw.length > 0 && ttiRaw[0].corridor) {
      const row = ttiRaw[0];
      // Tính toán delay chính xác hơn cho 1 hành trình: 
      // Delay (s) = (TTI - 1) * Free_Flow_Time(s)
      // Free_Flow_Time = (Length/1000 km) / (Target_Speed km/h) * 3600 (s/h)
      const freeFlowTime = (row.length * 3.6) / row.target_speed;
      const calculatedDelay = Math.round((row.tti - 1) * freeFlowTime);
      
      // Sử dụng giá trị tính toán, nếu vô lý thì fallback về giá trị từ DB
      highestTTI = { 
        road: row.corridor, 
        value: row.tti, 
        delaySeconds: calculatedDelay > 0 ? calculatedDelay : (row.delay || 0) 
      };
    }
  } catch (e) {
    logger.warn('Could not fetch highest TTI', e);
  }

  // Lấy đoạn đường có mức độ phục vụ (LOS) tệ nhất (thường là E hoặc F)
  let worstLOS = { road: 'Chưa có dữ liệu', level: 'N/A' };
  try {
    const losRaw = await prisma.$queryRaw<any[]>`
      WITH latest_flow AS (
        SELECT DISTINCT ON (segment_key)
          segment_key, los_level
        FROM fact_traffic_flow
        WHERE timestamp >= NOW() - INTERVAL '15 minutes'
          AND timestamp::date = CURRENT_DATE
      )
      SELECT dr.name as road, f.los_level as level
      FROM latest_flow f
      JOIN dim_segment ds ON f.segment_key = ds.segment_key
      JOIN dim_way dw ON ds.way_key = dw.way_key
      JOIN dim_road dr ON dw.road_key = dr.road_key
      ORDER BY f.los_level DESC NULLS LAST
      LIMIT 1
    `;
    if (losRaw && losRaw.length > 0 && losRaw[0].road) {
      worstLOS = { road: losRaw[0].road, level: losRaw[0].level };
    }
  } catch (e) {
    logger.warn('Could not fetch worst LOS', e);
  }

  // Lấy sự kiện mới nhất trong 30 phút qua
  let latestIncident = 'Không có sự kiện bất thường đáng chú ý.';
  try {
    // raw query: sự kiện xảy ra trong vòng 30 phút
    const incidentRaw = await prisma.$queryRaw<any[]>`
      SELECT fi.incident_type, fi.severity_level as impact_level, dr.name as road_name
      FROM fact_incident fi
      LEFT JOIN dim_segment ds ON fi.segment_key = ds.segment_key
      LEFT JOIN dim_way dw ON ds.way_key = dw.way_key
      LEFT JOIN dim_road dr ON dw.road_key = dr.road_key
      WHERE fi.timestamp >= NOW() - INTERVAL '30 minutes'
        AND fi.timestamp::date = CURRENT_DATE
      LIMIT 1
    `;
    if (incidentRaw && incidentRaw.length > 0) {
      latestIncident = `${incidentRaw[0].incident_type} tại ${incidentRaw[0].road_name || 'chưa rõ vị trí'} (Mức độ: ${incidentRaw[0].impact_level})`;
    }
  } catch (e) {
    logger.warn('Could not fetch latest incident (using mocked/placeholder)', e);
    // Nếu bảng incident_records không tồn tại, dùng text fallback
  }

  return { highestTTI, worstLOS, latestIncident };
}

/**
 * Xử lý job tạo tin tức
 */
async function processGenerateNews(job: Job) {
  try {
    logger.log('Bắt đầu quy trình lấy dữ liệu giao thông để tạo tin tức...');
    const dbData = await fetchTrafficData();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in .env');
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

    const prompt = `[SYSTEM INSTRUCTION]
Bạn là một Biên tập viên Kênh Truyền hình Giao thông Quốc gia (VTV Giao thông). 
Nhiệm vụ của bạn là tổng hợp dữ liệu khô khan thành một câu tin tức chạy dưới màn hình (News Ticker).

LUẬT BẮT BUỘC (CRITICAL RULES):
1. VĂN PHONG: Ngắn gọn, khẩn trương, chuyên nghiệp, mang tính cảnh báo.
2. ĐỘ DÀI: Tối đa 2 câu, không vượt quá 50 từ.
3. FORMAT: KHÔNG dùng Markdown (như in đậm **, in nghiêng *). BẮT BUỘC bắt đầu bằng một Emoji phù hợp (⚠️, 🔴, 🌧️, 🚗).
4. CẤM: Tuyệt đối không chào hỏi, không giải thích, không thêm cụm từ như "Đây là bản tin...". Chỉ trả về nội dung bản tin.

[USER PROMPT]
Hãy tạo một bản tin giao thông từ 3 dữ liệu Real-time sau đây:
- Hành lang kẹt nặng nhất: ${dbData.highestTTI.road}. Tại đây, chỉ số TTI là ${dbData.highestTTI.value.toFixed(1)} (nghĩa là người dân phải tốn thêm ${dbData.highestTTI.delaySeconds || 0} giây so với bình thường).
- Tuyến đường có mức độ phục vụ tệ nhất: ${dbData.worstLOS.road} (Xếp loại LOS: ${dbData.worstLOS.level} - Hãy diễn giải mức này thành từ ngữ mô tả kẹt xe: A/B: Thông thoáng, C: Trung bình, D: Đông đúc, E: Ùn ứ, F: Ùn tắc nghiêm trọng).
- Sự cố mới nhất từ người dân: ${dbData.latestIncident}.

YÊU CẦU DIỄN GIẢI:
1. Tuyệt đối không nhắc đến từ "TTI" hay "LOS" trong bản tin.
2. Với TTI, hãy nêu rõ số giây (hoặc số phút nếu lớn hơn 60s) mà người dân bị trễ thêm.
3. Với LOS, hãy dùng các tính từ mô tả trạng thái kẹt xe tương ứng.
4. Ưu tiên tạo câu văn nối mạch lạc, khẩn trương.`;

    logger.log('Đang gọi AI để tóm tắt...');
    const result = await model.generateContent(prompt);
    let textNews = result.response.text().trim();

    // Fallback nếu AI trả về lỗi định dạng (chứa markdown, quá dài...)
    if (textNews.includes('**')) textNews = textNews.replace(/\*\*/g, '');

    // Ghi vào Redis
    const redis = getRedisConnection();
    await redis.set(REDIS_NEWS_KEY, textNews); // Lưu vĩnh viễn (khi bị đè thì cập nhật)
    logger.log('Cập nhật tin tức thành công:', textNews);

    return { success: true, news: textNews };
  } catch (error) {
    logger.error('Lỗi khi processGenerateNews:', error);

    // Ghi tin nhắn dự phòng vào Redis nếu thất bại liên tục (có thể bỏ qua bước này nhưng để an toàn)
    const redis = getRedisConnection();
    const currentNews = await redis.get(REDIS_NEWS_KEY);
    if (!currentNews) {
      await redis.set(REDIS_NEWS_KEY, '📡 Hệ thống đang tổng hợp tín hiệu giao thông toàn thành phố...');
    }
    throw error;
  }
}

// Khởi tạo Worker
export const trafficNewsWorker = new Worker(NEWS_QUEUE_NAME, processGenerateNews, {
  connection: getRedisConnection(),
  concurrency: 1, // Tránh call AI liên tục trùng lúc
});

trafficNewsWorker.on('completed', (job) => {
  logger.log(`Job ${job.id} completed successfully.`);
});

trafficNewsWorker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed in TrafficNewsWorker`, err);
});
