import { pool } from '../db/pool.js';
import { isInDownstreamHierarchy } from '../services/hierarchyService.js';

/**
 * Generates and downloads a CSV report for an authorized employee
 * GET /reports/user/:userId/download?callerId=...
 */
export async function downloadUserReport(req, res) {
  const targetUserId = parseInt(req.params.userId);
  const callerId = parseInt(req.query.callerId || req.headers['x-user-id'] || req.params.userId);

  if (!targetUserId || isNaN(targetUserId)) {
    return res.status(400).json({ error: 'Valid userId is required' });
  }

  try {
    // 1. Authorization: verify caller can access target employee (self or downstream)
    const isAuthorized = await isInDownstreamHierarchy(callerId, targetUserId);
    if (!isAuthorized) {
      return res.status(403).json({ error: 'Access forbidden: Target employee is not in your organizational hierarchy' });
    }

    // 2. Fetch employee details
    const userRes = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, mgr.name as manager_name
       FROM users u
       LEFT JOIN users mgr ON u.manager_id = mgr.id
       WHERE u.id = $1`,
      [targetUserId]
    );

    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = userRes.rows[0];

    // 3. Fetch leave records
    const leavesRes = await pool.query(
      `SELECT start_date::text as "startDate",
              end_date::text as "endDate",
              working_days as "workingDays",
              leave_type as "leaveType",
              reason,
              status,
              created_at as "createdAt"
       FROM leave_requests
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [targetUserId]
    );

    const rows = leavesRes.rows;

    // 4. Build CSV content
    const headers = [
      'Employee Name',
      'Employee ID',
      'Role',
      'Manager',
      'Leave Type',
      'Start Date',
      'End Date',
      'Working Days',
      'Status',
      'Applied Date'
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvLines = [headers.join(',')];

    for (const r of rows) {
      const appliedDate = r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : '';
      const line = [
        escapeCsv(employee.name),
        escapeCsv(employee.id),
        escapeCsv(employee.role),
        escapeCsv(employee.manager_name || 'Top Level'),
        escapeCsv(r.leaveType),
        escapeCsv(r.startDate),
        escapeCsv(r.endDate),
        escapeCsv(r.workingDays),
        escapeCsv(r.status),
        escapeCsv(appliedDate)
      ];
      csvLines.push(line.join(','));
    }

    const csvOutput = csvLines.join('\n');

    // 5. Send as file download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="leave_report_${employee.id}_${employee.name.replace(/\s+/g, '_')}.csv"`);
    return res.send(csvOutput);
  } catch (err) {
    console.error('Error generating report:', err);
    res.status(500).json({ error: err.message });
  }
}
