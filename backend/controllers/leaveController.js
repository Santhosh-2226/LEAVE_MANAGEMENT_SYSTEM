import { pool } from '../db/pool.js';
import { calculateAccrual, calculateAvailableBalance, calculateWorkingDays } from '../leaveEngine.js';

async function getHolidaysForRegion(region) {
  const result = await pool.query(
    'SELECT holiday_date FROM holidays WHERE region = $1',
    [region]
  );
  return result.rows.map(r => r.holiday_date.toISOString().split('T')[0]);
}

export async function getRequests(req, res) {
  const userId = parseInt(req.query.userId) || 1;
  try {
    const result = await pool.query(
      `SELECT lr.id,
              lr.start_date as "startDate",
              lr.end_date as "endDate",
              lr.working_days as "workingDays",
              lr.leave_type as "leaveType",
              lr.reason,
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
}

export async function getApprovals(req, res) {
  const userId = parseInt(req.query.userId) || 1;
  try {
    const result = await pool.query(
      `SELECT lr.id,
              lr.start_date as "startDate",
              lr.end_date as "endDate",
              lr.working_days as "workingDays",
              lr.leave_type as "leaveType",
              lr.reason,
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
}

export async function applyLeave(req, res) {
  const { startDate, endDate, userId, leaveType, reason, emergency } = req.body;
  if (!startDate || !endDate || !userId || !leaveType) {
    return res.status(400).json({ error: 'startDate, endDate, userId, and leaveType are required' });
  }
  try {
    const userRes = await pool.query('SELECT manager_id, region FROM users WHERE id = $1', [userId]);
    if (userRes.rowCount === 0) return res.status(404).json({ error: 'User not found' });

    const { manager_id: managerId, region } = userRes.rows[0];
    const holidayDates = await getHolidaysForRegion(region);
    const workingDays = calculateWorkingDays(startDate, endDate, holidayDates);

    // basic validation
    const sDate = new Date(startDate);
    const eDate = new Date(endDate);
    if (isNaN(sDate.getTime()) || isNaN(eDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format for startDate or endDate' });
    }
    if (sDate > eDate) return res.status(400).json({ error: 'startDate must be on or before endDate' });

    // determine if the request is for past dates
    const today = new Date();
    const todayYmd = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endYmd = new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate());
    const isPast = endYmd < todayYmd;

    // Past-date leaves are only allowed for emergencies and are auto-approved
    let status = 'PENDING';
    let approverToUse = managerId;
    let finalReason = reason || null;
    const isEmergency = emergency === true || emergency === 'true' || emergency === '1' || emergency === 1;

    if (isPast && !isEmergency) {
      return res.status(400).json({ error: 'Applying leave for past dates is allowed only for emergency cases. Set `emergency` flag.' });
    }

    if (isPast && isEmergency) {
      status = 'APPROVED';
      approverToUse = null; // auto-approved, no approver
      finalReason = finalReason ? `(EMERGENCY) ${finalReason}` : '(EMERGENCY)';
    }

    const result = await pool.query(
      `INSERT INTO leave_requests (user_id, start_date, end_date, working_days, leave_type, reason, status, approver_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, start_date as "startDate", end_date as "endDate", working_days as "workingDays",
                 leave_type as "leaveType", reason, status, approver_id as "approverId"`,
      [userId, startDate, endDate, workingDays, leaveType, finalReason, status, approverToUse]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function getBalance(req, res) {
  const userId = parseInt(req.query.userId) || 1;
  try {
    const userRes = await pool.query(
      'SELECT join_date, accrual_rate_per_month FROM users WHERE id = $1',
      [userId]
    );
    if (userRes.rowCount === 0) return res.status(404).json({ error: 'User not found' });

    const { join_date: joinDate, accrual_rate_per_month: accrualRate } = userRes.rows[0];
    const usedRes = await pool.query(
      "SELECT COALESCE(SUM(working_days), 0) AS used FROM leave_requests WHERE user_id = $1 AND status = 'APPROVED'",
      [userId]
    );
    const used = parseFloat(usedRes.rows[0].used);
    const accrued = calculateAccrual(joinDate, parseFloat(accrualRate));
    const available = calculateAvailableBalance(accrued, used);
    res.json({ accrued, used, available });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function approveLeave(req, res) {
  const { id } = req.params;
  try {
    const reqRes = await pool.query('SELECT status, working_days, approver_id FROM leave_requests WHERE id = $1', [id]);
    if (reqRes.rowCount === 0) return res.status(404).json({ error: 'Leave request not found' });

    const { status: currentStatus, working_days: workingDays, approver_id: approverId } = reqRes.rows[0];
    if (currentStatus !== 'PENDING' && currentStatus !== 'PENDING_TIER2') {
      return res.status(409).json({ error: 'Leave request has already been decided' });
    }

    if (parseFloat(workingDays) > 3 && currentStatus === 'PENDING') {
      const managerRes = await pool.query('SELECT manager_id FROM users WHERE id = $1', [approverId]);
      const nextApproverId = managerRes.rows[0]?.manager_id || null;
      const result = await pool.query(
        `UPDATE leave_requests SET status = 'PENDING_TIER2', approver_id = $1
         WHERE id = $2 AND status = 'PENDING'
         RETURNING id, start_date as "startDate", end_date as "endDate", working_days as "workingDays", status, approver_id as "approverId"`,
        [nextApproverId, id]
      );
      if (result.rowCount === 0) return res.status(409).json({ error: 'Leave request has already been decided' });
      return res.json(result.rows[0]);
    } else {
      const result = await pool.query(
        `UPDATE leave_requests SET status = 'APPROVED', approver_id = NULL
         WHERE id = $1 AND status = $2
         RETURNING id, start_date as "startDate", end_date as "endDate", working_days as "workingDays", status, approver_id as "approverId"`,
        [id, currentStatus]
      );
      if (result.rowCount === 0) return res.status(409).json({ error: 'Leave request has already been decided' });
      return res.json(result.rows[0]);
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function rejectLeave(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE leave_requests SET status = 'REJECTED', approver_id = NULL
       WHERE id = $1 AND status IN ('PENDING', 'PENDING_TIER2')
       RETURNING id, start_date as "startDate", end_date as "endDate", working_days as "workingDays", status, approver_id as "approverId"`,
      [id]
    );
    if (result.rowCount === 0) return res.status(409).json({ error: 'Leave request has already been decided' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
