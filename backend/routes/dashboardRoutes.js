import { Router } from 'express';
import { getTeamDashboard } from '../controllers/dashboardController.js';

const router = Router();

router.get('/team/:managerId', getTeamDashboard);

export default router;
