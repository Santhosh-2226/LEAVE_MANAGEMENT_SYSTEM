import { Router } from 'express';
import { getPolicies, updatePolicies } from '../controllers/policyController.js';

const router = Router();

router.get('/', getPolicies);
router.put('/', updatePolicies);
router.post('/', updatePolicies);

export default router;
