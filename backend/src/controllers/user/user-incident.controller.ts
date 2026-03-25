import { NextFunction, Request, Response } from 'express';
import { uploadIncidentImage } from '../../services/user/cloudinary.service';
import { userIncidentService } from '../../services/user/user-incident.service';
import { ResponseUtil } from '../../utils/response';

type AuthedRequest = Request & {
  auth?: {
    userId?: string;
    sessionClaims?: any;
  };
  file?: Express.Multer.File;
};

const parseNumber = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error('Invalid numeric value');
  }

  return parsed;
};

export class UserIncidentController {
  async getNews(req: Request, res: Response, _next: NextFunction) {
    try {
      const lat = parseNumber(req.query.lat);
      const lng = parseNumber(req.query.long);
      const radiusKm = req.query.radius ? parseNumber(req.query.radius) : undefined;

      const items = await userIncidentService.getNews(lat, lng, radiusKm);
      return res.json(ResponseUtil.success({ items }, 'News feed fetched successfully'));
    } catch (error) {
      return res.status(400).json(ResponseUtil.badRequest((error as Error).message));
    }
  }

  async submitReport(req: AuthedRequest, res: Response, _next: NextFunction) {
    try {
      const reporterId = req.auth?.userId;
      if (!reporterId) {
        return res.status(401).json(ResponseUtil.error('Authentication required', 401));
      }

      const lat = parseNumber(req.body.lat);
      const lng = parseNumber(req.body.long);
      const incidentType = String(req.body.incidentType || '');
      const description = typeof req.body.description === 'string' ? req.body.description : undefined;

      let imageUrl: string | null = null;
      if (req.file?.buffer) {
        const safeName = `${Date.now()}-${reporterId}`;
        imageUrl = await uploadIncidentImage(req.file.buffer, safeName);
      }

      const created = await userIncidentService.submitReport({
        reporterId,
        incidentType,
        lat,
        lng,
        description,
        imageUrl,
      });

      return res.status(201).json(
        ResponseUtil.success(
          {
            reportId: created.reportId,
            status: created.status,
            message: 'Cảm ơn, báo cáo đang chờ duyệt',
          },
          'Report submitted successfully',
          201
        )
      );
    } catch (error) {
      return res.status(400).json(ResponseUtil.badRequest((error as Error).message));
    }
  }

  async updateOwnReport(req: AuthedRequest, res: Response, _next: NextFunction) {
    try {
      const reporterId = req.auth?.userId;
      if (!reporterId) {
        return res.status(401).json(ResponseUtil.error('Authentication required', 401));
      }

      const { id } = req.params;
      const incidentType = req.body.incidentType as string | undefined;

      let imageUrl: string | null | undefined;
      if (req.file?.buffer) {
        const safeName = `${Date.now()}-${reporterId}`;
        imageUrl = await uploadIncidentImage(req.file.buffer, safeName);
      }

      await userIncidentService.updateOwnReport({
        incidentId: id,
        reporterId,
        incidentType,
        imageUrl,
      });

      return res.json(ResponseUtil.success(null, 'Report updated successfully'));
    } catch (error) {
      return res.status(400).json(ResponseUtil.badRequest((error as Error).message));
    }
  }

  async getOwnReports(req: AuthedRequest, res: Response, _next: NextFunction) {
    try {
      const reporterId = req.auth?.userId;
      if (!reporterId) {
        return res.status(401).json(ResponseUtil.error('Authentication required', 401));
      }

      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const items = await userIncidentService.getOwnReports(reporterId, status);
      return res.json(ResponseUtil.success({ items }, 'Own reports fetched successfully'));
    } catch (error) {
      return res.status(400).json(ResponseUtil.badRequest((error as Error).message));
    }
  }

  async getReportsForAdmin(req: Request, res: Response, _next: NextFunction) {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const items = await userIncidentService.getReportsForAdmin(status);
      return res.json(ResponseUtil.success({ items }, 'Citizen reports fetched successfully'));
    } catch (error) {
      return res.status(400).json(ResponseUtil.badRequest((error as Error).message));
    }
  }

  async moderateReport(req: Request, res: Response, _next: NextFunction) {
    try {
      const authedReq = req as AuthedRequest;
      const { id } = req.params;
      const status = String(req.body.status || '');
      const moderationNote = typeof req.body.note === 'string' ? req.body.note : undefined;
      const moderatorId = authedReq.auth?.userId;

      await userIncidentService.moderateReport(id, status, moderatorId, moderationNote);
      return res.json(ResponseUtil.success(null, 'Report moderation status updated'));
    } catch (error) {
      return res.status(400).json(ResponseUtil.badRequest((error as Error).message));
    }
  }
}

export const userIncidentController = new UserIncidentController();
