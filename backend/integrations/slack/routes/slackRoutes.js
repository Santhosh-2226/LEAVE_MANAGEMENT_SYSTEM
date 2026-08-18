import { Router } from 'express';
import { authorize, callback, getStatus, disconnect } from '../controllers/slackOAuthController.js';

const router = Router();

router.get('/oauth/authorize', authorize);
router.get('/oauth/callback', callback);
router.get('/status', getStatus);
router.post('/disconnect', disconnect);

export default router;
