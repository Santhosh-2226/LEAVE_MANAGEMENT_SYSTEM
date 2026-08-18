DROP TABLE IF EXISTS leave_requests CASCADE;
DROP TABLE IF EXISTS holidays CASCADE;
DROP TABLE IF EXISTS accrual_policies CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
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

CREATE TABLE holidays (
  id SERIAL PRIMARY KEY,
  region TEXT NOT NULL,
  holiday_date DATE NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (region, holiday_date)
);

CREATE TABLE accrual_policies (
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

CREATE TABLE leave_requests (
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
