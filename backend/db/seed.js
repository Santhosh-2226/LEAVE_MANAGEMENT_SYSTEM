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
    
    // Execute schema creation
    await pool.query(schemaSql);
    console.log("Schema tables created/verified successfully.");

    // 1. Seed Alice Johnson (HR Admin, ID 3, No Manager)
    const seedUser3Query = `
      INSERT INTO users (id, name, join_date, accrual_rate_per_month, manager_id)
      VALUES (3, 'Alice Johnson', '2023-01-01', 2.5, NULL)
      ON CONFLICT (id) DO UPDATE 
      SET name = EXCLUDED.name, 
          join_date = EXCLUDED.join_date, 
          accrual_rate_per_month = EXCLUDED.accrual_rate_per_month,
          manager_id = EXCLUDED.manager_id;
    `;
    await pool.query(seedUser3Query);

    // 2. Seed Bob Smith (Manager, ID 2, Manager: Alice Johnson)
    const seedUser2Query = `
      INSERT INTO users (id, name, join_date, accrual_rate_per_month, manager_id)
      VALUES (2, 'Bob Smith', '2024-06-01', 2.0, 3)
      ON CONFLICT (id) DO UPDATE 
      SET name = EXCLUDED.name, 
          join_date = EXCLUDED.join_date, 
          accrual_rate_per_month = EXCLUDED.accrual_rate_per_month,
          manager_id = EXCLUDED.manager_id;
    `;
    await pool.query(seedUser2Query);

    // 3. Seed Jane Doe (Employee, ID 1, Manager: Bob Smith)
    const seedUser1Query = `
      INSERT INTO users (id, name, join_date, accrual_rate_per_month, manager_id)
      VALUES (1, 'Jane Doe', '2025-01-15', 1.5, 2)
      ON CONFLICT (id) DO UPDATE 
      SET name = EXCLUDED.name, 
          join_date = EXCLUDED.join_date, 
          accrual_rate_per_month = EXCLUDED.accrual_rate_per_month,
          manager_id = EXCLUDED.manager_id;
    `;
    await pool.query(seedUser1Query);

    console.log("Test users seeded in hierarchical structure.");

    // Align serial sequence
    await pool.query("SELECT setval('users_id_seq', COALESCE((SELECT MAX(id)+1 FROM users), 1), false);");
    
    console.log("Database seeding completed successfully!");
  } catch (error) {
    console.error("Database seeding failed:", error);
  } finally {
    await pool.end();
  }
}

seed();
