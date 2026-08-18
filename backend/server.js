import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './db/pool.js';
import { 
  calculateWorkingDays, 
  calculateAccrual, 
  calculateAvailableBalance 
} from './leaveEngine.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// GET /users - returns all users
app.get('/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, manager_id as "managerId" FROM users ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /leave/requests - returns the requests made by a specific user
app.get('/leave/requests', async (req, res) => {
  const userId = parseInt(req.query.userId) || 1;
  try {
    const result = await pool.query(
      `SELECT lr.id, 
              lr.start_date as "startDate", 
              lr.end_date as "endDate", 
              lr.working_days as "workingDays", 
              lr.status, 
              lr.approver_id as "approverId", 
              u.name as "approverName" 
       FROM leave_requests lr 
       LEFT JOIN users u ON lr.approver_id = u.id 
       WHERE lr.user_id = $1 
       ORDER BY lr.id DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /leave/approvals - returns requests pending approval by the active user
app.get('/leave/approvals', async (req, res) => {
  const userId = parseInt(req.query.userId) || 1;
  try {
    const result = await pool.query(
      `SELECT lr.id, 
              lr.start_date as "startDate", 
              lr.end_date as "endDate", 
              lr.working_days as "workingDays", 
              lr.status, 
              u.name as "requesterName" 
       FROM leave_requests lr 
       JOIN users u ON lr.user_id = u.id 
       WHERE lr.approver_id = $1 AND lr.status IN ('PENDING', 'PENDING_TIER2') 
       ORDER BY lr.id DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /leave/apply - calculates working days and routes to direct manager
app.post('/leave/apply', async (req, res) => {
  const { startDate, endDate, userId } = req.body;

  if (!startDate || !endDate || !userId) {
    return res.status(400).json({ error: 'startDate, endDate, and userId are required' });
  }

  try {
    const workingDays = calculateWorkingDays(startDate, endDate);
    
    // Look up requester's direct manager
    const userRes = await pool.query('SELECT manager_id FROM users WHERE id = $1', [userId]);
    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const managerId = userRes.rows[0].manager_id;

    const result = await pool.query(
      'INSERT INTO leave_requests (user_id, start_date, end_date, working_days, status, approver_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, start_date as "startDate", end_date as "endDate", working_days as "workingDays", status, approver_id as "approverId"',
      [userId, startDate, endDate, workingDays, 'PENDING', managerId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /leave/balance - returns accrued, used, available balance dynamically
app.get('/leave/balance', async (req, res) => {
  const userId = parseInt(req.query.userId) || 1;
  try {
    const userRes = await pool.query(
      'SELECT join_date, accrual_rate_per_month FROM users WHERE id = $1',
      [userId]
    );

    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { join_date: joinDate, accrual_rate_per_month: accrualRate } = userRes.rows[0];

    const usedRes = await pool.query(
      "SELECT COALESCE(SUM(working_days), 0) AS used FROM leave_requests WHERE user_id = $1 AND status = 'APPROVED'",
      [userId]
    );

    const used = parseFloat(usedRes.rows[0].used);

    const accrued = calculateAccrual(joinDate, parseFloat(accrualRate));
    const available = calculateAvailableBalance(accrued, used);

    res.json({
      accrued,
      used,
      available
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /leave/requests/:id/approve - updates status based on working days threshold (> 3 days requires Tier 2)
app.patch('/leave/requests/:id/approve', async (req, res) => {
  const { id } = req.params;

  try {
    const reqRes = await pool.query('SELECT status, working_days, approver_id FROM leave_requests WHERE id = $1', [id]);
    if (reqRes.rowCount === 0) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    const { status: currentStatus, working_days: workingDays, approver_id: approverId } = reqRes.rows[0];

    if (currentStatus !== 'PENDING' && currentStatus !== 'PENDING_TIER2') {
      return res.status(409).json({ error: 'Leave request has already been decided' });
    }

    if (parseFloat(workingDays) > 3 && currentStatus === 'PENDING') {
      // Fetch manager's manager (Bob's manager is Alice, ID 3)
      const managerRes = await pool.query('SELECT manager_id FROM users WHERE id = $1', [approverId]);
      const nextApproverId = managerRes.rows[0]?.manager_id || null;

      const result = await pool.query(
        "UPDATE leave_requests SET status = 'PENDING_TIER2', approver_id = $1 WHERE id = $2 AND status = 'PENDING' RETURNING id, start_date as \"startDate\", end_date as \"endDate\", working_days as \"workingDays\", status, approver_id as \"approverId\"",
        [nextApproverId, id]
      );
      
      if (result.rowCount === 0) {
        return res.status(409).json({ error: 'Leave request has already been decided' });
      }

      return res.json(result.rows[0]);
    } else {
      const result = await pool.query(
        "UPDATE leave_requests SET status = 'APPROVED', approver_id = NULL WHERE id = $1 AND status = $2 RETURNING id, start_date as \"startDate\", end_date as \"endDate\", working_days as \"workingDays\", status, approver_id as \"approverId\"",
        [id, currentStatus]
      );

      if (result.rowCount === 0) {
        return res.status(409).json({ error: 'Leave request has already been decided' });
      }

      return res.json(result.rows[0]);
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /leave/requests/:id/reject - updates status to REJECTED (from either PENDING state)
app.patch('/leave/requests/:id/reject', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "UPDATE leave_requests SET status = 'REJECTED', approver_id = NULL WHERE id = $1 AND status IN ('PENDING', 'PENDING_TIER2') RETURNING id, start_date as \"startDate\", end_date as \"endDate\", working_days as \"workingDays\", status, approver_id as \"approverId\"",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(409).json({ error: 'Leave request has already been decided' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`LMD Backend listening at http://localhost:${port}`);
});
