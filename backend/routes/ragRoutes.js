import { Router } from 'express';
import { askQuestion, getAllPolicyHandbook } from '../controllers/ragController.js';

const router = Router();

router.post('/ask', askQuestion);
router.get('/handbook', getAllPolicyHandbook);

export default router;
