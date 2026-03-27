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
