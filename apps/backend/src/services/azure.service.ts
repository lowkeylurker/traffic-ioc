import {
  BlobSASPermissions,
  BlobServiceClient,
  SASProtocol,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';
import { Logger } from '../utils/logger';

const logger = new Logger('AzureService');

export class AzureService {
  private blobServiceClient: BlobServiceClient | null = null;

  private sharedKeyCredential: StorageSharedKeyCredential | null = null;

  private containerName = 'csv-reports';

  constructor() {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (connectionString) {
      try {
        this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

        const accountNameMatch = connectionString.match(/AccountName=([^;]+)/i);
        const accountKeyMatch = connectionString.match(/AccountKey=([^;]+)/i);

        if (accountNameMatch && accountKeyMatch) {
          this.sharedKeyCredential = new StorageSharedKeyCredential(
            accountNameMatch[1],
            accountKeyMatch[1]
          );
        }

        logger.log('✓ Azure Blob Storage Service initialized successfully.');
      } catch (error: any) {
        logger.error('❌ Failed to initialize Azure Blob Client from Connection String', error);
      }
    } else {
      logger.warn('⚠️ AZURE_STORAGE_CONNECTION_STRING is missing. Azure Storage will run in MOCK mode.');
    }
  }

  private buildDownloadUrl(blobName: string, blobUrl: string): string {
    if (!this.sharedKeyCredential) {
      return blobUrl;
    }

    const expiresOn = new Date(Date.now() + 1000 * 60 * 60 * 24);
    const sas = generateBlobSASQueryParameters(
      {
        containerName: this.containerName,
        blobName,
        permissions: BlobSASPermissions.parse('r'),
        startsOn: new Date(Date.now() - 5 * 60 * 1000),
        expiresOn,
        protocol: SASProtocol.Https,
      },
      this.sharedKeyCredential
    ).toString();

    return `${blobUrl}?${sas}`;
  }

  /**
   * Tải file CSV buffer lên Azure Blob Storage và trả về đường dẫn tải
   * @param fileBuffer Nội dung buffer file CSV thô
   * @param fileName Tên file (ví dụ: traffic_report_2026.csv)
   */
  async uploadCsvBuffer(fileBuffer: Buffer, fileName: string): Promise<string> {
    try {
      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
      if (!connectionString || !this.blobServiceClient) {
        logger.log('⚠️ [AZURE MOCK] Thiếu cấu hình Azure Storage. Fallback sang mock URL.');
        return `https://mockaccount.blob.core.windows.net/${this.containerName}/mock_${fileName}`;
      }

      const containerClient = this.blobServiceClient.getContainerClient(this.containerName);

      // Không yêu cầu public access; account có thể đang chặn toàn bộ anonymous access.
      await containerClient.createIfNotExists();

      const blockBlobClient = containerClient.getBlockBlobClient(fileName);
      await blockBlobClient.uploadData(fileBuffer, {
        blobHTTPHeaders: {
          blobContentType: 'text/csv',
        },
      });

      const downloadUrl = this.buildDownloadUrl(fileName, blockBlobClient.url);
      logger.log(`✓ CSV file uploaded successfully to Azure Blob: ${blockBlobClient.url}`);
      return downloadUrl;
    } catch (error: any) {
      logger.error(`❌ [AZURE STORAGE ERROR] Upload thất bại: ${error.message}. Fallback sang mock URL.`);
      return `https://mockaccount.blob.core.windows.net/${this.containerName}/mock_${fileName}`;
    }
  }
}

export const azureService = new AzureService();
