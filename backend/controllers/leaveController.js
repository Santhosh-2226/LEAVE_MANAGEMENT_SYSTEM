import { pool } from '../db/pool.js';
import { calculateAccrual, calculateAvailableBalance, calculateWorkingDays, calculateUsedLeave, DEFAULT_POLICIES } from '../leaveEngine.js';
import { scheduleSlackStatusJobs } from '../integrations/slack/services/slackJobScheduler.js';
import {
  notifyLeaveApplied,
  notifyTier2Handoff,
  notifyLeaveApproved,
  notifyLeaveRejected
} from '../services/notificationService.js';
import { getActivePolicies } from './policyController.js';

async function getHolidaysForRegion(region) {
  const result = await pool.query(
    "SELECT holiday_date::text as holiday_date FROM holidays WHERE region = $1",
    [region]
  );
  return result.rows.map(r => r.holiday_date);
}

// Helper to get full manager chain
async function getManagerChain(userId) {
  const chain = [];
  let currentId = userId;
  const visited = new Set();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const res = await pool.query(
      'SELECT id, name, email, role, availability_status as "availabilityStatus", delegate_id as "delegateId", manager_id as "managerId" FROM users WHERE id = $1',
      [currentId]
    );
    if (res.rowCount === 0) break;
    const user = res.rows[0];
    if (user.managerId) {
      const mgrRes = await pool.query(
        'SELECT id, name, email, role, availability_status as "availabilityStatus", delegate_id as "delegateId", manager_id as "managerId" FROM users WHERE id = $1',
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
              lr.start_date::text as "startDate",
              lr.end_date::text as "endDate",
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
              lr.decided_by as "decidedBy",
              lr.created_at as "createdAt"
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
              lr.start_date::text as "startDate",
              lr.end_date::text as "endDate",
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
              u.email as "requesterEmail",
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
       WHERE lr.status IN ('PENDING', 'PENDING_TIER1', 'PENDING_TIER2')
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
  const { startDate, endDate, userId, leaveType, reason } = req.body;
  if (!startDate || !endDate || !userId || !leaveType) {
    return res.status(400).json({ error: 'startDate, endDate, userId, and leaveType are required' });
  }
  try {
    const userRes = await pool.query(
      'SELECT id, name, email, role, manager_id, region, join_date::text as "joinDate", employment_type as "employmentType" FROM users WHERE id = $1',
      [userId]
    );
    if (userRes.rowCount === 0) return res.status(404).json({ error: 'User not found' });

    const user = userRes.rows[0];
    const holidayDates = await getHolidaysForRegion(user.region);
    const workingDays = calculateWorkingDays(startDate, endDate, holidayDates);

    if (workingDays === 0) {
      return res.status(400).json({ error: 'The selected date range contains 0 working days (weekends or public holidays).' });
    }

    const sDate = new Date(startDate);
    const eDate = new Date(endDate);
    if (isNaN(sDate.getTime()) || isNaN(eDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format for startDate or endDate' });
    }
    if (sDate > eDate) return res.status(400).json({ error: 'startDate must be on or before endDate' });

    // Calculate current available balance
    const approvedLeavesRes = await pool.query(
      "SELECT start_date::text as \"startDate\", end_date::text as \"endDate\", working_days as \"workingDays\" FROM leave_requests WHERE user_id = $1 AND status = 'APPROVED'",
      [userId]
    );
    const approvedLeaves = approvedLeavesRes.rows;
    const used = calculateUsedLeave(approvedLeaves);
    const policy = await getActivePolicies();
    const accrualResult = calculateAccrual(user.joinDate, user.role, user.employmentType, approvedLeaves, policy);
    const availableBalance = calculateAvailableBalance(accrualResult.totalAccrued, used);

    const isEmergency = leaveType === 'Emergency Leave';

    // Negative Balance Check:
    // If workingDays > availableBalance and not Emergency Leave, record as REJECTED in database
    if (workingDays > availableBalance && !isEmergency) {
      const rejectReason = `System Auto-Rejected: Insufficient Leave Balance (Requested: ${workingDays}d, Available: ${availableBalance}d)`;
      const rejectHistory = [
        {
          label: 'System Accrual Guard',
          action: 'REJECTED',
          reason: `Insufficient Balance (Requested ${workingDays}d > Available ${availableBalance}d)`,
          timestamp: new Date().toISOString()
        }
      ];

      const rejectedInsert = await pool.query(
        `INSERT INTO leave_requests (
           user_id, start_date, end_date, working_days, leave_type, reason,
           status, approver_id, current_tier, required_tiers, approval_history, decided_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'REJECTED', NULL, 1, 1, $7::jsonb, $8)
         RETURNING id, start_date::text as "startDate", end_date::text as "endDate", working_days as "workingDays",
                   leave_type as "leaveType", reason, status, approver_id as "approverId",
                   current_tier as "currentTier", required_tiers as "requiredTiers",
                   approval_history as "approvalHistory", decided_by as "decidedBy"`,
        [
          userId,
          startDate,
          endDate,
          workingDays,
          leaveType,
          reason ? reason.trim() : null,
          JSON.stringify(rejectHistory),
          rejectReason
        ]
      );

      const rejectedLeave = rejectedInsert.rows[0];

      // Notify employee of auto-rejection via email
      notifyLeaveRejected({
        requester: user,
        leave: rejectedLeave,
        decidedBy: rejectReason
      }).catch(() => {});

      return res.status(422).json({
        ...rejectedLeave,
        isNegativeAccrual: true,
        availableBalance,
        error: `Leave Auto-Rejected: Requested ${workingDays} days exceeds your available balance (${availableBalance}d). Would you like to apply as Emergency Leave instead (requires 2-tier managerial approval)?`
      });
    }

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
    let assignedApprover = null;

    const managerChain = await getManagerChain(user.id);

    if (isPast) {
      finalLeaveType = 'Emergency Leave';
      status = 'APPROVED';
      decidedBy = 'Auto-Approved (Emergency Leave - Backdated)';
      finalReason = finalReason ? `[EMERGENCY BACKDATED] ${finalReason}` : '[EMERGENCY BACKDATED]';
    } else if (isEmergency) {
      // Emergency Leave: Always requires 2-tier approval (direct manager + higher manager above them), even for 1 day
      finalLeaveType = 'Emergency Leave';
      finalReason = finalReason ? `[EMERGENCY LEAVE] ${finalReason}` : '[EMERGENCY LEAVE]';
      if (managerChain.length === 0) {
        status = 'APPROVED';
        decidedBy = `Self-Approved (${user.role})`;
      } else {
        requiredTiers = Math.min(2, managerChain.length);
        assignedApprover = managerChain[0];
        currentApproverId = assignedApprover.id;
        currentTier = 1;
        status = 'PENDING';
      }
    } else {
      // Regular Leave Routing
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

        assignedApprover = managerChain[0];
        currentApproverId = assignedApprover.id;
        currentTier = 1;
        status = 'PENDING';
      }
    }

    const result = await pool.query(
      `INSERT INTO leave_requests (
         user_id, start_date, end_date, working_days, leave_type, reason,
         status, approver_id, current_tier, required_tiers, approval_history, decided_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
       RETURNING id, start_date::text as "startDate", end_date::text as "endDate", working_days as "workingDays",
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

    const createdLeave = result.rows[0];

    // Non-blocking background integrations (Slack & Email)
    if (status === 'APPROVED') {
      scheduleSlackStatusJobs(
        createdLeave.id,
        user.id,
        createdLeave.startDate,
        createdLeave.endDate,
        finalLeaveType
      );
      notifyLeaveApproved({ requester: user, leave: createdLeave, decidedBy }).catch(() => {});
    } else if (assignedApprover) {
      notifyLeaveApplied({ requester: user, approver: assignedApprover, leave: createdLeave }).catch(() => {});
    }

    res.status(201).json(createdLeave);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function getBalance(req, res) {
  const userId = parseInt(req.query.userId) || 1;
  try {
    const userRes = await pool.query(
      'SELECT join_date::text as "joinDate", role, employment_type as "employmentType" FROM users WHERE id = $1',
      [userId]
    );
    if (userRes.rowCount === 0) return res.status(404).json({ error: 'User not found' });

    const { joinDate, role, employmentType } = userRes.rows[0];

    const approvedLeavesRes = await pool.query(
      "SELECT start_date::text as \"startDate\", end_date::text as \"endDate\", working_days as \"workingDays\" FROM leave_requests WHERE user_id = $1 AND status = 'APPROVED'",
      [userId]
    );

    const approvedLeaves = approvedLeavesRes.rows;
    const used = calculateUsedLeave(approvedLeaves);

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
      `SELECT lr.*, lr.start_date::text as "startDate", lr.end_date::text as "endDate",
              u.id as requester_id, u.name as requester_name, u.email as requester_email, u.role as requester_role
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       WHERE lr.id = $1`,
      [id]
    );
    if (reqRes.rowCount === 0) return res.status(404).json({ error: 'Leave request not found' });

    const leaveReq = reqRes.rows[0];
    if (!['PENDING', 'PENDING_TIER1', 'PENDING_TIER2'].includes(leaveReq.status)) {
      return res.status(409).json({ error: 'Leave request has already been decided' });
    }

    const actingUserRes = await pool.query(
      'SELECT id, name, email, role, manager_id FROM users WHERE id = $1',
      [activeUserId || leaveReq.approver_id]
    );
    const actingUser = actingUserRes.rows[0] || { name: 'Manager', role: 'Approver', manager_id: null };

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
         WHERE id = $4 AND status IN ('PENDING', 'PENDING_TIER1', 'PENDING_TIER2')
         RETURNING id, start_date::text as "startDate", end_date::text as "endDate", working_days as "workingDays",
                   leave_type as "leaveType", status, approver_id as "approverId", current_tier as "currentTier",
                   required_tiers as "requiredTiers", approval_history as "approvalHistory", decided_by as "decidedBy"`,
        [nextApproverId, nextTier, JSON.stringify(history), id]
      );
      if (result.rowCount === 0) return res.status(409).json({ error: 'Leave request has already been decided' });

      // Notify Tier 2 approver
      const nextAppRes = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [nextApproverId]);
      if (nextAppRes.rowCount > 0) {
        notifyTier2Handoff({
          requester: { name: leaveReq.requester_name, email: leaveReq.requester_email, role: leaveReq.requester_role },
          nextApprover: nextAppRes.rows[0],
          leave: result.rows[0]
        }).catch(() => {});
      }

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
         WHERE id = $3 AND status IN ('PENDING', 'PENDING_TIER1', 'PENDING_TIER2')
         RETURNING id, start_date::text as "startDate", end_date::text as "endDate", working_days as "workingDays",
                   leave_type as "leaveType", status, approver_id as "approverId", current_tier as "currentTier",
                   required_tiers as "requiredTiers", approval_history as "approvalHistory", decided_by as "decidedBy"`,
        [JSON.stringify(history), decidedBy, id]
      );
      if (result.rowCount === 0) return res.status(409).json({ error: 'Leave request has already been decided' });

      const approvedRecord = result.rows[0];

      // Non-blocking Slack status scheduling
      scheduleSlackStatusJobs(
        approvedRecord.id,
        leaveReq.user_id,
        approvedRecord.startDate,
        approvedRecord.endDate,
        approvedRecord.leaveType
      );

      // Email employee
      notifyLeaveApproved({
        requester: { name: leaveReq.requester_name, email: leaveReq.requester_email },
        leave: approvedRecord,
        decidedBy
      }).catch(() => {});

      return res.json(approvedRecord);
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function rejectLeave(req, res) {
  const { id } = req.params;
  const activeUserId = req.body?.approverId ? parseInt(req.body.approverId) : null;

  try {
    const reqRes = await pool.query(
      `SELECT lr.*, lr.start_date::text as "startDate", lr.end_date::text as "endDate",
              u.name as requester_name, u.email as requester_email, u.role as requester_role
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       WHERE lr.id = $1`,
      [id]
    );
    if (reqRes.rowCount === 0) return res.status(404).json({ error: 'Leave request not found' });

    const leaveReq = reqRes.rows[0];
    if (!['PENDING', 'PENDING_TIER1', 'PENDING_TIER2'].includes(leaveReq.status)) {
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

    const approverNames = history.map(h => h.label || `${h.name} (${h.role})`).join(' → ');
    const decidedBy = `Rejected by ${approverNames}`;

    const result = await pool.query(
      `UPDATE leave_requests
       SET status = 'REJECTED',
           approver_id = NULL,
           approval_history = $1::jsonb,
           decided_by = $2
       WHERE id = $3 AND status IN ('PENDING', 'PENDING_TIER1', 'PENDING_TIER2')
       RETURNING id, start_date::text as "startDate", end_date::text as "endDate", working_days as "workingDays",
                 leave_type as "leaveType", status, approver_id as "approverId", current_tier as "currentTier",
                 required_tiers as "requiredTiers", approval_history as "approvalHistory", decided_by as "decidedBy"`,
      [JSON.stringify(history), decidedBy, id]
    );

    if (result.rowCount === 0) return res.status(409).json({ error: 'Leave request has already been decided' });

    const rejectedRecord = result.rows[0];

    // Notify employee of rejection
    notifyLeaveRejected({
      requester: { name: leaveReq.requester_name, email: leaveReq.requester_email },
      leave: rejectedRecord,
      decidedBy
    }).catch(() => {});

    res.json(rejectedRecord);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/**
 * Stage 16: Withdraw Leave Request
 * PATCH /leave/requests/:id/withdraw
 * Body: { userId }
 */
export async function withdrawLeave(req, res) {
  const { id } = req.params;
  const callerId = parseInt(req.body?.userId || req.headers['x-user-id']);

  if (!callerId) {
    return res.status(400).json({ error: 'userId is required to withdraw leave' });
  }

  try {
    // 1. Authoritative atomic check in PostgreSQL:
    // Requires: matching requester, pending status, and leave start > NOW() + 12 hours
    const updateRes = await pool.query(
      `UPDATE leave_requests
       SET status = 'WITHDRAWN',
           decided_by = 'Withdrawn by Requester'
       WHERE id = $1
         AND user_id = $2
         AND status IN ('PENDING', 'PENDING_TIER1', 'PENDING_TIER2')
         AND (start_date::timestamp) > (NOW() + INTERVAL '12 hours')
       RETURNING id, start_date::text as "startDate", end_date::text as "endDate",
                 working_days as "workingDays", leave_type as "leaveType", status, decided_by as "decidedBy"`,
      [id, callerId]
    );

    if (updateRes.rowCount > 0) {
      // Cancel any scheduled Slack jobs for this leave
      await pool.query(
        "UPDATE slack_status_jobs SET status = 'CANCELLED', last_error = 'Leave withdrawn' WHERE leave_id = $1 AND status = 'PENDING'",
        [id]
      );
      return res.json(updateRes.rows[0]);
    }

    // 2. If update didn't match, diagnose why to provide precise error response:
    const checkRes = await pool.query(
      `SELECT lr.*, lr.start_date::text as "startDate",
              ((lr.start_date::timestamp) <= (NOW() + INTERVAL '12 hours')) as is_within_12_hours
       FROM leave_requests lr
       WHERE lr.id = $1`,
      [id]
    );

    if (checkRes.rowCount === 0) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    const leave = checkRes.rows[0];

    if (leave.user_id !== callerId) {
      return res.status(403).json({ error: 'Access forbidden: You can only withdraw your own leave requests' });
    }

    if (!['PENDING', 'PENDING_TIER1', 'PENDING_TIER2'].includes(leave.status)) {
      return res.status(400).json({ error: `Cannot withdraw leave with status '${leave.status}'. Only pending leaves can be withdrawn.` });
    }

    if (leave.is_within_12_hours) {
      return res.status(422).json({ error: 'Cannot withdraw within 12 hours of your leave start date.' });
    }

    return res.status(400).json({ error: 'Withdrawal condition not met' });
  } catch (err) {
    console.error('Error withdrawing leave:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function getTeamLeaves(req, res) {
  const managerId = parseInt(req.query.managerId);
  if (!managerId) return res.status(400).json({ error: 'managerId query parameter is required' });

  try {
    const subordinatesRes = await pool.query(
      `WITH RECURSIVE subordinates AS (
        SELECT id, name, role, manager_id, 1 as depth
        FROM users
        WHERE manager_id = $1
        UNION ALL
        SELECT u.id, u.name, u.role, u.manager_id, s.depth + 1
        FROM users u
        JOIN subordinates s ON u.manager_id = s.id
      )
      SELECT * FROM subordinates;`,
      [managerId]
    );

    const subordinates = subordinatesRes.rows;
    const directReports = subordinates.filter(s => s.depth === 1);
    const subIds = subordinates.map(s => s.id);

    if (subIds.length === 0) {
      return res.json({
        directReportsCount: 0,
        directReports: [],
        subordinates: [],
        teamLeaves: [],
        alertDates: []
      });
    }

    const teamLeavesRes = await pool.query(
      `SELECT lr.id,
              lr.user_id as "userId",
              lr.start_date::text as "startDate",
              lr.end_date::text as "endDate",
              lr.working_days as "workingDays",
              lr.leave_type as "leaveType",
              lr.reason,
              lr.status,
              u.name as "userName",
              u.role as "userRole",
              u.manager_id as "managerId"
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       WHERE lr.user_id = ANY($1::int[])
         AND lr.status IN ('APPROVED', 'PENDING')
       ORDER BY lr.start_date ASC`,
      [subIds]
    );

    const teamLeaves = teamLeavesRes.rows;

    const directReportIds = new Set(directReports.map(d => d.id));
    const directReportsCount = directReports.length;
    const directApprovedLeaves = teamLeaves.filter(l => directReportIds.has(l.userId) && l.status === 'APPROVED');

    const dateMap = {};
    for (const l of directApprovedLeaves) {
      let cur = new Date(l.startDate);
      const end = new Date(l.endDate);
      while (cur <= end) {
        const iso = cur.toISOString().split('T')[0];
        if (!dateMap[iso]) dateMap[iso] = new Set();
        dateMap[iso].add(l.userName);
        cur.setDate(cur.getDate() + 1);
      }
    }

    const rawAlertDates = [];
    if (directReportsCount >= 2) {
      const threshold = Math.ceil(directReportsCount * 0.5);
      const sortedDates = Object.keys(dateMap).sort();
      for (const d of sortedDates) {
        const namesSet = dateMap[d];
        if (namesSet.size >= threshold) {
          rawAlertDates.push({
            date: d,
            onLeaveCount: namesSet.size,
            totalDirectReports: directReportsCount,
            percentage: Math.round((namesSet.size / directReportsCount) * 100),
            employeeNames: Array.from(namesSet).sort()
          });
        }
      }
    }

    // Merge contiguous dates into unified range notifications (e.g., 3 days contiguous = 1 single alert)
    const alertRanges = [];
    for (const item of rawAlertDates) {
      if (alertRanges.length === 0) {
        alertRanges.push({
          startDate: item.date,
          endDate: item.date,
          daysCount: 1,
          totalDirectReports: item.totalDirectReports,
          onLeaveCount: item.onLeaveCount,
          percentage: item.percentage,
          employeeNames: new Set(item.employeeNames)
        });
      } else {
        const last = alertRanges[alertRanges.length - 1];
        const lastEnd = new Date(last.endDate);
        const curDate = new Date(item.date);
        const diffDays = Math.round((curDate - lastEnd) / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          last.endDate = item.date;
          last.daysCount += 1;
          last.onLeaveCount = Math.max(last.onLeaveCount, item.onLeaveCount);
          last.percentage = Math.max(last.percentage, item.percentage);
          item.employeeNames.forEach(n => last.employeeNames.add(n));
        } else {
          alertRanges.push({
            startDate: item.date,
            endDate: item.date,
            daysCount: 1,
            totalDirectReports: item.totalDirectReports,
            onLeaveCount: item.onLeaveCount,
            percentage: item.percentage,
            employeeNames: new Set(item.employeeNames)
          });
        }
      }
    }

    const consolidatedAlerts = alertRanges.map(r => ({
      startDate: r.startDate,
      endDate: r.endDate,
      dateLabel: r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate} (${r.daysCount} days)`,
      date: r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`,
      daysCount: r.daysCount,
      totalDirectReports: r.totalDirectReports,
      onLeaveCount: r.onLeaveCount,
      percentage: r.percentage,
      employeeNames: Array.from(r.employeeNames)
    }));

    res.json({
      directReportsCount,
      directReports,
      subordinates,
      teamLeaves,
      rawAlertDates,
      alertDates: consolidatedAlerts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
