import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seed() {
  try {
    console.log("Starting database seeding...");
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await pool.query(schemaSql);
    console.log("Schema created.");

    // Seed default accrual policies
    await pool.query(`
      INSERT INTO accrual_policies (id, base_leave, employee_rate, manager_rate, senior_manager_rate, director_rate, vp_rate, part_time_rate)
      VALUES (1, 10.0, 1.0, 2.0, 4.0, 5.0, 5.0, 0.5)
      ON CONFLICT (id) DO UPDATE
      SET base_leave = EXCLUDED.base_leave,
          employee_rate = EXCLUDED.employee_rate,
          manager_rate = EXCLUDED.manager_rate,
          senior_manager_rate = EXCLUDED.senior_manager_rate,
          director_rate = EXCLUDED.director_rate,
          vp_rate = EXCLUDED.vp_rate,
          part_time_rate = EXCLUDED.part_time_rate;
    `);
    console.log("Accrual policies seeded.");

    // System Administrator (Separate entity, not in job hierarchy)
    await pool.query(`
      INSERT INTO users (id, name, role, is_admin, employment_type, availability_status, join_date, accrual_rate_per_month, manager_id, region)
      VALUES (100, 'System Administrator', 'HR Admin', true, 'Full-Time', 'AVL', '2020-01-01', 0, NULL, 'US')
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, role = EXCLUDED.role, is_admin = EXCLUDED.is_admin,
          employment_type = EXCLUDED.employment_type, region = EXCLUDED.region;
    `);

    // Level 5: Vice President (Top corporate executive, no manager)
    await pool.query(`
      INSERT INTO users (id, name, role, is_admin, employment_type, availability_status, join_date, accrual_rate_per_month, manager_id, region)
      VALUES (5, 'Diana Ross', 'Vice President', false, 'Full-Time', 'AVL', '2021-01-01', 5.0, NULL, 'US')
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, role = EXCLUDED.role, is_admin = EXCLUDED.is_admin,
          employment_type = EXCLUDED.employment_type, join_date = EXCLUDED.join_date,
          accrual_rate_per_month = EXCLUDED.accrual_rate_per_month,
          manager_id = EXCLUDED.manager_id, region = EXCLUDED.region;
    `);

    // Level 4: Director (Reports to VP - Diana Ross)
    await pool.query(`
      INSERT INTO users (id, name, role, is_admin, employment_type, availability_status, join_date, accrual_rate_per_month, manager_id, region)
      VALUES (4, 'Carlos Gomez', 'Director', false, 'Full-Time', 'AVL', '2022-03-01', 5.0, 5, 'US')
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, role = EXCLUDED.role, is_admin = EXCLUDED.is_admin,
          employment_type = EXCLUDED.employment_type, join_date = EXCLUDED.join_date,
          accrual_rate_per_month = EXCLUDED.accrual_rate_per_month,
          manager_id = EXCLUDED.manager_id, region = EXCLUDED.region;
    `);

    // Level 3: Senior Manager (Reports to Director - Carlos Gomez)
    await pool.query(`
      INSERT INTO users (id, name, role, is_admin, employment_type, availability_status, join_date, accrual_rate_per_month, manager_id, region)
      VALUES (3, 'Alice Johnson', 'Senior Manager', false, 'Full-Time', 'AVL', '2023-01-01', 4.0, 4, 'US')
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, role = EXCLUDED.role, is_admin = EXCLUDED.is_admin,
          employment_type = EXCLUDED.employment_type, join_date = EXCLUDED.join_date,
          accrual_rate_per_month = EXCLUDED.accrual_rate_per_month,
          manager_id = EXCLUDED.manager_id, region = EXCLUDED.region;
    `);

    // Level 2: Manager (Reports to Senior Manager - Alice Johnson)
    await pool.query(`
      INSERT INTO users (id, name, role, is_admin, employment_type, availability_status, join_date, accrual_rate_per_month, manager_id, region)
      VALUES (2, 'Bob Smith', 'Manager', false, 'Full-Time', 'AVL', '2024-06-01', 2.0, 3, 'UK')
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, role = EXCLUDED.role, is_admin = EXCLUDED.is_admin,
          employment_type = EXCLUDED.employment_type, join_date = EXCLUDED.join_date,
          accrual_rate_per_month = EXCLUDED.accrual_rate_per_month,
          manager_id = EXCLUDED.manager_id, region = EXCLUDED.region;
    `);

    // Level 1: Employee (Reports to Manager - Bob Smith)
    await pool.query(`
      INSERT INTO users (id, name, role, is_admin, employment_type, availability_status, join_date, accrual_rate_per_month, manager_id, region)
      VALUES (1, 'Jane Doe', 'Employee', false, 'Full-Time', 'AVL', '2025-01-15', 1.0, 2, 'IN')
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, role = EXCLUDED.role, is_admin = EXCLUDED.is_admin,
          employment_type = EXCLUDED.employment_type, join_date = EXCLUDED.join_date,
          accrual_rate_per_month = EXCLUDED.accrual_rate_per_month,
          manager_id = EXCLUDED.manager_id, region = EXCLUDED.region;
    `);

    console.log("Hierarchy Users and Separate Admin seeded successfully.");

    await pool.query("SELECT setval('users_id_seq', COALESCE((SELECT MAX(id)+1 FROM users WHERE id < 100), 6), false);");

    const holidays = [
      ['US', '2026-07-04', 'Independence Day'],
      ['US', '2026-11-26', 'Thanksgiving'],
      ['US', '2026-12-25', 'Christmas Day'],
      ['IN', '2026-08-15', 'Independence Day'],
      ['IN', '2026-10-02', 'Gandhi Jayanti'],
      ['IN', '2026-10-20', 'Diwali'],
      ['UK', '2026-08-31', 'Summer Bank Holiday'],
      ['UK', '2026-12-25', 'Christmas Day'],
      ['UK', '2026-12-28', 'Boxing Day (substitute)'],
    ];

    for (const [region, holiday_date, name] of holidays) {
      await pool.query(
        `INSERT INTO holidays (region, holiday_date, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (region, holiday_date) DO UPDATE SET name = EXCLUDED.name;`,
        [region, holiday_date, name]
      );
    }

    console.log("Holidays seeded.");
    console.log("Database seeding completed!");
  } catch (error) {
    console.error("Seeding failed:", error);
  } finally {
    await pool.end();
  }
}

seed();
