import { Router } from 'express';
import { getUsers, createEmployee, updateEmployee, updateAvailability } from '../controllers/userController.js';

const router = Router();

router.get('/', getUsers);
router.post('/', createEmployee);
router.put('/:id', updateEmployee);
router.patch('/:id/availability', updateAvailability);

export default router;
