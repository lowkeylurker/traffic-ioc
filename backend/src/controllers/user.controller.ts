import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import cloudinary from '../config/cloudinary.config';
import { ResponseUtil } from '../utils/response';
import { Logger } from '../utils/logger';
import { Readable } from 'stream';

const logger = new Logger('UserController');

/**
 * Tính khoảng cách Haversine giữa 2 điểm (km)
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // Bán kính Trái Đất trung bình (km)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export class UserController {
    /**
     * POST /api/v1/user/report - Báo cáo sự cố từ người dùng
     */
    async reportIncident(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { userId, type, description, lat, lng } = req.body;
            let imageUrl = null;

            if (req.file) {
                logger.log('Uploading image to Cloudinary from buffer...');
                const uploadResult: any = await new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream(
                        { folder: 'user_reports' },
                        (error, result) => {
                            if (error) {
                                logger.error('Cloudinary upload error:', error);
                                reject(error);
                            } else {
                                resolve(result);
                            }
                        }
                    );
                    Readable.from(req.file!.buffer).pipe(stream);
                });
                imageUrl = uploadResult.secure_url;
                logger.log(`Image uploaded successfully: ${imageUrl}`);
            }

            const report = await prisma.userReport.create({
                data: {
                    userId,
                    type,
                    description,
                    lat: parseFloat(lat),
                    lng: parseFloat(lng),
                    imageUrl,
                    status: 'PENDING',
                },
            });

            res.status(201).json(ResponseUtil.created(report, 'Report submitted successfully'));
        } catch (error) {
            logger.error('Error reporting incident:', error);
            next(error);
        }
    }

    /**
     * GET /api/v1/user/news - Xem tin tức giao thông dựa trên vị trí
     */
    async getNews(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { lat, lng, radius } = req.query;

            if (!lat || !lng) {
                res.status(400).json(ResponseUtil.badRequest('Latitude and Longitude are required'));
                return;
            }

            const userLat = parseFloat(lat as string);
            const userLng = parseFloat(lng as string);
            const searchRadius = parseFloat(radius as string) || 5; // Mặc định 5km

            logger.log(`Fetching news for location: ${userLat}, ${userLng} within ${searchRadius}km`);

            const reports = await prisma.userReport.findMany({
                where: {
                    status: 'VERIFIED',
                },
            });

            const filteredReports = reports.filter(report => {
                const distance = calculateDistance(userLat, userLng, report.lat, report.lng);
                return distance <= searchRadius;
            });

            res.json(ResponseUtil.success(filteredReports, `Retrieved ${filteredReports.length} verified reports`));
        } catch (error) {
            logger.error('Error getting traffic news:', error);
            next(error);
        }
    }
}

export const userController = new UserController();
