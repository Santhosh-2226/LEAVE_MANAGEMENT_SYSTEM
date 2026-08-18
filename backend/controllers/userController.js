import { pool } from '../db/pool.js';

export async function getUsers(req, res) {
  try {
    const result = await pool.query('SELECT id, name, manager_id as "managerId", region FROM users ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
