import { pool } from '../db/pool.js';
import { calculateAccrual, calculateAvailableBalance, calculateWorkingDays, DEFAULT_POLICIES } from '../leaveEngine.js';
import { scheduleSlackStatusJobs } from '../integrations/slack/services/slackJobScheduler.js';

async function getHolidaysForRegion(region) {
  const result = await pool.query(
    'SELECT holiday_date FROM holidays WHERE region = $1',
    [region]
  );
  return result.rows.map(r => r.holiday_date.toISOString().split('T')[0]);
}

async function getActivePolicies() {
  try {
    const res = await pool.query('SELECT * FROM accrual_policies WHERE id = 1');
    if (res.rowCount > 0) {
      const r = res.rows[0];
      return {
        baseLeave: parseFloat(r.base_leave),
        employeeRate: parseFloat(r.employee_rate),
        managerRate: parseFloat(r.manager_rate),
        seniorManagerRate: parseFloat(r.senior_manager_rate),
        directorRate: parseFloat(r.director_rate),
        vpRate: parseFloat(r.vp_rate),
        partTimeRate: parseFloat(r.part_time_rate)
      };
    }
  } catch {
    // fallback
  }
  return DEFAULT_POLICIES;
}

// Helper to get full manager chain
async function getManagerChain(userId) {
  const chain = [];
  let currentId = userId;
  const visited = new Set();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const res = await pool.query(
      'SELECT id, name, role, availability_status as "availabilityStatus", delegate_id as "delegateId", manager_id as "managerId" FROM users WHERE id = $1',
      [currentId]
    );
    if (res.rowCount === 0) break;
    const user = res.rows[0];
    if (user.managerId) {
      const mgrRes = await pool.query(
        'SELECT id, name, role, availability_status as "availabilityStatus", delegate_id as "delegateId", manager_id as "managerId" FROM users WHERE id = $1',
        [user.managerId]
      );
      if (mgrRes.rowCount > 0) {
        const mgr = mgrRes.rows[0];
        chain.push(mgr);
        currentId = mgr.id;
      } else {
        break;
      }
    } else {
      break;
    }
  }
  return chain;
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
              u.name as "approverName",
              u.role as "approverRole",
              u.availability_status as "approverAvailability",
              del.name as "delegateName",
              lr.current_tier as "currentTier",
              lr.required_tiers as "requiredTiers",
              lr.approval_history as "approvalHistory",
              lr.decided_by as "decidedBy"
       FROM leave_requests lr
       LEFT JOIN users u ON lr.approver_id = u.id
       LEFT JOIN users del ON u.delegate_id = del.id AND u.availability_status = 'UN_AVL'
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
              lr.approver_id as "approverId",
              lr.current_tier as "currentTier",
              lr.required_tiers as "requiredTiers",
              lr.approval_history as "approvalHistory",
              u.name as "requesterName",
              u.role as "requesterRole",
              u.employment_type as "requesterEmploymentType",
              primary_app.name as "assignedApproverName",
              primary_app.role as "assignedApproverRole",
              CASE
                WHEN lr.approver_id != $1 AND primary_app.delegate_id = $1 THEN primary_app.name
                ELSE NULL
              END as "delegatingFor"
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       JOIN users primary_app ON lr.approver_id = primary_app.id
       WHERE lr.status = 'PENDING'
         AND (
           lr.approver_id = $1
           OR (primary_app.delegate_id = $1 AND primary_app.availability_status = 'UN_AVL')
         )
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
    const userRes = await pool.query('SELECT id, name, role, manager_id, region FROM users WHERE id = $1', [userId]);
    if (userRes.rowCount === 0) return res.status(404).json({ error: 'User not found' });

    const user = userRes.rows[0];
    const holidayDates = await getHolidaysForRegion(user.region);
    const workingDays = calculateWorkingDays(startDate, endDate, holidayDates);

    const sDate = new Date(startDate);
    const eDate = new Date(endDate);
    if (isNaN(sDate.getTime()) || isNaN(eDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format for startDate or endDate' });
    }
    if (sDate > eDate) return res.status(400).json({ error: 'startDate must be on or before endDate' });

    const today = new Date();
    const todayYmd = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endYmd = new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate());
    const isPast = endYmd < todayYmd;

    let finalLeaveType = leaveType;
    let status = 'PENDING';
    let currentApproverId = null;
    let requiredTiers = 1;
    let currentTier = 1;
    let decidedBy = null;
    let finalReason = reason ? reason.trim() : null;

    if (isPast) {
      finalLeaveType = 'Emergency Leave';
      status = 'APPROVED';
      decidedBy = 'Auto-Approved (Emergency Leave)';
      finalReason = finalReason ? `[EMERGENCY] ${finalReason}` : '[EMERGENCY]';
    } else {
      const managerChain = await getManagerChain(user.id);

      if (managerChain.length === 0) {
        status = 'APPROVED';
        decidedBy = `Self-Approved (${user.role})`;
      } else {
        if (workingDays < 3) {
          requiredTiers = 1;
        } else if (workingDays >= 3 && workingDays <= 7) {
          requiredTiers = Math.min(2, managerChain.length);
        } else {
          requiredTiers = managerChain.length;
        }

        currentApproverId = managerChain[0].id;
        currentTier = 1;
        status = 'PENDING';
      }
    }

    const result = await pool.query(
      `INSERT INTO leave_requests (
        user_id, start_date, end_date, working_days, leave_type, reason, status,
        approver_id, current_tier, required_tiers, approval_history, decided_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
       RETURNING id, start_date as "startDate", end_date as "endDate", working_days as "workingDays",
                 leave_type as "leaveType", reason, status, approver_id as "approverId",
                 current_tier as "currentTier", required_tiers as "requiredTiers",
                 approval_history as "approvalHistory", decided_by as "decidedBy"`,
      [
        userId,
        startDate,
        endDate,
        workingDays,
        finalLeaveType,
        finalReason,
        status,
        currentApproverId,
        currentTier,
        requiredTiers,
        JSON.stringify([]),
        decidedBy
      ]
    );

    if (status === 'APPROVED') {
      scheduleSlackStatusJobs(
        result.rows[0].id,
        user.id,
        result.rows[0].startDate,
        result.rows[0].endDate,
        finalLeaveType
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function getBalance(req, res) {
  const userId = parseInt(req.query.userId) || 1;
  try {
    const userRes = await pool.query(
      'SELECT join_date, role, employment_type as "employmentType" FROM users WHERE id = $1',
      [userId]
    );
    if (userRes.rowCount === 0) return res.status(404).json({ error: 'User not found' });

    const { join_date: joinDate, role, employmentType } = userRes.rows[0];

    const approvedLeavesRes = await pool.query(
      "SELECT start_date as \"startDate\", end_date as \"endDate\", working_days as \"workingDays\" FROM leave_requests WHERE user_id = $1 AND status = 'APPROVED'",
      [userId]
    );

    const approvedLeaves = approvedLeavesRes.rows;
    const used = approvedLeaves.reduce((acc, curr) => acc + parseFloat(curr.workingDays || 0), 0);

    const policy = await getActivePolicies();
    const accrualResult = calculateAccrual(joinDate, role, employmentType, approvedLeaves, policy);
    const accrued = accrualResult.totalAccrued;
    const available = calculateAvailableBalance(accrued, used);

    res.json({
      baseLeave: accrualResult.baseLeave,
      accrualRate: accrualResult.rate,
      employmentType: accrualResult.employmentType,
      accruedFromMonths: accrualResult.accruedFromMonths,
      monthsWithNoLeave: accrualResult.monthsWithNoLeave,
      monthsWithLeave: accrualResult.monthsWithLeave,
      accrued,
      used,
      available
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function approveLeave(req, res) {
  const { id } = req.params;
  const activeUserId = req.body?.approverId ? parseInt(req.body.approverId) : null;

  try {
    const reqRes = await pool.query(
      `SELECT lr.*, u.name as requester_name, u.role as requester_role
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       WHERE lr.id = $1`,
      [id]
    );
    if (reqRes.rowCount === 0) return res.status(404).json({ error: 'Leave request not found' });

    const leaveReq = reqRes.rows[0];
    if (leaveReq.status !== 'PENDING') {
      return res.status(409).json({ error: 'Leave request has already been decided' });
    }

    // Determine actual approver user
    const actingUserRes = await pool.query(
      'SELECT id, name, role, manager_id FROM users WHERE id = $1',
      [activeUserId || leaveReq.approver_id]
    );
    const actingUser = actingUserRes.rows[0] || { name: 'Manager', role: 'Approver', manager_id: null };

    // Check if acting on delegation
    let approvalLabel = `${actingUser.name} (${actingUser.role})`;
    if (activeUserId && activeUserId !== leaveReq.approver_id) {
      const origRes = await pool.query('SELECT name, role FROM users WHERE id = $1', [leaveReq.approver_id]);
      if (origRes.rowCount > 0) {
        approvalLabel = `${actingUser.name} (${actingUser.role}, on behalf of ${origRes.rows[0].name})`;
      }
    }

    const history = Array.isArray(leaveReq.approval_history) ? [...leaveReq.approval_history] : [];
    history.push({
      approverId: actingUser.id,
      label: approvalLabel,
      action: 'APPROVED',
      timestamp: new Date().toISOString()
    });

    const currentTier = parseInt(leaveReq.current_tier) || 1;
    const requiredTiers = parseInt(leaveReq.required_tiers) || 1;

    // Get original target approver's manager for advancing
    const targetApproverRes = await pool.query('SELECT manager_id FROM users WHERE id = $1', [leaveReq.approver_id]);
    const nextApproverId = targetApproverRes.rows[0]?.manager_id;

    if (currentTier < requiredTiers && nextApproverId) {
      const nextTier = currentTier + 1;
      const result = await pool.query(
        `UPDATE leave_requests
         SET status = 'PENDING',
             approver_id = $1,
             current_tier = $2,
             approval_history = $3::jsonb
         WHERE id = $4 AND status = 'PENDING'
         RETURNING id, start_date as "startDate", end_date as "endDate", working_days as "workingDays",
                   status, approver_id as "approverId", current_tier as "currentTier",
                   required_tiers as "requiredTiers", approval_history as "approvalHistory", decided_by as "decidedBy"`,
        [nextApproverId, nextTier, JSON.stringify(history), id]
      );
      if (result.rowCount === 0) return res.status(409).json({ error: 'Leave request has already been decided' });
      return res.json(result.rows[0]);
    } else {
      const approverNames = history.map(h => h.label || `${h.name} (${h.role})`).join(' → ');
      const decidedBy = `Approved by ${approverNames}`;

      const result = await pool.query(
        `UPDATE leave_requests
         SET status = 'APPROVED',
             approver_id = NULL,
             approval_history = $1::jsonb,
             decided_by = $2
         WHERE id = $3 AND status = 'PENDING'
         RETURNING id, start_date as "startDate", end_date as "endDate", working_days as "workingDays",
                   status, approver_id as "approverId", current_tier as "currentTier",
                   required_tiers as "requiredTiers", approval_history as "approvalHistory", decided_by as "decidedBy"`,
        [JSON.stringify(history), decidedBy, id]
      );
      if (result.rowCount === 0) return res.status(409).json({ error: 'Leave request has already been decided' });

      // Non-blocking Slack status scheduling with exact dynamic leave dates
      scheduleSlackStatusJobs(
        result.rows[0].id,
        leaveReq.user_id,
        result.rows[0].startDate,
        result.rows[0].endDate,
        leaveReq.leave_type
      );

      return res.json(result.rows[0]);
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function rejectLeave(req, res) {
  const { id } = req.params;
  const activeUserId = req.body?.approverId ? parseInt(req.body.approverId) : null;

  try {
    const reqRes = await pool.query('SELECT * FROM leave_requests WHERE id = $1', [id]);
    if (reqRes.rowCount === 0) return res.status(404).json({ error: 'Leave request not found' });

    const leaveReq = reqRes.rows[0];
    if (leaveReq.status !== 'PENDING') {
      return res.status(409).json({ error: 'Leave request has already been decided' });
    }

    const actingUserRes = await pool.query(
      'SELECT id, name, role FROM users WHERE id = $1',
      [activeUserId || leaveReq.approver_id]
    );
    const actingUser = actingUserRes.rows[0] || { name: 'Manager', role: 'Approver' };

    let rejectLabel = `${actingUser.name} (${actingUser.role})`;
    if (activeUserId && activeUserId !== leaveReq.approver_id) {
      const origRes = await pool.query('SELECT name, role FROM users WHERE id = $1', [leaveReq.approver_id]);
      if (origRes.rowCount > 0) {
        rejectLabel = `${actingUser.name} (${actingUser.role}, on behalf of ${origRes.rows[0].name})`;
      }
    }

    const history = Array.isArray(leaveReq.approval_history) ? [...leaveReq.approval_history] : [];
    history.push({
      approverId: actingUser.id,
      label: rejectLabel,
      action: 'REJECTED',
      timestamp: new Date().toISOString()
    });

    const decidedBy = `Rejected by ${rejectLabel}`;

    const result = await pool.query(
      `UPDATE leave_requests
       SET status = 'REJECTED',
           approver_id = NULL,
           approval_history = $1::jsonb,
           decided_by = $2
       WHERE id = $3 AND status = 'PENDING'
       RETURNING id, start_date as "startDate", end_date as "endDate", working_days as "workingDays",
                 status, approver_id as "approverId", current_tier as "currentTier",
                 required_tiers as "requiredTiers", approval_history as "approvalHistory", decided_by as "decidedBy"`,
      [JSON.stringify(history), decidedBy, id]
    );
    if (result.rowCount === 0) return res.status(409).json({ error: 'Leave request has already been decided' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// Team Leaves and 50% Concurrency Alert
export async function getTeamLeaves(req, res) {
  const managerId = parseInt(req.query.managerId);
  if (!managerId) return res.status(400).json({ error: 'managerId is required' });

  try {
    // 1. Direct reports (mentees)
    const directRes = await pool.query(
      'SELECT id, name, role, employment_type as "employmentType" FROM users WHERE manager_id = $1',
      [managerId]
    );
    const directReports = directRes.rows;
    const directReportsCount = directReports.length;
    const directReportIds = new Set(directReports.map(d => d.id));

    // 2. All recursive subordinates
    const allSubordinatesRes = await pool.query(
      `WITH RECURSIVE subordinates AS (
         SELECT id, name, role, employment_type, manager_id, 1 as depth
         FROM users
         WHERE manager_id = $1
         UNION ALL
         SELECT u.id, u.name, u.role, u.employment_type, u.manager_id, s.depth + 1
         FROM users u
         INNER JOIN subordinates s ON u.manager_id = s.id
       )
       SELECT * FROM subordinates ORDER BY depth, name`,
      [managerId]
    );
    const subordinates = allSubordinatesRes.rows;
    const allSubordinateIds = subordinates.map(s => s.id);

    if (allSubordinateIds.length === 0) {
      return res.json({
        directReportsCount: 0,
        directReports: [],
        subordinates: [],
        teamLeaves: [],
        alertDates: []
      });
    }

    // 3. Approved & Pending leaves for all subordinates
    const leavesRes = await pool.query(
      `SELECT lr.id,
              lr.user_id as "userId",
              u.name as "userName",
              u.role as "userRole",
              lr.start_date as "startDate",
              lr.end_date as "endDate",
              lr.working_days as "workingDays",
              lr.leave_type as "leaveType",
              lr.reason,
              lr.status
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       WHERE lr.user_id = ANY($1::int[]) AND lr.status IN ('APPROVED', 'PENDING')
       ORDER BY lr.start_date ASC`,
      [allSubordinateIds]
    );
    const teamLeaves = leavesRes.rows;

    // 4. Calculate 50% concurrency alert for direct reports
    const dateMap = {}; // { 'YYYY-MM-DD': Set of userIds }

    if (directReportsCount > 0) {
      for (const l of teamLeaves) {
        if (!directReportIds.has(l.userId)) continue; // only count direct reports for the 50% mentee threshold

        const cur = new Date(l.startDate);
        const end = new Date(l.endDate);

        while (cur <= end) {
          const dow = cur.getDay();
          if (dow !== 0 && dow !== 6) {
            const iso = cur.toISOString().split('T')[0];
            if (!dateMap[iso]) dateMap[iso] = new Set();
            dateMap[iso].add(l.userId);
          }
          cur.setDate(cur.getDate() + 1);
        }
      }
    }

    const alertDates = [];
    const threshold = Math.ceil(directReportsCount * 0.5);

    for (const [dateIso, userSet] of Object.entries(dateMap)) {
      if (userSet.size >= threshold && directReportsCount >= 2) {
        const onLeaveNames = directReports
          .filter(d => userSet.has(d.id))
          .map(d => d.name);

        alertDates.push({
          date: dateIso,
          onLeaveCount: userSet.size,
          totalDirectReports: directReportsCount,
          percentage: Math.round((userSet.size / directReportsCount) * 100),
          employeeNames: onLeaveNames
        });
      }
    }

    // Sort alerts by date
    alertDates.sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      directReportsCount,
      directReports,
      subordinates,
      teamLeaves,
      alertDates
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
