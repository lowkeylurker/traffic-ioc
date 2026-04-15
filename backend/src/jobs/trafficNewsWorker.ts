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
  let highestTTI = { road: 'Chưa có dữ liệu', value: 0 };
  try {
    const ttiRaw = await prisma.$queryRaw<any[]>`
      SELECT "dim_road"."name" as road, "fact_traffic_flow".travel_time_index as tti
      FROM "fact_traffic_flow"
      JOIN "dim_segment" ON "fact_traffic_flow".segment_id_source = "dim_segment".segment_id_source
      JOIN "dim_way" ON "dim_segment".way_id = "dim_way".way_id
      JOIN "dim_road" ON "dim_way".road_id = "dim_road".road_id
      ORDER BY travel_time_index DESC NULLS LAST
      LIMIT 1
    `;
    if (ttiRaw && ttiRaw.length > 0 && ttiRaw[0].road) {
      highestTTI = { road: ttiRaw[0].road, value: ttiRaw[0].tti };
    }
  } catch (e) {
    logger.warn('Could not fetch highest TTI', e);
  }

  // Lấy đoạn đường có vận tốc thấp nhất
  let lowestSpeed = { road: 'Chưa có dữ liệu', value: 0 };
  try {
    const speedRaw = await prisma.$queryRaw<any[]>`
      SELECT "dim_road"."name" as road, "fact_traffic_flow".current_speed_kmh as speed
      FROM "fact_traffic_flow"
      JOIN "dim_segment" ON "fact_traffic_flow".segment_id_source = "dim_segment".segment_id_source
      JOIN "dim_way" ON "dim_segment".way_id = "dim_way".way_id
      JOIN "dim_road" ON "dim_way".road_id = "dim_road".road_id
      WHERE "fact_traffic_flow".current_speed_kmh > 0
      ORDER BY current_speed_kmh ASC
      LIMIT 1
    `;
    if (speedRaw && speedRaw.length > 0 && speedRaw[0].road) {
      lowestSpeed = { road: speedRaw[0].road, value: speedRaw[0].speed };
    }
  } catch (e) {
    logger.warn('Could not fetch lowest speed', e);
  }

  // Lấy sự kiện mới nhất trong 30 phút qua
  let latestIncident = 'Không có sự kiện bất thường đáng chú ý.';
  try {
    // raw query: sự kiện xảy ra trong vòng 30 phút
    const incidentRaw = await prisma.$queryRaw<any[]>`
      SELECT type_name, impact_level
      FROM incident_records
      WHERE created_at >= NOW() - INTERVAL '30 minutes'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (incidentRaw && incidentRaw.length > 0) {
      latestIncident = `${incidentRaw[0].type_name} (Mức độ: ${incidentRaw[0].impact_level})`;
    }
  } catch (e) {
    logger.warn('Could not fetch latest incident (using mocked/placeholder)', e);
    // Nếu bảng incident_records không tồn tại, dùng text fallback
  }

  return { highestTTI, lowestSpeed, latestIncident };
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
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `Bạn là chuyên gia phân tích giao thông. 
Dữ liệu hiện tại:
- Điểm TTI (kéo dài hành trình) cao nhất: Đường ${dbData.highestTTI.road} (TTI: ${dbData.highestTTI.value.toFixed(1)})
- Điểm tốc độ thấp nhất: Đường ${dbData.lowestSpeed.road} (${dbData.lowestSpeed.value} km/h)
- Sự kiện mới nhất (30 phút qua): ${dbData.latestIncident}

YÊU CẦU:
Viết 1 câu ngắn dưới 50 từ, bắt đầu bằng emoji thích hợp. Không dùng markdown, không giải thích. Mục tiêu: Báo cáo tình hình chung cho người đi đường.`;

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
export const trafficNewsWorker = new Worker(
  NEWS_QUEUE_NAME,
  processGenerateNews,
  {
    connection: getRedisConnection(),
    concurrency: 1, // Tránh call AI liên tục trùng lúc
  }
);

trafficNewsWorker.on('completed', (job) => {
  logger.log(`Job ${job.id} completed successfully.`);
});

trafficNewsWorker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed in TrafficNewsWorker`, err);
});
