import { Router } from 'express';
import { getRequests, getApprovals, applyLeave, getBalance, approveLeave, rejectLeave } from '../controllers/leaveController.js';

const router = Router();

router.get('/requests', getRequests);
router.get('/approvals', getApprovals);
router.get('/balance', getBalance);
router.post('/apply', applyLeave);
router.patch('/requests/:id/approve', approveLeave);
router.patch('/requests/:id/reject', rejectLeave);

export default router;
