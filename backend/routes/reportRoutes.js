import { Router } from 'express';
import { downloadUserReport } from '../controllers/reportController.js';

const router = Router();
router.get('/user/:userId/download', downloadUserReport);

export default router;
