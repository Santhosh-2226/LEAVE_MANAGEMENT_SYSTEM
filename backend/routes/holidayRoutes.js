import { Router } from 'express';
import { getHolidays, bulkUpsertHolidays, deleteHoliday } from '../controllers/holidayController.js';

const router = Router();

router.get('/', getHolidays);
router.post('/bulk', bulkUpsertHolidays);
router.delete('/:id', deleteHoliday);

export default router;
