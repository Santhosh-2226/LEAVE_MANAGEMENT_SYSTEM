DROP TABLE IF EXISTS leave_requests CASCADE;
DROP TABLE IF EXISTS holidays CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  join_date DATE NOT NULL,
  accrual_rate_per_month NUMERIC NOT NULL,
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
  created_at TIMESTAMP DEFAULT now()
);
