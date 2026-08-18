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

    await pool.query(`
      INSERT INTO users (id, name, join_date, accrual_rate_per_month, manager_id, region)
      VALUES (3, 'Alice Johnson', '2023-01-01', 2.5, NULL, 'US')
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, join_date = EXCLUDED.join_date,
          accrual_rate_per_month = EXCLUDED.accrual_rate_per_month,
          manager_id = EXCLUDED.manager_id, region = EXCLUDED.region;
    `);

    await pool.query(`
      INSERT INTO users (id, name, join_date, accrual_rate_per_month, manager_id, region)
      VALUES (2, 'Bob Smith', '2024-06-01', 2.0, 3, 'UK')
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, join_date = EXCLUDED.join_date,
          accrual_rate_per_month = EXCLUDED.accrual_rate_per_month,
          manager_id = EXCLUDED.manager_id, region = EXCLUDED.region;
    `);

    await pool.query(`
      INSERT INTO users (id, name, join_date, accrual_rate_per_month, manager_id, region)
      VALUES (1, 'Jane Doe', '2025-01-15', 1.5, 2, 'IN')
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, join_date = EXCLUDED.join_date,
          accrual_rate_per_month = EXCLUDED.accrual_rate_per_month,
          manager_id = EXCLUDED.manager_id, region = EXCLUDED.region;
    `);

    console.log("Users seeded.");

    await pool.query("SELECT setval('users_id_seq', COALESCE((SELECT MAX(id)+1 FROM users), 1), false);");

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

    console.log("Holidays seeded (US, IN, UK).");
    console.log("Database seeding completed!");
  } catch (error) {
    console.error("Seeding failed:", error);
  } finally {
    await pool.end();
  }
}

seed();
