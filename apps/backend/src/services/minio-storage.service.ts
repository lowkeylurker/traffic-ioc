import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { Logger } from '../utils/logger';

const logger = new Logger('MinioStorageService');

export class MinioStorageService {
  private s3Client: S3Client;
  private bucket: string;
  private initialized: boolean = false;

  constructor() {
    const endpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
    const accessKeyId = process.env.MINIO_ROOT_USER || process.env.MINIO_ACCESS_KEY || 'minioadmin';
    const secretAccessKey = process.env.MINIO_ROOT_PASSWORD || process.env.MINIO_SECRET_KEY || 'minioadmin';
    this.bucket = process.env.MINIO_BUCKET || 'traffic-ioc-documents';

    const formattedEndpoint = endpoint.startsWith('http://') || endpoint.startsWith('https://')
      ? endpoint
      : `http://${endpoint}:${process.env.MINIO_PORT || '9000'}`;

    this.s3Client = new S3Client({
      endpoint: formattedEndpoint,
      region: 'us-east-1',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  public async ensureBucket(): Promise<void> {
    if (this.initialized) return;
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.initialized = true;
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        try {
          await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucket }));
          logger.info(`✓ MinIO bucket '${this.bucket}' created successfully.`);
          this.initialized = true;
        } catch (createErr: any) {
          logger.warn(`Could not create MinIO bucket '${this.bucket}': ${createErr.message}`);
        }
      } else {
        logger.warn(`MinIO bucket check notice: ${err.message}`);
      }
    }
  }

  /**
   * Upload file buffer to MinIO bucket
   * @returns Object storage key, e.g. "laws/ND-100-2019/file.pdf"
   */
  public async uploadFile(
    storageKey: string,
    buffer: Buffer,
    contentType: string = 'application/octet-stream'
  ): Promise<{ bucket: string; storageKey: string }> {
    await this.ensureBucket();
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
          Body: buffer,
          ContentType: contentType,
        })
      );
      logger.info(`✓ Uploaded file to MinIO: s3://${this.bucket}/${storageKey}`);
      return { bucket: this.bucket, storageKey };
    } catch (error: any) {
      logger.error(`Failed to upload to MinIO (${storageKey}):`, error);
      throw error;
    }
  }

  public getBucketName(): string {
    return this.bucket;
  }
}

export const minioStorageService = new MinioStorageService();
