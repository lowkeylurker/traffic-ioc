import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../config/redis';
import { Logger } from '../utils/logger';
import { CSV_EXPORT_QUEUE_NAME, CsvExportJobData } from './csvExportQueue';
import { historyService } from '../services/history.service';
import { emailService } from '../services/email.service';
import { socketService } from '../services/socket.service';
import { Notification } from '../models/notification.model';
import { azureService } from '../services/azure.service';
import dayjs from 'dayjs';

const logger = new Logger('CsvExportWorker');

export const csvExportWorker = new Worker<CsvExportJobData>(
  CSV_EXPORT_QUEUE_NAME,
  async (job: Job<CsvExportJobData>) => {
    const { userId, email, exportParams } = job.data;
    logger.log(`⚙️ Processing CSV Export Job #${job.id} for user ${userId} (${email})`);

    try {
      // 1. Lấy dữ liệu và tạo file Buffer CSV
      const start = Date.now();
      const csvBuffer = await historyService.buildCsvBuffer(exportParams);
      const duration = Date.now() - start;
      logger.log(`✓ CSV Buffer generated in ${duration}ms. Size: ${csvBuffer.length} bytes.`);

      // 2. Tạo tên file chuyên nghiệp
      const timestampStr = dayjs().format('YYYYMMDD_HHmmss');
      const filename = `traffic_report_${timestampStr}.csv`;

      // 3. Tải file CSV lên Azure Blob Storage
      logger.log(`☁️ Uploading CSV file to Azure Blob Storage...`);
      const uploadStart = Date.now();
      const downloadUrl = await azureService.uploadCsvBuffer(csvBuffer, filename);
      logger.log(`✓ CSV file uploaded to Azure Blob Storage in ${Date.now() - uploadStart}ms. Link: ${downloadUrl}`);

      // 4. Gửi email thông báo chứa link tải thông qua Nodemailer (Không gửi attachments vật lý)
      const emailResult = await emailService.sendCsvExportEmail(
        email,
        downloadUrl,
        filename,
        {
          startDateTime: exportParams.startDateTime,
          endDateTime: exportParams.endDateTime,
          roadName: exportParams.roadName,
        }
      );

      if (!emailResult.success) {
        throw new Error(`Failed to send CSV report email via email service: ${emailResult.reason || 'unknown reason'}`);
      }

      // 5. Lưu thông báo vào MongoDB có kèm link download URL để admin tải ngay từ dashboard
      const notification = await Notification.create({
        userId,
        type: 'csv_export_ready',
        title: 'Báo cáo CSV Sẵn sàng',
        message: emailResult.previewUrl
          ? `Báo cáo "${filename}" đã sẵn sàng. Email được gửi qua Ethereal test inbox.`
          : `Báo cáo "${filename}" đã xuất xong và gửi tới email của bạn.`,
        downloadUrl,
        emailPreviewUrl: emailResult.previewUrl,
        read: false,
      });

      // 6. Phát tín hiệu realtime qua Socket.io gửi thông báo trực tiếp đến UI
      socketService.emitToUser(userId, 'notification', {
        id: notification._id.toString(),
        type: notification.type,
        title: notification.title,
        message: notification.message,
        downloadUrl: notification.downloadUrl,
        emailPreviewUrl: notification.emailPreviewUrl,
        read: notification.read,
        createdAt: notification.createdAt.toISOString(),
      });

      logger.log(`✓ Successfully completed CSV Export Job #${job.id}`);
    } catch (error: any) {
      logger.error(`❌ Failed to execute CSV Export Job #${job.id}`, error);
      throw error; // Re-throw để BullMQ ghi nhận lỗi và thực hiện Retry exponential backoff
    }
  },
  {
    connection: createRedisConnection(),
    concurrency: 2, // Cho phép xử lý tối đa 2 job export song song để tối ưu hóa CPU backend
  }
);

// Graceful shutdown handler
csvExportWorker.on('failed', (job, err) => {
  logger.error(`Job failed: ${job?.id}`, err);
});
