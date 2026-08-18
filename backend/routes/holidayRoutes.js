import { Router } from 'express';
import { getHolidays, createHoliday, bulkUpsertHolidays, deleteHoliday } from '../controllers/holidayController.js';

const router = Router();

router.get('/', getHolidays);
router.post('/', createHoliday);
router.post('/bulk', bulkUpsertHolidays);
router.delete('/:id', deleteHoliday);

export default router;
