CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'Employee',
  is_admin BOOLEAN NOT NULL DEFAULT false,
  employment_type TEXT NOT NULL DEFAULT 'Full-Time',
  availability_status TEXT NOT NULL DEFAULT 'AVL',
  delegate_id INTEGER REFERENCES users(id),
  join_date DATE NOT NULL,
  accrual_rate_per_month NUMERIC NOT NULL DEFAULT 1.0,
  manager_id INTEGER REFERENCES users(id),
  region TEXT NOT NULL DEFAULT 'US'
);

CREATE TABLE IF NOT EXISTS holidays (
  id SERIAL PRIMARY KEY,
  region TEXT NOT NULL,
  holiday_date DATE NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (region, holiday_date)
);

CREATE TABLE IF NOT EXISTS accrual_policies (
  id SERIAL PRIMARY KEY,
  base_leave NUMERIC NOT NULL DEFAULT 10.0,
  employee_rate NUMERIC NOT NULL DEFAULT 1.0,
  manager_rate NUMERIC NOT NULL DEFAULT 2.0,
  senior_manager_rate NUMERIC NOT NULL DEFAULT 4.0,
  director_rate NUMERIC NOT NULL DEFAULT 5.0,
  vp_rate NUMERIC NOT NULL DEFAULT 5.0,
  part_time_rate NUMERIC NOT NULL DEFAULT 0.5,
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  working_days NUMERIC NOT NULL,
  leave_type TEXT NOT NULL DEFAULT 'Annual Leave',
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  approver_id INTEGER REFERENCES users(id),
  current_tier INTEGER NOT NULL DEFAULT 1,
  required_tiers INTEGER NOT NULL DEFAULT 1,
  approval_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  decided_by TEXT,
  created_at TIMESTAMP DEFAULT now()
);

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
