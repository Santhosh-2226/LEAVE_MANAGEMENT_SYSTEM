import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const query = (text, params) => pool.query(text, params);

/**
 * Safely ensures required tables exist without dropping any existing tables or data
 */
export async function initDbTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS slack_integrations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        slack_user_id TEXT NOT NULL,
        slack_team_id TEXT,
        encrypted_access_token TEXT NOT NULL,
        slack_user_name TEXT,
        connected_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS slack_status_jobs (
        id SERIAL PRIMARY KEY,
        leave_id INTEGER NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        job_type TEXT NOT NULL,
        scheduled_at TIMESTAMP NOT NULL,
        status_text TEXT NOT NULL,
        status_emoji TEXT NOT NULL DEFAULT ':beach_with_umbrella:',
        status TEXT NOT NULL DEFAULT 'PENDING',
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        last_error TEXT,
        previous_status_text TEXT,
        previous_status_emoji TEXT,
        executed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_slack_jobs_due ON slack_status_jobs (status, scheduled_at);
    `);
  } catch (err) {
    console.error('Error initializing tables:', err.message);
  }
}
