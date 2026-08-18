import { pool } from '../db/pool.js';

export async function getUsers(req, res) {
  try {
    const result = await pool.query(
      `SELECT u.id,
              u.name,
              u.email,
              u.role,
              u.is_admin as "isAdmin",
              u.employment_type as "employmentType",
              u.availability_status as "availabilityStatus",
              u.delegate_id as "delegateId",
              d.name as "delegateName",
              d.role as "delegateRole",
              u.manager_id as "managerId",
              m.name as "managerName",
              m.role as "managerRole",
              u.join_date::text as "joinDate",
              u.region,
              EXISTS (
                SELECT 1 FROM leave_requests lr
                WHERE lr.user_id = u.id
                  AND lr.status = 'APPROVED'
                  AND CURRENT_DATE BETWEEN lr.start_date AND lr.end_date
              ) as is_on_leave_today
       FROM users u
       LEFT JOIN users d ON u.delegate_id = d.id
       LEFT JOIN users m ON u.manager_id = m.id
       ORDER BY u.id ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Stage 18: Live dynamic availability calculation derived from approved leave overlapping CURRENT_DATE
 * GET /users/:id/availability
 */
export async function getAvailability(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM leave_requests
         WHERE user_id = $1
           AND status = 'APPROVED'
           AND CURRENT_DATE BETWEEN start_date AND end_date
       ) as is_unavl`,
      [id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
    const isUnavl = result.rows[0]?.is_unavl;
    return res.json({ status: isUnavl ? 'UNAVL' : 'AVL' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createEmployee(req, res) {
  const { name, email, role, employmentType, managerId, joinDate, region } = req.body;
  if (!name || !role || !joinDate) {
    return res.status(400).json({ error: 'Name, role, and joinDate are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, role, is_admin, employment_type, availability_status, manager_id, join_date, region)
       VALUES ($1, $2, $3, false, $4, 'AVL', $5, $6, $7)
       RETURNING id, name, email, role, is_admin as "isAdmin", employment_type as "employmentType",
                 availability_status as "availabilityStatus", manager_id as "managerId", join_date::text as "joinDate", region`,
      [
        name.trim(),
        email ? email.trim() : null,
        role,
        employmentType || 'Full-Time',
        managerId ? parseInt(managerId) : null,
        joinDate,
        region || 'US'
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function updateEmployee(req, res) {
  const { id } = req.params;
  const { name, email, role, employmentType, managerId, region } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           role = COALESCE($3, role),
           employment_type = COALESCE($4, employment_type),
           manager_id = $5,
           region = COALESCE($6, region)
       WHERE id = $7
       RETURNING id, name, email, role, employment_type as "employmentType", manager_id as "managerId", region`,
      [
        name ? name.trim() : null,
        email ? email.trim() : null,
        role || null,
        employmentType || null,
        managerId !== undefined ? (managerId ? parseInt(managerId) : null) : null,
        region || null,
        id
      ]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Employee not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function updateAvailability(req, res) {
  const { id } = req.params;
  const { availabilityStatus, delegateId } = req.body;

  if (!availabilityStatus || !['AVL', 'UN_AVL'].includes(availabilityStatus)) {
    return res.status(400).json({ error: 'availabilityStatus must be AVL or UN_AVL' });
  }

  const finalDelegateId = availabilityStatus === 'UN_AVL' && delegateId ? parseInt(delegateId) : null;

  try {
    const result = await pool.query(
      `UPDATE users
       SET availability_status = $1,
           delegate_id = $2
       WHERE id = $3
       RETURNING id, name, role, availability_status as "availabilityStatus", delegate_id as "delegateId"`,
      [availabilityStatus, finalDelegateId, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
