import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seed() {
  try {
    console.log("==================================================");
    console.log("  Starting Leave Management Database Seeding...   ");
    console.log("==================================================");

    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await pool.query(schemaSql);
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;");
    console.log("✓ Schema created & verified.");

    // Seed initial active corporate policy
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
          updated_at = EXCLUDED.updated_at;
    `);
    console.log("✓ Accrual policies seeded.");

    // Clean existing users and leave requests for clean seed
    await pool.query("TRUNCATE TABLE leave_requests, slack_status_jobs, slack_integrations, users RESTART IDENTITY CASCADE;");

    // 1. System Administrator
    await pool.query(`
      INSERT INTO users (id, name, email, role, is_admin, employment_type, availability_status, join_date, accrual_rate_per_month, manager_id, region)
      VALUES (100, 'System Administrator', 'admin@corp.com', 'HR Admin', true, 'Full-Time', 'AVL', '2026-01-01', 0, NULL, 'US')
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role, is_admin = EXCLUDED.is_admin;
    `);

    // 2. Hierarchy Users Definition:
    // Directors (2)
    // Senior Managers (3)
    // Managers (5)
    // Employees (10)
    const usersData = [
      // Top Level Directors (id 1, 2)
      { id: 1, name: 'Rajesh Kumar', email: 'rajesh.kumar@corp.com', role: 'Director', manager_id: null, join_date: '2026-01-01', region: 'US' },
      { id: 2, name: 'Vikram Singh', email: 'vikram.singh@corp.com', role: 'Director', manager_id: null, join_date: '2026-01-01', region: 'IN' },

      // Senior Managers (id 3, 4, 5)
      { id: 3, name: 'Arun Kumar', email: 'arun.kumar@corp.com', role: 'Senior Manager', manager_id: 1, join_date: '2026-01-15', region: 'US' },
      { id: 4, name: 'Meena Krishnan', email: 'meena.k@corp.com', role: 'Senior Manager', manager_id: 1, join_date: '2026-01-15', region: 'IN' },
      { id: 5, name: 'Gautham R', email: 'gautham.r@corp.com', role: 'Senior Manager', manager_id: 2, join_date: '2026-01-15', region: 'UK' },

      // Managers (id 6, 7, 8, 9, 10)
      { id: 6, name: 'Karthik N', email: 'santhoshi.aids2023@citchennai.net', role: 'Manager', manager_id: 3, join_date: '2026-02-01', region: 'US' },
      { id: 7, name: 'Divya M', email: 'divya.m@corp.com', role: 'Manager', manager_id: 3, join_date: '2026-02-01', region: 'US' },
      { id: 8, name: 'Suresh P', email: 'suresh.p@corp.com', role: 'Manager', manager_id: 4, join_date: '2026-02-01', region: 'IN' },
      { id: 9, name: 'Sanjay V', email: 'sanjay.v@corp.com', role: 'Manager', manager_id: 4, join_date: '2026-02-01', region: 'IN' },
      { id: 10, name: 'Pooja K', email: 'pooja.k@corp.com', role: 'Manager', manager_id: 5, join_date: '2026-02-01', region: 'UK' },

      // Employees (id 11 - 20)
      { id: 11, name: 'Suresh Kumar', email: 'santhoshiyyappan033@gmail.com', role: 'Employee', manager_id: 6, join_date: '2026-02-15', region: 'US' },
      { id: 12, name: 'Ramesh V', email: 'ramesh.v@corp.com', role: 'Employee', manager_id: 6, join_date: '2026-02-15', region: 'US' },
      { id: 13, name: 'Priya S', email: 'priya.s@corp.com', role: 'Employee', manager_id: 7, join_date: '2026-02-15', region: 'US' },
      { id: 14, name: 'Anitha R', email: 'anitha.r@corp.com', role: 'Employee', manager_id: 7, join_date: '2026-02-15', region: 'US' },
      { id: 15, name: 'Naveen K', email: 'naveen.k@corp.com', role: 'Employee', manager_id: 8, join_date: '2026-02-15', region: 'IN' },
      { id: 16, name: 'Deepa M', email: 'deepa.m@corp.com', role: 'Employee', manager_id: 8, join_date: '2026-02-15', region: 'IN' },
      { id: 17, name: 'Vignesh P', email: 'vignesh.p@corp.com', role: 'Employee', manager_id: 9, join_date: '2026-02-15', region: 'IN' },
      { id: 18, name: 'Swetha T', email: 'swetha.t@corp.com', role: 'Employee', manager_id: 9, join_date: '2026-02-15', region: 'IN' },
      { id: 19, name: 'Arvind B', email: 'arvind.b@corp.com', role: 'Employee', manager_id: 10, join_date: '2026-02-15', region: 'UK' },
      { id: 20, name: 'Kripa N', email: 'kripa.n@corp.com', role: 'Employee', manager_id: 10, join_date: '2026-02-15', region: 'UK' }
    ];

    for (const u of usersData) {
      await pool.query(
        `INSERT INTO users (id, name, email, role, is_admin, employment_type, availability_status, join_date, accrual_rate_per_month, manager_id, region)
         VALUES ($1, $2, $3, $4, false, 'Full-Time', 'AVL', $5, 1.0, $6, $7)
         ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role, manager_id = EXCLUDED.manager_id;`,
        [u.id, u.name, u.email, u.role, u.join_date, u.manager_id, u.region]
      );
    }

    await pool.query("SELECT setval('users_id_seq', (SELECT MAX(id)+1 FROM users WHERE id < 100), false);");
    console.log("✓ 20 Corporate Hierarchy Users seeded successfully.");

    // Print Organizational Hierarchy Tree
    console.log("\n================ ORGANIZATIONAL HIERARCHY TREE ================");
    console.log(`
Rajesh Kumar (Director) [ID: 1]
 ├── Arun Kumar (Senior Manager) [ID: 3]
 │    ├── Karthik N (Manager) [ID: 6]
 │    │    ├── Suresh Kumar (Employee) [ID: 11]
 │    │    └── Ramesh V (Employee) [ID: 12]
 │    └── Divya M (Manager) [ID: 7]
 │         ├── Priya S (Employee) [ID: 13]
 │         └── Anitha R (Employee) [ID: 14]
 └── Meena Krishnan (Senior Manager) [ID: 4]
      ├── Suresh P (Manager) [ID: 8]
      │    ├── Naveen K (Employee) [ID: 15]  [Active Leave - UNAVL]
      │    └── Deepa M (Employee) [ID: 16]
      └── Sanjay V (Manager) [ID: 9]
           ├── Vignesh P (Employee) [ID: 17] [High Leave Utilizer]
           └── Swetha T (Employee) [ID: 18]

Vikram Singh (Director) [ID: 2]
 └── Gautham R (Senior Manager) [ID: 5]
      └── Pooja K (Manager) [ID: 10]
           ├── Arvind B (Employee) [ID: 19]
           └── Kripa N (Employee) [ID: 20]
`);
    console.log("===============================================================\n");

    // Seed Holidays
    const holidays = [
      ['US', '2026-01-01', 'New Year\'s Day'],
      ['US', '2026-07-04', 'Independence Day'],
      ['US', '2026-11-26', 'Thanksgiving Day'],
      ['US', '2026-12-25', 'Christmas Day'],
      ['IN', '2026-01-26', 'Republic Day'],
      ['IN', '2026-08-15', 'Independence Day'],
      ['IN', '2026-10-02', 'Gandhi Jayanti'],
      ['IN', '2026-11-08', 'Diwali'],
      ['UK', '2026-01-01', 'New Year\'s Day'],
      ['UK', '2026-04-03', 'Good Friday'],
      ['UK', '2026-05-04', 'Early May Bank Holiday'],
      ['UK', '2026-12-25', 'Christmas Day']
    ];

    for (const [region, holiday_date, name] of holidays) {
      await pool.query(
        `INSERT INTO holidays (region, holiday_date, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (region, holiday_date) DO UPDATE SET name = EXCLUDED.name;`,
        [region, holiday_date, name]
      );
    }
    console.log("✓ Corporate Holidays seeded across US, IN, UK.");

    // Seed Realistic Leave Requests
    // Current date is 2026-08-18
    const leavesData = [
      // Suresh Kumar (11): Low utilization (5 days)
      { userId: 11, startDate: '2026-04-13', endDate: '2026-04-14', days: 2, type: 'Annual Leave', reason: 'Personal errands', status: 'APPROVED', decidedBy: 'Approved by Karthik N (Manager)' },
      { userId: 11, startDate: '2026-06-15', endDate: '2026-06-17', days: 3, type: 'Casual Leave', reason: 'Family trip', status: 'APPROVED', decidedBy: 'Approved by Karthik N (Manager)' },

      // Ramesh V (12): Lowest utilization (2 days)
      { userId: 12, startDate: '2026-02-10', endDate: '2026-02-11', days: 2, type: 'Sick Leave', reason: 'Flu recovery', status: 'APPROVED', decidedBy: 'Approved by Karthik N (Manager)' },

      // Priya S (13): Medium-High utilization (14 days)
      { userId: 13, startDate: '2026-03-02', endDate: '2026-03-06', days: 5, type: 'Annual Leave', reason: 'Annual vacation', status: 'APPROVED', decidedBy: 'Approved by Divya M (Manager) → Arun Kumar (Senior Manager)' },
      { userId: 13, startDate: '2026-05-11', endDate: '2026-05-15', days: 5, type: 'Annual Leave', reason: 'Wedding trip', status: 'APPROVED', decidedBy: 'Approved by Divya M (Manager) → Arun Kumar (Senior Manager)' },
      { userId: 13, startDate: '2026-07-20', endDate: '2026-07-23', days: 4, type: 'Casual Leave', reason: 'House shifting', status: 'APPROVED', decidedBy: 'Approved by Divya M (Manager) → Arun Kumar (Senior Manager)' },

      // Anitha R (14): Low utilization (3 days)
      { userId: 14, startDate: '2026-01-19', endDate: '2026-01-21', days: 3, type: 'Casual Leave', reason: 'Family function', status: 'APPROVED', decidedBy: 'Approved by Divya M (Manager)' },

      // Naveen K (15): Currently ACTIVE Leave on 2026-08-18 (Status: UNAVL live check) (Total: 7d)
      { userId: 15, startDate: '2026-03-16', endDate: '2026-03-19', days: 4, type: 'Annual Leave', reason: 'Spring break', status: 'APPROVED', decidedBy: 'Approved by Suresh P (Manager)' },
      { userId: 15, startDate: '2026-08-17', endDate: '2026-08-19', days: 3, type: 'Sick Leave', reason: 'Hospital treatment', status: 'APPROVED', decidedBy: 'Approved by Suresh P (Manager)' },

      // Deepa M (16): Medium utilization (6 days)
      { userId: 16, startDate: '2026-05-04', endDate: '2026-05-09', days: 6, type: 'Annual Leave', reason: 'Summer holiday', status: 'APPROVED', decidedBy: 'Approved by Suresh P (Manager) → Meena Krishnan (Senior Manager)' },

      // Vignesh P (17): Highest utilization (16 days)
      { userId: 17, startDate: '2026-04-06', endDate: '2026-04-15', days: 8, type: 'Annual Leave', reason: 'Overseas tour', status: 'APPROVED', decidedBy: 'Approved by Sanjay V (Manager) → Meena Krishnan (Senior Manager)' },
      { userId: 17, startDate: '2026-07-06', endDate: '2026-07-15', days: 8, type: 'Annual Leave', reason: 'Medical procedure and rest', status: 'APPROVED', decidedBy: 'Approved by Sanjay V (Manager) → Meena Krishnan (Senior Manager)' },

      // Swetha T (18): Low utilization + 1 Pending request
      { userId: 18, startDate: '2026-03-23', endDate: '2026-03-24', days: 2, type: 'Casual Leave', reason: 'Personal work', status: 'APPROVED', decidedBy: 'Approved by Sanjay V (Manager)' },
      { userId: 18, startDate: '2026-09-14', endDate: '2026-09-16', days: 3, type: 'Annual Leave', reason: 'Festival visit', status: 'PENDING', approverId: 9, currentTier: 1, requiredTiers: 2 },

      // Arvind B (19): 4 days approved + 1 Pending request
      { userId: 19, startDate: '2026-06-08', endDate: '2026-06-11', days: 4, type: 'Annual Leave', reason: 'Family vacation', status: 'APPROVED', decidedBy: 'Approved by Pooja K (Manager)' },
      { userId: 19, startDate: '2026-09-21', endDate: '2026-09-22', days: 2, type: 'Sick Leave', reason: 'Dentist appointment', status: 'PENDING', approverId: 10, currentTier: 1, requiredTiers: 1 },

      // Kripa N (20): 1 day approved + 1 Withdrawn request + 1 Rejected request
      { userId: 20, startDate: '2026-02-23', endDate: '2026-02-23', days: 1, type: 'Casual Leave', reason: 'Passport renewal', status: 'APPROVED', decidedBy: 'Approved by Pooja K (Manager)' },
      { userId: 20, startDate: '2026-05-18', endDate: '2026-05-20', days: 3, type: 'Annual Leave', reason: 'Trip cancelled by requester', status: 'WITHDRAWN', decidedBy: 'Withdrawn by Requester' },
      { userId: 20, startDate: '2026-07-13', endDate: '2026-07-17', days: 5, type: 'Annual Leave', reason: 'Critical project sprint overlap', status: 'REJECTED', decidedBy: 'Rejected by Pooja K (Manager)' },

      // Managers and Senior Managers leave records
      { userId: 6, startDate: '2026-05-25', endDate: '2026-05-27', days: 3, type: 'Annual Leave', reason: 'Management summit & offsite', status: 'APPROVED', decidedBy: 'Approved by Arun Kumar (Senior Manager)' },
      { userId: 7, startDate: '2026-06-22', endDate: '2026-06-25', days: 4, type: 'Annual Leave', reason: 'Family leave', status: 'APPROVED', decidedBy: 'Approved by Arun Kumar (Senior Manager)' },
      { userId: 8, startDate: '2026-02-16', endDate: '2026-02-17', days: 2, type: 'Casual Leave', reason: 'Personal work', status: 'APPROVED', decidedBy: 'Approved by Meena Krishnan (Senior Manager)' },
      { userId: 9, startDate: '2026-03-09', endDate: '2026-03-11', days: 3, type: 'Sick Leave', reason: 'Doctor prescribed rest', status: 'APPROVED', decidedBy: 'Approved by Meena Krishnan (Senior Manager)' },
      { userId: 10, startDate: '2026-04-20', endDate: '2026-04-21', days: 2, type: 'Annual Leave', reason: 'Short break', status: 'APPROVED', decidedBy: 'Approved by Gautham R (Senior Manager)' },
      { userId: 3, startDate: '2026-01-26', endDate: '2026-01-27', days: 2, type: 'Annual Leave', reason: 'Post-holiday rest', status: 'APPROVED', decidedBy: 'Approved by Rajesh Kumar (Director)' },
      { userId: 4, startDate: '2026-04-27', endDate: '2026-04-29', days: 3, type: 'Annual Leave', reason: 'Family function', status: 'APPROVED', decidedBy: 'Approved by Rajesh Kumar (Director)' },
      { userId: 5, startDate: '2026-05-18', endDate: '2026-05-19', days: 2, type: 'Casual Leave', reason: 'Personal errands', status: 'APPROVED', decidedBy: 'Approved by Vikram Singh (Director)' },
      { userId: 1, startDate: '2026-07-27', endDate: '2026-07-30', days: 4, type: 'Annual Leave', reason: 'Executive retreat', status: 'APPROVED', decidedBy: 'Self-Approved (Director)' },
      { userId: 2, startDate: '2026-06-29', endDate: '2026-07-01', days: 3, type: 'Annual Leave', reason: 'Family vacation', status: 'APPROVED', decidedBy: 'Self-Approved (Director)' }
    ];

    for (const l of leavesData) {
      await pool.query(
        `INSERT INTO leave_requests (user_id, start_date, end_date, working_days, leave_type, reason, status, approver_id, current_tier, required_tiers, decided_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW() - INTERVAL '10 days')`,
        [
          l.userId,
          l.startDate,
          l.endDate,
          l.days,
          l.type,
          l.reason,
          l.status,
          l.approverId || null,
          l.currentTier || 1,
          l.requiredTiers || 1,
          l.decidedBy || null
        ]
      );
    }
    console.log(`✓ ${leavesData.length} Realistic leave history records seeded.`);
    console.log("==================================================");
    console.log("       Database Seeding Completed Successfully!   ");
    console.log("==================================================");
  } catch (err) {
    console.error("Error during seeding:", err);
  } finally {
    await pool.end();
  }
}

seed();
