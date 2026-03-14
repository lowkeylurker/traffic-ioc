import { Request, Response, NextFunction } from 'express';
import { incidentService } from '../services/incident.service';
import { HTTP_STATUS, RESPONSE_MESSAGES } from '../constants/messages';
import { Logger } from '../utils/logger';

const logger = new Logger('IncidentController');

export class IncidentController {
    /**
     * Get verified incidents
     */
    async getIncidents(req: Request, res: Response, next: NextFunction) {
        try {
            const incidents = await incidentService.getVerifiedIncidents();

            // Serialize BigInt
            const serializedIncidents = incidents.map((inc: any) => ({
                ...inc,
                incident_key: inc.incident_key.toString(),
                segment_key: inc.segment_key.toString(),
                location_key: inc.location_key?.toString(),
            }));

            return res.status(HTTP_STATUS.OK).json({
                success: true,
                statusCode: HTTP_STATUS.OK,
                data: serializedIncidents,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * User report incident
     */
    async reportIncident(req: Request & { auth?: any; file?: any }, res: Response, next: NextFunction) {
        try {
            const {
                incident_type,
                segment_key,
                location_key,
                severity_level,
                description,
            } = req.body;

            const userId = req.auth?.userId;
            if (!userId) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    statusCode: HTTP_STATUS.UNAUTHORIZED,
                    message: 'Unauthorized: User ID not found',
                });
            }

            const imageUrl = req.file?.path;

            const incident = await incidentService.reportIncident({
                incident_type,
                segment_key: segment_key ? BigInt(segment_key) : undefined,
                location_key: location_key ? BigInt(location_key) : undefined,
                severity_level: severity_level ? parseInt(severity_level) : undefined,
                description,
                image_url: imageUrl,
                reporter_id: userId,
                timestamp: new Date(),
            });

            return res.status(HTTP_STATUS.CREATED).json({
                success: true,
                statusCode: HTTP_STATUS.CREATED,
                message: RESPONSE_MESSAGES.CREATED,
                data: {
                    ...incident,
                    incident_key: incident.incident_key.toString(),
                    segment_key: incident.segment_key.toString(),
                    location_key: incident.location_key?.toString(),
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Update incident
     */
    async updateIncident(req: Request & { auth?: any }, res: Response, next: NextFunction) {
        try {
            const { incident_key, date_key } = req.params;
            const userId = req.auth?.userId;
            const isAdmin = (req.auth?.sessionClaims?.publicMetadata as any)?.role === 'admin';

            if (!userId) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    statusCode: HTTP_STATUS.UNAUTHORIZED,
                    message: 'Unauthorized',
                });
            }

            const updated = await incidentService.updateIncident(
                {
                    incident_key: BigInt(incident_key),
                    date_key: parseInt(date_key)
                },
                req.body,
                userId,
                isAdmin
            );

            return res.status(HTTP_STATUS.OK).json({
                success: true,
                statusCode: HTTP_STATUS.OK,
                data: {
                    ...updated,
                    incident_key: updated.incident_key.toString(),
                    segment_key: updated.segment_key.toString(),
                    location_key: updated.location_key?.toString(),
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            if (error.message.includes('Forbidden')) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    statusCode: HTTP_STATUS.FORBIDDEN,
                    message: error.message,
                });
            }
            next(error);
        }
    }
}

export const incidentController = new IncidentController();
