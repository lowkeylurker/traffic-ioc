import nodemailer from 'nodemailer';
import { Logger } from '../utils/logger';

const logger = new Logger('EmailService');

export interface CsvEmailSendResult {
  success: boolean;

  previewUrl?: string;

  reason?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  private fromEmail = '';

  private smtpHost = '';

  private smtpUser = '';

  constructor() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    this.smtpHost = host || '';
    this.smtpUser = user || '';

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        auth: {
          user,
          pass,
        },
      });
      this.fromEmail = process.env.MAIL_FROM || user;
      logger.log('✓ Nodemailer SMTP Transporter initialized successfully.');
    } else {
      logger.warn('⚠️ SMTP config is missing (SMTP_HOST, SMTP_USER, SMTP_PASS). emailService will run in MOCK mode.');
    }
  }

  async sendCsvExportEmail(
    toEmail: string,
    downloadUrl: string,
    filename: string,
    meta: { startDateTime: string; endDateTime: string; roadName?: string }
  ): Promise<CsvEmailSendResult> {
    const formattedRoad = meta.roadName || 'Tất cả các tuyến đường';
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Báo cáo Giao thông Smart Traffic IOC</title>
        </head>
        <body style="font-family: Arial, sans-serif; color: #262626; line-height: 1.5;">
          <h2>Yêu cầu xuất dữ liệu hoàn tất</h2>
          <p>Xin chào Admin,</p>
          <p>Báo cáo CSV đã sẵn sàng. Bạn có thể tải tại link sau:</p>
          <p><a href="${downloadUrl}" target="_blank">${downloadUrl}</a></p>
          <ul>
            <li><strong>Tên file:</strong> ${filename}</li>
            <li><strong>Tuyến đường:</strong> ${formattedRoad}</li>
            <li><strong>Từ thời gian:</strong> ${new Date(meta.startDateTime).toLocaleString('vi-VN')}</li>
            <li><strong>Đến thời gian:</strong> ${new Date(meta.endDateTime).toLocaleString('vi-VN')}</li>
          </ul>
        </body>
      </html>
    `;

    if (!this.transporter) {
      logger.log(`[MOCK EMAIL] Gửi email thành công tới: ${toEmail}`);
      logger.log(`[MOCK EMAIL] Link tải Azure Blob: ${downloadUrl}`);
      return { success: true };
    }

    try {
      const info = await this.transporter.sendMail({
        from: `Smart Traffic IOC <${this.fromEmail}>`,
        to: toEmail,
        subject: `[BÁO CÁO] Dữ liệu lịch sử giao thông: ${formattedRoad}`,
        html: htmlContent,
      });

      const accepted = (info.accepted || []).map((value: string) => String(value).toLowerCase());
      const target = toEmail.toLowerCase();
      const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
      const isEthereal = this.smtpHost.includes('ethereal.email') || this.smtpUser.endsWith('@ethereal.email');

      if (isEthereal && previewUrl) {
        logger.warn(`⚠️ Ethereal là mailbox test. Email sẽ không xuất hiện trong Gmail đích. Preview URL: ${previewUrl}`);
      }

      if (!accepted.includes(target)) {
        const rejected = (info.rejected || []).join(', ') || 'unknown';
        logger.error(`❌ SMTP accepted list does not include recipient ${toEmail}. rejected=${rejected}`);
        return {
          success: false,
          previewUrl,
          reason: `SMTP did not accept recipient ${toEmail}. rejected=${rejected}`,
        };
      }

      logger.log(`✓ Email accepted by SMTP for ${toEmail}`);
      if (previewUrl) {
        logger.log(`ℹ️ Test email preview URL: ${previewUrl}`);
      }

      return { success: true, previewUrl };
    } catch (error: any) {
      logger.error('Unexpected error while sending email via Nodemailer', error);
      return {
        success: false,
        reason: error?.message || 'unknown smtp error',
      };
    }
  }
}

export const emailService = new EmailService();
