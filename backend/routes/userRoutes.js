import { Router } from 'express';
import { getUsers, getAvailability, createEmployee, updateEmployee, updateAvailability } from '../controllers/userController.js';

const router = Router();

router.get('/', getUsers);
router.get('/:id/availability', getAvailability);
router.post('/', createEmployee);
router.put('/:id', updateEmployee);
router.patch('/:id/availability', updateAvailability);

export default router;
