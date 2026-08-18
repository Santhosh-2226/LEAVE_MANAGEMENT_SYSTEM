import { pool } from '../db/pool.js';

export async function getPolicies(req, res) {
  try {
    const result = await pool.query('SELECT * FROM accrual_policies WHERE id = 1');
    if (result.rowCount === 0) {
      // Return defaults if not initialized
      return res.json({
        baseLeave: 10.0,
        employeeRate: 1.0,
        managerRate: 2.0,
        seniorManagerRate: 4.0,
        directorRate: 5.0,
        vpRate: 5.0,
        partTimeRate: 0.5
      });
    }
    const row = result.rows[0];
    res.json({
      id: row.id,
      baseLeave: parseFloat(row.base_leave),
      employeeRate: parseFloat(row.employee_rate),
      managerRate: parseFloat(row.manager_rate),
      seniorManagerRate: parseFloat(row.senior_manager_rate),
      directorRate: parseFloat(row.director_rate),
      vpRate: parseFloat(row.vp_rate),
      partTimeRate: parseFloat(row.part_time_rate),
      updatedAt: row.updated_at
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function updatePolicies(req, res) {
  const { baseLeave, employeeRate, managerRate, seniorManagerRate, directorRate, vpRate, partTimeRate } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO accrual_policies (id, base_leave, employee_rate, manager_rate, senior_manager_rate, director_rate, vp_rate, part_time_rate, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (id) DO UPDATE
       SET base_leave = EXCLUDED.base_leave,
           employee_rate = EXCLUDED.employee_rate,
           manager_rate = EXCLUDED.manager_rate,
           senior_manager_rate = EXCLUDED.senior_manager_rate,
           director_rate = EXCLUDED.director_rate,
           vp_rate = EXCLUDED.vp_rate,
           part_time_rate = EXCLUDED.part_time_rate,
           updated_at = now()
       RETURNING *`,
      [
        parseFloat(baseLeave) || 10.0,
        parseFloat(employeeRate) || 1.0,
        parseFloat(managerRate) || 2.0,
        parseFloat(seniorManagerRate) || 4.0,
        parseFloat(directorRate) || 5.0,
        parseFloat(vpRate) || 5.0,
        parseFloat(partTimeRate) || 0.5
      ]
    );

    const row = result.rows[0];
    res.json({
      message: 'Accrual policies updated successfully across all employees!',
      policies: {
        id: row.id,
        baseLeave: parseFloat(row.base_leave),
        employeeRate: parseFloat(row.employee_rate),
        managerRate: parseFloat(row.manager_rate),
        seniorManagerRate: parseFloat(row.senior_manager_rate),
        directorRate: parseFloat(row.director_rate),
        vpRate: parseFloat(row.vp_rate),
        partTimeRate: parseFloat(row.part_time_rate),
        updatedAt: row.updated_at
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
