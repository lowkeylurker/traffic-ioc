import { v2 as cloudinary } from 'cloudinary';

let configured = false;

const ensureCloudinaryConfig = () => {
  if (configured) {
    return;
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Cloudinary configuration is missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.'
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });

  configured = true;
};

export const uploadIncidentImage = async (fileBuffer: Buffer, fileName: string): Promise<string> => {
  ensureCloudinaryConfig();

  const uploaded = await new Promise<{ secure_url?: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: process.env.CLOUDINARY_INCIDENT_FOLDER || 'traffic-ioc/incidents',
        public_id: fileName,
        resource_type: 'image',
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result || {});
      }
    );

    stream.end(fileBuffer);
  });

  if (!uploaded.secure_url) {
    throw new Error('Cloudinary upload failed. secure_url was not returned.');
  }

  return uploaded.secure_url;
};

export const uploadRawFileBuffer = async (fileBuffer: Buffer, fileName: string): Promise<string> => {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      console.log(`⚠️ [CLOUDINARY MOCK] Thiếu cấu hình Cloudinary. Fallback sang mock URL.`);
      return `https://res.cloudinary.com/mock-cloud/raw/upload/v1234567890/mock_${fileName}`;
    }

    ensureCloudinaryConfig();

    const uploaded = await new Promise<{ secure_url?: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: process.env.CLOUDINARY_CSV_FOLDER || 'traffic-ioc/csv-reports',
          public_id: fileName.replace(/\.csv$/i, ''),
          resource_type: 'raw',
        },
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(result || {});
        }
      );

      stream.end(fileBuffer);
    });

    if (!uploaded.secure_url) {
      throw new Error('Cloudinary secure_url was not returned.');
    }

    return uploaded.secure_url;
  } catch (error: any) {
    console.error(`❌ [CLOUDINARY ERROR] Upload thất bại: ${error.message}. Fallback sang mock URL.`);
    return `https://res.cloudinary.com/mock-cloud/raw/upload/v1234567890/mock_${fileName}`;
  }
};

