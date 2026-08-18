import { pool } from '../db/pool.js';
import { calculateAccrual, calculateAvailableBalance, DEFAULT_POLICIES } from '../leaveEngine.js';
import { getDownstreamUsers, isInDownstreamHierarchy } from '../services/hierarchyService.js';
import { getActivePolicies } from './policyController.js';

/**
 * Hierarchical Analytics Dashboard Endpoint
 * GET /dashboard/team/:managerId?callerId=...
 */
export async function getTeamDashboard(req, res) {
  const managerId = parseInt(req.params.managerId);
  const callerId = parseInt(req.query.callerId || req.headers['x-user-id'] || req.params.managerId);

  if (!managerId || isNaN(managerId)) {
    return res.status(400).json({ error: 'Valid managerId is required' });
  }

  try {
    // 1. Authorization check: Ensure caller has permission to view this manager's team
    const isAuthorized = await isInDownstreamHierarchy(callerId, managerId);
    if (!isAuthorized) {
      return res.status(403).json({ error: 'Access forbidden: Target manager is not in your organizational hierarchy' });
    }

    // 2. Query manager details
    const mgrRes = await pool.query('SELECT id, name, role, email FROM users WHERE id = $1', [managerId]);
    if (mgrRes.rowCount === 0) {
      return res.status(404).json({ error: 'Manager not found' });
    }
    const manager = mgrRes.rows[0];

    // 3. PostgreSQL WITH RECURSIVE query to fetch all descendants at any depth
    const downstreamQuery = `
      WITH RECURSIVE team_tree AS (
        -- Anchor: direct reports
        SELECT u.id, u.name, u.email, u.role, u.employment_type as "employmentType",
               u.join_date::text as "joinDate", u.region, u.manager_id as "managerId",
               mgr.name as "managerName", mgr.role as "managerRole", 1 as depth
        FROM users u
        LEFT JOIN users mgr ON u.manager_id = mgr.id
        WHERE u.manager_id = $1

        UNION ALL

        -- Recursive: indirect reports
        SELECT u.id, u.name, u.email, u.role, u.employment_type as "employmentType",
               u.join_date::text as "joinDate", u.region, u.manager_id as "managerId",
               mgr.name as "managerName", mgr.role as "managerRole", tt.depth + 1
        FROM users u
        JOIN team_tree tt ON u.manager_id = tt.id
        LEFT JOIN users mgr ON u.manager_id = mgr.id
      )
      SELECT tt.*,
             EXISTS (
               SELECT 1 FROM leave_requests lr
               WHERE lr.user_id = tt.id
                 AND lr.status = 'APPROVED'
                 AND CURRENT_DATE BETWEEN lr.start_date AND lr.end_date
             ) as is_unavl
      FROM team_tree tt
      ORDER BY depth ASC, name ASC;
    `;

    const teamResult = await pool.query(downstreamQuery, [managerId]);
    const teamMembers = teamResult.rows;

    if (teamMembers.length === 0) {
      return res.json({
        manager,
        overview: {
          totalEmployees: 0,
          totalLeaveTaken: 0,
          averageLeaveTaken: 0,
          currentlyOnLeave: 0,
          pendingRequests: 0,
        },
        scopeBreakdown: { managers: 0, seniorManagers: 0, employees: 0 },
        rankings: { lowestLeaveUtilization: [], highestLeaveUtilization: [] },
        teamMembers: []
      });
    }

    const memberIds = teamMembers.map(m => m.id);

    // 4. Fetch all approved leaves for the entire team in a single batch query (no N+1)
    const approvedLeavesRes = await pool.query(
      `SELECT user_id, start_date::text as "startDate", end_date::text as "endDate", working_days as "workingDays"
       FROM leave_requests
       WHERE user_id = ANY($1::int[]) AND status = 'APPROVED'`,
      [memberIds]
    );

    // 5. Fetch all pending requests for the entire team in a single batch query
    const pendingRequestsRes = await pool.query(
      `SELECT id, user_id, start_date::text as "startDate", end_date::text as "endDate", working_days as "workingDays", leave_type as "leaveType", reason, status
       FROM leave_requests
       WHERE user_id = ANY($1::int[]) AND status IN ('PENDING', 'PENDING_TIER1', 'PENDING_TIER2')`,
      [memberIds]
    );

    const leavesByUser = {};
    for (const l of approvedLeavesRes.rows) {
      if (!leavesByUser[l.user_id]) leavesByUser[l.user_id] = [];
      leavesByUser[l.user_id].push(l);
    }

    const policy = await getActivePolicies();

    // 6. Compute statistics, leave balances, and utilization for each member
    let totalTeamLeaveTaken = 0;
    let currentlyOnLeaveCount = 0;

    const enrichedMembers = teamMembers.map(m => {
      const userLeaves = leavesByUser[m.id] || [];
      const leaveUsed = userLeaves.reduce((sum, curr) => sum + parseFloat(curr.workingDays || 0), 0);
      totalTeamLeaveTaken += leaveUsed;

      const accrualResult = calculateAccrual(m.joinDate, m.role, m.employmentType, userLeaves, policy);
      const availableBalance = calculateAvailableBalance(accrualResult.totalAccrued, leaveUsed);

      const status = m.is_unavl ? 'UNAVL' : 'AVL';
      if (m.is_unavl) currentlyOnLeaveCount++;

      return {
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        employmentType: m.employmentType,
        managerId: m.managerId,
        managerName: m.managerName,
        managerRole: m.managerRole,
        depth: m.depth,
        leaveUsed: Math.round(leaveUsed * 10) / 10,
        availableBalance,
        totalAccrued: accrualResult.totalAccrued,
        status, // 'AVL' | 'UNAVL'
      };
    });

    const totalEmployees = enrichedMembers.length;
    const averageLeaveTaken = totalEmployees > 0 ? Math.round((totalTeamLeaveTaken / totalEmployees) * 10) / 10 : 0;
    const pendingRequestsCount = pendingRequestsRes.rowCount;

    // 7. Calculate Scope Breakdown
    const scopeBreakdown = {
      directReports: enrichedMembers.filter(m => m.depth === 1).length,
      managers: enrichedMembers.filter(m => m.role === 'Manager').length,
      seniorManagers: enrichedMembers.filter(m => m.role === 'Senior Manager').length,
      employees: enrichedMembers.filter(m => m.role === 'Employee').length,
      totalDescendants: totalEmployees
    };

    // 8. Calculate Leave Utilization Rankings
    const sortedByUsage = [...enrichedMembers].sort((a, b) => a.leaveUsed - b.leaveUsed);
    const lowestLeaveUtilization = sortedByUsage.slice(0, 3).map(u => ({
      id: u.id,
      name: u.name,
      role: u.role,
      leaveUsed: u.leaveUsed
    }));

    const highestLeaveUtilization = [...sortedByUsage].reverse().slice(0, 3).map(u => ({
      id: u.id,
      name: u.name,
      role: u.role,
      leaveUsed: u.leaveUsed
    }));

    return res.json({
      manager,
      overview: {
        totalEmployees,
        totalLeaveTaken: Math.round(totalTeamLeaveTaken * 10) / 10,
        averageLeaveTaken,
        currentlyOnLeave: currentlyOnLeaveCount,
        pendingRequests: pendingRequestsCount,
      },
      scopeBreakdown,
      rankings: {
        lowestLeaveUtilization,
        highestLeaveUtilization
      },
      teamMembers: enrichedMembers
    });
  } catch (err) {
    console.error('Error fetching team dashboard:', err);
    res.status(500).json({ error: err.message });
  }
}
