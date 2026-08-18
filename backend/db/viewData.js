import { pool } from './pool.js';

async function viewData() {
  try {
    console.log("=== DB VIEW SCRIPT ===");
    
    const usersRes = await pool.query('SELECT * FROM users');
    console.log("\n--- USERS TABLE ---");
    console.table(usersRes.rows);

    const requestsRes = await pool.query('SELECT * FROM leave_requests ORDER BY id ASC');
    console.log("\n--- LEAVE_REQUESTS TABLE ---");
    console.table(requestsRes.rows);

  } catch (error) {
    console.error("Error viewing data:", error);
  } finally {
    await pool.end();
  }
}

viewData();
