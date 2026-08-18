import { pool } from '../db/pool.js';

/**
 * Checks whether targetUserId is in the downstream organizational hierarchy of callerId (or is callerId itself)
 * Uses PostgreSQL WITH RECURSIVE
 * @param {number} callerId 
 * @param {number} targetUserId 
 * @returns {Promise<boolean>}
 */
export async function isInDownstreamHierarchy(callerId, targetUserId) {
  const cId = parseInt(callerId);
  const tId = parseInt(targetUserId);

  if (!cId || !tId) return false;
  if (cId === tId) return true;

  try {
    // Check if caller is System Admin
    const adminCheck = await pool.query('SELECT is_admin FROM users WHERE id = $1', [cId]);
    if (adminCheck.rows[0]?.is_admin) return true;

    const query = `
      WITH RECURSIVE downstream AS (
        SELECT id, manager_id
        FROM users
        WHERE manager_id = $1

        UNION ALL

        SELECT u.id, u.manager_id
        FROM users u
        JOIN downstream d ON u.manager_id = d.id
      )
      SELECT 1 FROM downstream WHERE id = $2 LIMIT 1;
    `;

    const result = await pool.query(query, [cId, tId]);
    return result.rowCount > 0;
  } catch (err) {
    console.error('Error checking hierarchy downstream access:', err.message);
    return false;
  }
}

/**
 * Retrieves all downstream users at any depth under managerId using WITH RECURSIVE
 * @param {number} managerId 
 * @returns {Promise<Array>}
 */
export async function getDownstreamUsers(managerId) {
  const mId = parseInt(managerId);
  if (!mId) return [];

  const query = `
    WITH RECURSIVE team_tree AS (
      -- Anchor: direct reports
      SELECT u.id, u.name, u.email, u.role, u.employment_type, u.join_date, u.region, u.manager_id,
             mgr.name as manager_name, mgr.role as manager_role, 1 as depth
      FROM users u
      LEFT JOIN users mgr ON u.manager_id = mgr.id
      WHERE u.manager_id = $1

      UNION ALL

      -- Recursive: indirect reports
      SELECT u.id, u.name, u.email, u.role, u.employment_type, u.join_date, u.region, u.manager_id,
             mgr.name as manager_name, mgr.role as manager_role, tt.depth + 1
      FROM users u
      JOIN team_tree tt ON u.manager_id = tt.id
      LEFT JOIN users mgr ON u.manager_id = mgr.id
    )
    SELECT * FROM team_tree ORDER BY depth ASC, name ASC;
  `;

  const result = await pool.query(query, [mId]);
  return result.rows;
}
