import { prisma } from '../config/prisma';
import { Logger } from '../utils/logger';
import { IncidentSource, IncidentStatus } from '@prisma/client';

const logger = new Logger('IncidentService');

export class IncidentService {
    /**
     * get verified incidents
     */
    async getVerifiedIncidents() {
        try {
            return await prisma.fact_incident.findMany({
                where: {
                    status: IncidentStatus.VERIFIED,
                },
                orderBy: {
                    timestamp: 'desc',
                },
            });
        } catch (error) {
            logger.error('Error fetching verified incidents:', error);
            throw error;
        }
    }

    /**
     * User report incident
     */
    async reportIncident(data: {
        incident_type: string;
        description?: string;
        segment_key?: bigint;
        location_key?: bigint;
        severity_level?: number;
        image_url?: string;
        reporter_id: string;
        timestamp: Date;
    }) {
        try {
            const now = data.timestamp || new Date();
            const dateKey = parseInt(now.toISOString().split('T')[0].replace(/-/g, ''));
            const timeKey = now.getHours() * 100 + now.getMinutes();

            // create incident_key random based on time (BigInt)
            const incidentKey = BigInt(Date.now());

            return await prisma.fact_incident.create({
                data: {
                    incident_key: incidentKey,
                    date_key: dateKey,
                    time_key: timeKey,
                    timestamp: now,
                    incident_type: data.incident_type,
                    segment_key: data.segment_key || BigInt(0),
                    location_key: data.location_key,
                    severity_level: data.severity_level || 1,
                    image_url: data.image_url,
                    reporter_id: data.reporter_id,
                    source: IncidentSource.USER_REPORT,
                    status: IncidentStatus.PENDING,
                    upvotes: 0,
                    quality_flag: 1,
                },
            });
        } catch (error) {
            logger.error('Error reporting incident:', error);
            throw error;
        }
    }

    /**
     * Update incident (only reporter or admin)
     */
    async updateIncident(id: { incident_key: bigint; date_key: number }, data: any, userId: string, isAdmin: boolean) {
        try {
            const incident = await prisma.fact_incident.findUnique({
                where: {
                    incident_key_date_key: id,
                },
            });

            if (!incident) throw new Error('Incident not found');

            // Check permissions
            if (!isAdmin && incident.reporter_id !== userId) {
                throw new Error('Forbidden: You can only update your own reports');
            }

            return await prisma.fact_incident.update({
                where: {
                    incident_key_date_key: id,
                },
                data: data,
            });
        } catch (error) {
            logger.error('Error updating incident:', error);
            throw error;
        }
    }

    /**
     * Handle upvote
     */
    async upvoteIncident(id: { incident_key: bigint; date_key: number }) {
        try {
            return await prisma.fact_incident.update({
                where: {
                    incident_key_date_key: id,
                },
                data: {
                    upvotes: {
                        increment: 1,
                    },
                },
            });
        } catch (error) {
            logger.error('Error upvoting incident:', error);
            throw error;
        }
    }
}

export const incidentService = new IncidentService();
