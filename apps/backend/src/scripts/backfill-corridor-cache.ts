import 'dotenv/config';
import { connectMongoDB, disconnectMongoDB } from '../config/mongoose';
import { prisma } from '../config/prisma';
import { analyticsService } from '../services/analytics.service';
import { corridorCacheService } from '../services/corridor-cache.service';
import { Logger } from '../utils/logger';

const logger = new Logger('BackfillScript');

async function runBackfill() {
  const startDateStr = process.argv[2] || '2026-03-13';
  const endDateStr = process.argv[3] || new Date().toISOString().substring(0, 10);

  logger.log(`Bắt đầu chạy script khởi tạo dữ liệu (backfill) từ ngày ${startDateStr} đến ${endDateStr}...`);

  try {
    // 1. Kết nối DB
    logger.log('Đang kết nối tới các cơ sở dữ liệu...');
    await prisma.$queryRaw`SELECT 1`;
    await connectMongoDB();
    logger.log('✓ Kết nối cơ sở dữ liệu thành công');

    // 2. Lấy danh sách hành lang
    logger.log('Đang lấy danh sách các hành lang (corridors)...');
    const corridors = await analyticsService.getCorridorOptions();
    const corridorKeys = [null, ...corridors.map((c) => c.corridorKey)];
    logger.log(`✓ Tìm thấy ${corridors.length} hành lang (+ 1 dữ liệu tổng hợp)`);

    // 3. Lặp qua từng ngày
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    
    let currentDate = new Date(startDate);
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().substring(0, 10);
      logger.log(`--------------------------------------------------`);
      logger.log(`Đang xử lý ngày: ${dateStr}`);

      for (const key of corridorKeys) {
        const corridorLabel = key === null ? 'TẤT CẢ' : `Mã:${key}`;
        try {
          logger.log(`  [${dateStr}] Đang tính toán dữ liệu cho ${corridorLabel}...`);
          const data = await analyticsService.computeCorridorDashboard({ 
            date: dateStr, 
            corridorKey: key === null ? undefined : key 
          });
          
          logger.log(`  [${dateStr}] Đang lưu ${corridorLabel} vào MongoDB...`);
          await corridorCacheService.setCache(key, dateStr, data);
          
          totalSuccess++;
        } catch (error) {
          logger.error(`  [${dateStr}] LỖI khi xử lý ${corridorLabel}:`, error);
          totalFailed++;
        }
        totalProcessed++;
      }

      // Chuyển sang ngày tiếp theo
      currentDate.setDate(currentDate.getDate() + 1);
    }

    logger.log(`==================================================`);
    logger.log(`Hoàn tất quá trình khởi tạo dữ liệu!`);
    logger.log(`Tổng số bản ghi đã thử: ${totalProcessed}`);
    logger.log(`Số bản ghi thành công:   ${totalSuccess}`);
    logger.log(`Số bản ghi thất bại:    ${totalFailed}`);
    logger.log(`==================================================`);

  } catch (error) {
    logger.error('LỖI NGHIÊM TRỌNG trong script backfill:', error);
  } finally {
    logger.log('Đang đóng các kết nối...');
    await disconnectMongoDB();
    await prisma.$disconnect();
    logger.log('✓ Đã đóng kết nối. Thoát script.');
    process.exit(0);
  }
}

runBackfill();
