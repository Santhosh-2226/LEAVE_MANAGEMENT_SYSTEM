import { pool } from './db/pool.js';

async function resetFreshData() {
  console.log('1. Updating corporate accrual policies to realistic rates...');
  await pool.query(`
    INSERT INTO accrual_policies (id, base_leave, employee_rate, manager_rate, senior_manager_rate, director_rate, vp_rate, part_time_rate, updated_at)
    VALUES (1, 10.0, 1.25, 1.5, 1.75, 2.0, 2.0, 0.75, now())
    ON CONFLICT (id) DO UPDATE
    SET base_leave = EXCLUDED.base_leave,
        employee_rate = EXCLUDED.employee_rate,
        manager_rate = EXCLUDED.manager_rate,
        senior_manager_rate = EXCLUDED.senior_manager_rate,
        director_rate = EXCLUDED.director_rate,
        vp_rate = EXCLUDED.vp_rate,
        part_time_rate = EXCLUDED.part_time_rate,
        updated_at = now();
  `);

  console.log('2. Updating user join dates to realistic current year (2026)...');
  await pool.query(`
    UPDATE users SET join_date = '2026-01-01', availability_status = 'AVL', delegate_id = NULL WHERE role = 'Director';
    UPDATE users SET join_date = '2026-01-15', availability_status = 'AVL', delegate_id = NULL WHERE role = 'Senior Manager';
    UPDATE users SET join_date = '2026-02-01', availability_status = 'AVL', delegate_id = NULL WHERE role = 'Manager';
    UPDATE users SET join_date = '2026-02-15', availability_status = 'AVL', delegate_id = NULL WHERE role = 'Employee';
    UPDATE users SET join_date = '2026-01-01' WHERE is_admin = true;
  `);

  // Ensure Suresh & Karthik emails are preserved
  await pool.query("UPDATE users SET email = 'santhoshiyyappan033@gmail.com' WHERE name LIKE '%Suresh%'");
  await pool.query("UPDATE users SET email = 'santhoshi.aids2023@citchennai.net' WHERE name LIKE '%Karthik%'");

  console.log('3. Deleting previous leave history and scheduled Slack jobs (Fresh Start)...');
  await pool.query("TRUNCATE TABLE leave_requests, slack_status_jobs RESTART IDENTITY CASCADE;");

  console.log('✓ System completely reset to fresh start!');
  
  // Print preview of users and their new fresh available balances
  const usersRes = await pool.query('SELECT id, name, role, join_date::text as "joinDate", email FROM users ORDER BY id ASC LIMIT 8');
  console.table(usersRes.rows);
  process.exit(0);
}

resetFreshData().catch(err => {
  console.error('Reset error:', err);
  process.exit(1);
});
