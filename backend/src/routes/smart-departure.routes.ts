import { Router } from 'express';
import { smartDepartureController } from '../controllers/smart-departure.controller';

const router = Router();

router.post('/smart-departure', (req, res, next) => smartDepartureController.getSuggestions(req, res, next));

export default router;
