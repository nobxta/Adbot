-- ================================
-- HQAdz Database Schema (SAFE)
-- Supabase-compatible, re-runnable
-- ================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================
-- USERS TABLE
-- ================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT,  -- Optional: Users can be created with access_code + password only
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  access_code TEXT UNIQUE NOT NULL,
  password_hash TEXT,  -- Bcrypt hashed password (optional - for password authentication)
  license_key TEXT UNIQUE,
  bot_id TEXT,
  plan_type TEXT CHECK (plan_type IN ('starter', 'enterprise')),
  plan_status TEXT CHECK (plan_status IN ('active', 'inactive', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

-- Create unique partial index for email (only when email IS NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email) WHERE email IS NOT NULL;

-- ================================
-- PAYMENTS TABLE
-- ================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('starter', 'enterprise')),
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (payment_status IN ('waiting', 'confirming', 'paid', 'finished', 'failed', 'expired')),
  payment_address TEXT,
  payment_amount TEXT,
  payment_currency TEXT,
  actually_paid TEXT,
  order_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ================================
-- BOTS TABLE
-- ================================
CREATE TABLE IF NOT EXISTS bots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'inactive'
    CHECK (status IN ('active', 'inactive', 'paused')),
  messages_sent INTEGER DEFAULT 0,
  groups_reached INTEGER DEFAULT 0,
  uptime_hours DECIMAL(10, 2) DEFAULT 0,
  last_activity TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================
-- ACCESS CODES TABLE
-- ================================
CREATE TABLE IF NOT EXISTS access_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- ================================
-- INDEXES
-- ================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_access_code ON users(access_code);
CREATE INDEX IF NOT EXISTS idx_users_license_key ON users(license_key);

CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments(payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_email ON payments(email);

CREATE INDEX IF NOT EXISTS idx_bots_user_id ON bots(user_id);
CREATE INDEX IF NOT EXISTS idx_bots_bot_id ON bots(bot_id);

CREATE INDEX IF NOT EXISTS idx_access_codes_code ON access_codes(code);
CREATE INDEX IF NOT EXISTS idx_access_codes_user_id ON access_codes(user_id);

-- ================================
-- UPDATED_AT FUNCTION
-- ================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ================================
-- DROP & RECREATE TRIGGERS (IMPORTANT)
-- ================================

-- USERS
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- PAYMENTS
DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- BOTS
DROP TRIGGER IF EXISTS update_bots_updated_at ON bots;
CREATE TRIGGER update_bots_updated_at
BEFORE UPDATE ON bots
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ================================
-- ROW LEVEL SECURITY
-- ================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_codes ENABLE ROW LEVEL SECURITY;

-- ================================
-- POLICIES
-- ================================

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users read own data" ON users;
DROP POLICY IF EXISTS "Users update own data" ON users;
DROP POLICY IF EXISTS "Users read own payments" ON payments;
DROP POLICY IF EXISTS "Users read own bots" ON bots;
DROP POLICY IF EXISTS "Users update own bots" ON bots;

-- Users: read own or admin
CREATE POLICY "Users read own data"
ON users FOR SELECT
USING (auth.uid()::text = id::text OR role = 'admin');

-- Users: update own data
CREATE POLICY "Users update own data"
ON users FOR UPDATE
USING (auth.uid()::text = id::text);

-- Payments: read own or admin
CREATE POLICY "Users read own payments"
ON payments FOR SELECT
USING (
  auth.uid()::text = user_id::text OR
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = payments.user_id AND u.role = 'admin'
  )
);

-- Bots: read own or admin
CREATE POLICY "Users read own bots"
ON bots FOR SELECT
USING (
  auth.uid()::text = user_id::text OR
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = bots.user_id AND u.role = 'admin'
  )
);

-- Bots: update own
CREATE POLICY "Users update own bots"
ON bots FOR UPDATE
USING (auth.uid()::text = user_id::text);

-- ================================
-- SEED USERS (SAFE)
-- ================================
INSERT INTO users (email, role, access_code, license_key, plan_status)
VALUES ('admin@hqadz.com', 'admin', 'ADMIN123', 'ADMIN-LICENSE-KEY-001', 'active')
ON CONFLICT (access_code) DO NOTHING;

INSERT INTO users (email, role, access_code, license_key, plan_status)
VALUES ('user@example.com', 'user', 'USER123', 'USER-LICENSE-KEY-001', 'inactive')
ON CONFLICT (access_code) DO NOTHING;
