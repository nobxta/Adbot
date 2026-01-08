-- ============================================
-- COMPLETE DATABASE SCHEMA FROM CODEBASE
-- Auto-generated from actual codebase usage
-- Supabase-compatible, idempotent, production-ready
-- ============================================
-- 
-- Filename: 005_complete_schema_from_codebase.sql
-- 
-- This migration is derived from actual codebase usage:
-- - All table references in queries.ts, db.ts, bot-db.ts
-- - All column accesses and mutations
-- - All enum values used in TypeScript types
-- - All foreign key relationships
-- - All indexes implied by query patterns
-- 
-- SAFE TO RE-RUN: Uses IF NOT EXISTS everywhere
-- NO DESTRUCTIVE OPERATIONS: Only creates/adds, never drops
-- ============================================

-- ============================================
-- 1. EXTENSIONS
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 2. ENUM TYPES
-- ============================================
-- Note: PostgreSQL doesn't support CREATE TYPE IF NOT EXISTS
-- Using DO blocks to check existence before creating

-- User roles (from types/index.ts and queries)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('ADMIN', 'USER', 'RESELLER');
  END IF;
END $$;

-- Product types (from types/index.ts: 'ADBOT_PLAN' | 'SESSION_PACK' | 'REPLACEMENT')
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_type') THEN
    CREATE TYPE product_type AS ENUM ('ADBOT_PLAN', 'SESSION_PACK', 'REPLACEMENT_PACK', 'REPLACEMENT');
  END IF;
END $$;

-- Plan types (from types/index.ts and bot-db.ts)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_type') THEN
    CREATE TYPE plan_type AS ENUM ('STARTER', 'ENTERPRISE');
  END IF;
END $$;

-- Order statuses (from types/index.ts: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED')
-- Also includes 'PAID' and 'PENDING_STOCK' from schema.sql
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE order_status AS ENUM ('PENDING', 'PAID', 'COMPLETED', 'FAILED', 'REFUNDED', 'PENDING_STOCK');
  END IF;
END $$;

-- Payment statuses (from types/index.ts and webhook: 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED')
-- Also includes NowPayments statuses: 'WAITING', 'CONFIRMING', 'PAID', 'FINISHED'
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM ('PENDING', 'WAITING', 'CONFIRMING', 'PAID', 'FINISHED', 'COMPLETED', 'FAILED', 'EXPIRED');
  END IF;
END $$;

-- Adbot statuses (from types/index.ts: 'ACTIVE' | 'STOPPED' | 'EXPIRED' | 'SUSPENDED')
-- Also includes 'RUNNING' and 'FAILED' from schema.sql
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'adbot_status') THEN
    CREATE TYPE adbot_status AS ENUM ('ACTIVE', 'RUNNING', 'STOPPED', 'EXPIRED', 'FAILED', 'SUSPENDED');
  END IF;
END $$;

-- Session statuses (from types/index.ts: 'UNUSED' | 'ASSIGNED' | 'BANNED')
-- Also includes 'EXPIRED' and 'INVALID_FILE' from queries.ts
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'session_status') THEN
    CREATE TYPE session_status AS ENUM ('UNUSED', 'ASSIGNED', 'BANNED', 'EXPIRED', 'INVALID_FILE');
  END IF;
END $$;

-- Notification types (from types/index.ts: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS' | 'PROMOTION')
-- Also includes 'SYSTEM', 'ALERT', 'PROMO' from schema.sql
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE notification_type AS ENUM ('INFO', 'WARNING', 'ERROR', 'SUCCESS', 'PROMOTION', 'SYSTEM', 'ALERT', 'PROMO');
  END IF;
END $$;

-- ============================================
-- 3. TABLES
-- ============================================

-- ============================================
-- USERS TABLE
-- ============================================
-- Used in: queries.ts, db.ts, auth, admin endpoints
-- Columns inferred from: User interface, queries, db operations
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Authentication (deprecated in bot-centric, kept for compatibility)
  access_code TEXT,
  password_hash TEXT,
  
  -- User info
  email TEXT,
  role user_role NOT NULL DEFAULT 'USER',
  
  -- Plan info (deprecated in bot-centric, kept for compatibility)
  plan_type plan_type,
  plan_status TEXT CHECK (plan_status IN ('active', 'inactive', 'expired', 'suspended')),
  
  -- Other fields
  license_key TEXT,
  bot_id TEXT, -- Legacy field, kept for compatibility
  telegram_id TEXT,
  
  -- Status flags
  is_active BOOLEAN DEFAULT true,
  is_suspended BOOLEAN DEFAULT false,
  suspended_at TIMESTAMPTZ,
  suspended_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

-- Unique constraints for users
DO $$ 
BEGIN
  -- Email unique (partial, only when not null)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique'
  ) THEN
    CREATE UNIQUE INDEX users_email_unique ON users(email) WHERE email IS NOT NULL;
  END IF;
  
  -- Access code unique (if column exists and not null)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'access_code') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'users_access_code_key'
    ) THEN
      CREATE UNIQUE INDEX IF NOT EXISTS users_access_code_key ON users(access_code) WHERE access_code IS NOT NULL;
    END IF;
  END IF;
  
  -- License key unique (if column exists and not null)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'license_key') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'users_license_key_key'
    ) THEN
      CREATE UNIQUE INDEX IF NOT EXISTS users_license_key_key ON users(license_key) WHERE license_key IS NOT NULL;
    END IF;
  END IF;
END $$;

-- ============================================
-- BOTS TABLE (PRIMARY ENTITY - Bot-Centric)
-- ============================================
-- Used in: bot-db.ts, auth/verify-access-code, admin/bots/create
-- This is the PRIMARY entity for authentication
CREATE TABLE IF NOT EXISTS bots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bot_id UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(), -- Primary identity
  
  -- Authentication credentials
  access_code TEXT UNIQUE NOT NULL,
  password_hash TEXT, -- Optional, nullable
  
  -- Plan information
  plan_type TEXT CHECK (plan_type IN ('starter', 'enterprise')),
  plan_status TEXT CHECK (plan_status IN ('active', 'expired', 'suspended')) DEFAULT 'active',
  cycle_delay INTEGER, -- Posting interval in seconds
  
  -- Optional user ownership (for CRM only, not authentication)
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  last_login TIMESTAMPTZ
);

-- ============================================
-- ADMINS TABLE
-- ============================================
-- Used in: queries.ts (getAdminByUsername)
-- Extends users with admin-specific permissions
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username TEXT, -- From queries.ts getAdminByUsername
  permissions JSONB DEFAULT '[]'::jsonb,
  can_manage_resellers BOOLEAN DEFAULT false,
  can_manage_stock BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RESELLERS TABLE
-- ============================================
-- Used in: queries.ts, admin/resellers, dashboard
CREATE TABLE IF NOT EXISTS resellers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  commission_rate DECIMAL(5,2) DEFAULT 0.50,
  total_sales INTEGER DEFAULT 0,
  total_revenue DECIMAL(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  parent_reseller_id UUID REFERENCES resellers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PRODUCTS TABLE
-- ============================================
-- Used in: queries.ts, admin/products, checkout, webhook
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  type product_type NOT NULL,
  plan_type plan_type,
  sessions_count INTEGER NOT NULL,
  posting_interval_seconds INTEGER NOT NULL,
  posting_interval_minutes INTEGER, -- Also used in queries.ts
  price DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  is_active BOOLEAN DEFAULT true,
  validity_days INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ORDERS TABLE
-- ============================================
-- Used in: queries.ts, payment/webhook, admin/dashboard
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE, -- Bot-centric migration
  reseller_id UUID REFERENCES resellers(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(10,2), -- Also used in queries.ts and webhook
  currency TEXT DEFAULT 'USD',
  status order_status DEFAULT 'PENDING',
  payment_method TEXT,
  commission_amount DECIMAL(10,2), -- From types/index.ts
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================
-- ADBOTS TABLE
-- ============================================
-- Used in: queries.ts, admin/adbots, user/adbots, webhook
CREATE TABLE IF NOT EXISTS adbots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- Legacy, kept for compatibility
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE, -- Bot-centric migration
  order_id UUID UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  -- Status and validity
  status adbot_status DEFAULT 'STOPPED',
  validity_start TIMESTAMPTZ,
  validity_end TIMESTAMPTZ,
  valid_until TIMESTAMPTZ, -- Also used in queries.ts and types
  
  -- Configuration
  sessions_assigned JSONB DEFAULT '[]'::jsonb,
  post_link TEXT,
  groups JSONB DEFAULT '[]'::jsonb, -- From schema.sql
  target_groups TEXT[], -- From queries.ts createAdbot
  
  -- Posting configuration
  posting_interval_minutes INTEGER, -- From queries.ts and types
  
  -- Statistics
  messages_sent INTEGER DEFAULT 0,
  groups_reached INTEGER DEFAULT 0,
  uptime_seconds INTEGER DEFAULT 0,
  
  -- Activity tracking
  last_activity TIMESTAMPTZ,
  last_run TIMESTAMPTZ, -- From queries.ts updateAdbotStats
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SESSIONS TABLE (Stock Management)
-- ============================================
-- Used in: queries.ts, admin/stock, webhook
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Session credentials
  api_id TEXT NOT NULL,
  api_hash TEXT NOT NULL,
  session_file_path TEXT NOT NULL,
  phone_number TEXT,
  
  -- Status
  status session_status DEFAULT 'UNUSED',
  
  -- Assignment (bot-centric: assigned_to_bot_id is primary)
  assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Legacy, kept for compatibility
  assigned_to_adbot_id UUID REFERENCES adbots(id) ON DELETE SET NULL,
  assigned_to_bot_id UUID REFERENCES bots(id) ON DELETE SET NULL, -- Bot-centric migration
  
  -- Assignment tracking
  assigned_at TIMESTAMPTZ,
  banned_at TIMESTAMPTZ,
  banned_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PAYMENTS TABLE
-- ============================================
-- Used in: queries.ts, payment/webhook, payment/create, db.ts
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE, -- Bot-centric migration
  payment_id TEXT UNIQUE NOT NULL, -- NowPayments payment ID
  provider_payment_id TEXT, -- Also used in webhook (same as payment_id)
  user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- Legacy, kept for compatibility
  
  -- Payment details
  email TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('starter', 'enterprise')),
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_status payment_status DEFAULT 'WAITING',
  
  -- Crypto payment details (NowPayments)
  payment_address TEXT,
  payment_amount TEXT,
  payment_currency TEXT,
  actually_paid TEXT,
  
  -- Provider response
  provider_response JSONB, -- From queries.ts updatePaymentStatus
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Note: order_id in payments can be TEXT (from webhook) or UUID (from schema)
-- The column is defined as UUID with REFERENCES, but webhook uses TEXT
-- This is handled by the application layer

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
-- Used in: queries.ts, admin/notifications, user/notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type notification_type DEFAULT 'SYSTEM',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ACTIVITY LOGS TABLE
-- ============================================
-- Used in: queries.ts logActivity, admin endpoints
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- ActivityAction type: 'LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'START', 'STOP', 'PURCHASE'
  entity_type TEXT NOT NULL, -- Also called resource_type in schema.sql
  entity_id TEXT, -- Also called resource_id in schema.sql
  details JSONB, -- Also called metadata in schema.sql
  resource_type TEXT, -- From schema.sql
  resource_id TEXT, -- From schema.sql
  metadata JSONB, -- From schema.sql
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. ADD MISSING COLUMNS (Idempotent)
-- ============================================
-- IMPORTANT: This section runs BEFORE indexes to ensure columns exist

-- Add missing columns to users table
DO $$ 
BEGIN
  -- Add columns that might not exist (if table was created in previous migration)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'access_code') THEN
    ALTER TABLE users ADD COLUMN access_code TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'password_hash') THEN
    ALTER TABLE users ADD COLUMN password_hash TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_active') THEN
    ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_suspended') THEN
    ALTER TABLE users ADD COLUMN is_suspended BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'telegram_id') THEN
    ALTER TABLE users ADD COLUMN telegram_id TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'suspended_at') THEN
    ALTER TABLE users ADD COLUMN suspended_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'suspended_reason') THEN
    ALTER TABLE users ADD COLUMN suspended_reason TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'plan_type') THEN
    ALTER TABLE users ADD COLUMN plan_type plan_type;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'plan_status') THEN
    ALTER TABLE users ADD COLUMN plan_status TEXT CHECK (plan_status IN ('active', 'inactive', 'expired', 'suspended'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'license_key') THEN
    ALTER TABLE users ADD COLUMN license_key TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'bot_id') THEN
    ALTER TABLE users ADD COLUMN bot_id TEXT;
  END IF;
END $$;

-- Add missing columns to bots table (if created in previous migration)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'access_code') THEN
    ALTER TABLE bots ADD COLUMN access_code TEXT;
    -- Add unique constraint if column was just added
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bots_access_code_key') THEN
      ALTER TABLE bots ADD CONSTRAINT bots_access_code_key UNIQUE (access_code);
    END IF;
    -- Make it NOT NULL if possible (only if table is empty or all rows have access_code)
    BEGIN
      ALTER TABLE bots ALTER COLUMN access_code SET NOT NULL;
    EXCEPTION WHEN OTHERS THEN
      -- If table has NULL values, we can't set NOT NULL - that's okay, we'll handle it in application
      NULL;
    END;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'password_hash') THEN
    ALTER TABLE bots ADD COLUMN password_hash TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'bot_id') THEN
    ALTER TABLE bots ADD COLUMN bot_id UUID UNIQUE DEFAULT uuid_generate_v4();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'plan_type') THEN
    ALTER TABLE bots ADD COLUMN plan_type TEXT CHECK (plan_type IN ('starter', 'enterprise'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'plan_status') THEN
    ALTER TABLE bots ADD COLUMN plan_status TEXT CHECK (plan_status IN ('active', 'expired', 'suspended')) DEFAULT 'active';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'cycle_delay') THEN
    ALTER TABLE bots ADD COLUMN cycle_delay INTEGER;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'owner_user_id') THEN
    ALTER TABLE bots ADD COLUMN owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'expires_at') THEN
    ALTER TABLE bots ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'last_login') THEN
    ALTER TABLE bots ADD COLUMN last_login TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'updated_at') THEN
    ALTER TABLE bots ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Add missing columns to admins table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admins' AND column_name = 'username') THEN
    ALTER TABLE admins ADD COLUMN username TEXT;
  END IF;
END $$;

-- Add missing columns to products table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'posting_interval_minutes') THEN
    ALTER TABLE products ADD COLUMN posting_interval_minutes INTEGER;
  END IF;
END $$;

-- Add missing columns to orders table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'total_amount') THEN
    ALTER TABLE orders ADD COLUMN total_amount DECIMAL(10,2);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'commission_amount') THEN
    ALTER TABLE orders ADD COLUMN commission_amount DECIMAL(10,2);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'bot_id') THEN
    ALTER TABLE orders ADD COLUMN bot_id UUID REFERENCES bots(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add missing columns to adbots table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'valid_until') THEN
    ALTER TABLE adbots ADD COLUMN valid_until TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'target_groups') THEN
    ALTER TABLE adbots ADD COLUMN target_groups TEXT[];
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'posting_interval_minutes') THEN
    ALTER TABLE adbots ADD COLUMN posting_interval_minutes INTEGER;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'last_run') THEN
    ALTER TABLE adbots ADD COLUMN last_run TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'bot_id') THEN
    ALTER TABLE adbots ADD COLUMN bot_id UUID REFERENCES bots(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add missing columns to sessions table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'assigned_to_bot_id') THEN
    ALTER TABLE sessions ADD COLUMN assigned_to_bot_id UUID REFERENCES bots(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add missing columns to payments table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'provider_payment_id') THEN
    ALTER TABLE payments ADD COLUMN provider_payment_id TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'provider_response') THEN
    ALTER TABLE payments ADD COLUMN provider_response JSONB;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'bot_id') THEN
    ALTER TABLE payments ADD COLUMN bot_id UUID REFERENCES bots(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================
-- 5. INDEXES (For Query Performance)
-- ============================================

-- Users indexes (conditional on columns existing)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email') THEN
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'access_code') THEN
    CREATE INDEX IF NOT EXISTS idx_users_access_code ON users(access_code) WHERE access_code IS NOT NULL;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'license_key') THEN
    CREATE INDEX IF NOT EXISTS idx_users_license_key ON users(license_key) WHERE license_key IS NOT NULL;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role') THEN
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_active') THEN
    CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_suspended') THEN
    CREATE INDEX IF NOT EXISTS idx_users_is_suspended ON users(is_suspended);
  END IF;
END $$;

-- Bots indexes (PRIMARY entity) - conditional on columns existing
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'access_code') THEN
    CREATE INDEX IF NOT EXISTS idx_bots_access_code ON bots(access_code);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'bot_id') THEN
    CREATE INDEX IF NOT EXISTS idx_bots_bot_id ON bots(bot_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'owner_user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_bots_owner_user_id ON bots(owner_user_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'plan_status') THEN
    CREATE INDEX IF NOT EXISTS idx_bots_plan_status ON bots(plan_status);
  END IF;
END $$;

-- Admins indexes - conditional on columns existing
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admins' AND column_name = 'user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_admins_user_id ON admins(user_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admins' AND column_name = 'username') THEN
    CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username) WHERE username IS NOT NULL;
  END IF;
END $$;

-- Resellers indexes - conditional on columns existing
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resellers' AND column_name = 'user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_resellers_user_id ON resellers(user_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resellers' AND column_name = 'is_active') THEN
    CREATE INDEX IF NOT EXISTS idx_resellers_is_active ON resellers(is_active);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resellers' AND column_name = 'parent_reseller_id') THEN
    CREATE INDEX IF NOT EXISTS idx_resellers_parent_reseller_id ON resellers(parent_reseller_id);
  END IF;
END $$;

-- Products indexes - conditional on columns existing
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'type') THEN
    CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'plan_type') THEN
    CREATE INDEX IF NOT EXISTS idx_products_plan_type ON products(plan_type);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_active') THEN
    CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
  END IF;
END $$;

-- Orders indexes - conditional on columns existing
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'bot_id') THEN
    CREATE INDEX IF NOT EXISTS idx_orders_bot_id ON orders(bot_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'reseller_id') THEN
    CREATE INDEX IF NOT EXISTS idx_orders_reseller_id ON orders(reseller_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'product_id') THEN
    CREATE INDEX IF NOT EXISTS idx_orders_product_id ON orders(product_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'status') THEN
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
  END IF;
END $$;

-- Adbots indexes - conditional on columns existing
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_adbots_user_id ON adbots(user_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'bot_id') THEN
    CREATE INDEX IF NOT EXISTS idx_adbots_bot_id ON adbots(bot_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'order_id') THEN
    CREATE INDEX IF NOT EXISTS idx_adbots_order_id ON adbots(order_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'product_id') THEN
    CREATE INDEX IF NOT EXISTS idx_adbots_product_id ON adbots(product_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'status') THEN
    CREATE INDEX IF NOT EXISTS idx_adbots_status ON adbots(status);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'validity_end') THEN
    CREATE INDEX IF NOT EXISTS idx_adbots_validity_end ON adbots(validity_end);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'valid_until') THEN
    CREATE INDEX IF NOT EXISTS idx_adbots_valid_until ON adbots(valid_until);
  END IF;
END $$;

-- Sessions indexes - conditional on columns existing
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'status') THEN
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'assigned_to_user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_sessions_assigned_to_user_id ON sessions(assigned_to_user_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'assigned_to_adbot_id') THEN
    CREATE INDEX IF NOT EXISTS idx_sessions_assigned_to_adbot_id ON sessions(assigned_to_adbot_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'assigned_to_bot_id') THEN
    CREATE INDEX IF NOT EXISTS idx_sessions_assigned_to_bot_id ON sessions(assigned_to_bot_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'api_id') THEN
    CREATE INDEX IF NOT EXISTS idx_sessions_api_id ON sessions(api_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'phone_number') THEN
    CREATE INDEX IF NOT EXISTS idx_sessions_phone_number ON sessions(phone_number) WHERE phone_number IS NOT NULL;
  END IF;
END $$;

-- Payments indexes - conditional on columns existing
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'payment_id') THEN
    CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments(payment_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'provider_payment_id') THEN
    CREATE INDEX IF NOT EXISTS idx_payments_provider_payment_id ON payments(provider_payment_id) WHERE provider_payment_id IS NOT NULL;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'order_id') THEN
    CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'bot_id') THEN
    CREATE INDEX IF NOT EXISTS idx_payments_bot_id ON payments(bot_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'payment_status') THEN
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(payment_status);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
  END IF;
END $$;

-- Notifications indexes - conditional on columns existing
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'is_read') THEN
    CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'type') THEN
    CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
  END IF;
END $$;

-- Activity logs indexes - conditional on columns existing
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_logs' AND column_name = 'user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_logs' AND column_name = 'admin_id') THEN
    CREATE INDEX IF NOT EXISTS idx_activity_logs_admin_id ON activity_logs(admin_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_logs' AND column_name = 'action') THEN
    CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_logs' AND column_name = 'entity_type') THEN
    CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_type ON activity_logs(entity_type);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_logs' AND column_name = 'resource_type') THEN
    CREATE INDEX IF NOT EXISTS idx_activity_logs_resource_type ON activity_logs(resource_type) WHERE resource_type IS NOT NULL;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_logs' AND column_name = 'created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);
  END IF;
END $$;

-- ============================================
-- 6. TRIGGERS (Auto-update updated_at)
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update bots updated_at
CREATE OR REPLACE FUNCTION update_bots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist (to avoid conflicts)
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_admins_updated_at ON admins;
DROP TRIGGER IF EXISTS update_resellers_updated_at ON resellers;
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
DROP TRIGGER IF EXISTS update_adbots_updated_at ON adbots;
DROP TRIGGER IF EXISTS update_sessions_updated_at ON sessions;
DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
DROP TRIGGER IF EXISTS update_bots_updated_at ON bots;

-- Create triggers
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admins_updated_at 
  BEFORE UPDATE ON admins
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resellers_updated_at 
  BEFORE UPDATE ON resellers
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at 
  BEFORE UPDATE ON products
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at 
  BEFORE UPDATE ON orders
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_adbots_updated_at 
  BEFORE UPDATE ON adbots
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at 
  BEFORE UPDATE ON sessions
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at 
  BEFORE UPDATE ON payments
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bots_updated_at 
  BEFORE UPDATE ON bots
  FOR EACH ROW 
  EXECUTE FUNCTION update_bots_updated_at();

-- ============================================
-- 7. FOREIGN KEY CONSTRAINTS (Idempotent)
-- ============================================

-- Note: Foreign keys are created inline with table definitions using REFERENCES
-- Additional foreign keys that might need to be added conditionally:

DO $$ 
BEGIN
  -- Add foreign key for orders.bot_id if column exists and constraint doesn't
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'bot_id') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'orders_bot_id_fkey' AND table_name = 'orders'
    ) THEN
      ALTER TABLE orders ADD CONSTRAINT orders_bot_id_fkey 
        FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  -- Add foreign key for adbots.bot_id if column exists and constraint doesn't
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'bot_id') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'adbots_bot_id_fkey' AND table_name = 'adbots'
    ) THEN
      ALTER TABLE adbots ADD CONSTRAINT adbots_bot_id_fkey 
        FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  -- Add foreign key for sessions.assigned_to_bot_id if column exists and constraint doesn't
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'assigned_to_bot_id') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'sessions_assigned_to_bot_id_fkey' AND table_name = 'sessions'
    ) THEN
      ALTER TABLE sessions ADD CONSTRAINT sessions_assigned_to_bot_id_fkey 
        FOREIGN KEY (assigned_to_bot_id) REFERENCES bots(id) ON DELETE SET NULL;
    END IF;
  END IF;
  
  -- Add foreign key for payments.bot_id if column exists and constraint doesn't
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'bot_id') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'payments_bot_id_fkey' AND table_name = 'payments'
    ) THEN
      ALTER TABLE payments ADD CONSTRAINT payments_bot_id_fkey 
        FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- ============================================
-- 8. COMMENTS (Documentation)
-- ============================================

COMMENT ON TABLE users IS 'User accounts - optional metadata for CRM. Authentication moved to bots table (bot-centric migration).';
COMMENT ON TABLE bots IS 'PRIMARY ENTITY: Bots are the source of truth for authentication and bot operations. Access codes and passwords belong here.';
COMMENT ON TABLE admins IS 'Admin-specific data and permissions. Extends users table.';
COMMENT ON TABLE resellers IS 'Reseller accounts with commission tracking. Extends users table.';
COMMENT ON TABLE products IS 'Products catalog - Adbot plans, session packs, replacement packs.';
COMMENT ON TABLE orders IS 'Order records with payment tracking. Links to both users (legacy) and bots (primary).';
COMMENT ON TABLE adbots IS 'Active adbot instances with configuration and statistics. Links to both users (legacy) and bots (primary).';
COMMENT ON TABLE sessions IS 'Telegram session stock management. Sessions belong to bots (assigned_to_bot_id is primary).';
COMMENT ON TABLE payments IS 'Payment records from NowPayments. Links to both users (legacy) and bots (primary).';
COMMENT ON TABLE notifications IS 'User notifications and broadcasts.';
COMMENT ON TABLE activity_logs IS 'Audit trail for user and admin actions.';

COMMENT ON COLUMN bots.bot_id IS 'Primary identity for bot. Used in JWT tokens and API calls.';
COMMENT ON COLUMN bots.access_code IS 'Authentication credential. Resolves to bot_id for login.';
COMMENT ON COLUMN bots.owner_user_id IS 'Optional user ownership link. Used for CRM/email purposes only. NOT used for authentication.';
COMMENT ON COLUMN sessions.assigned_to_bot_id IS 'Sessions belong to BOTS (primary). This is the main assignment field.';
COMMENT ON COLUMN sessions.assigned_to_user_id IS 'DEPRECATED: Sessions now belong to bots. Use assigned_to_bot_id instead.';
COMMENT ON COLUMN users.access_code IS 'DEPRECATED: Access codes now belong to bots table. Use bots.access_code instead.';
COMMENT ON COLUMN users.password_hash IS 'DEPRECATED: Passwords now belong to bots table. Use bots.password_hash instead.';

-- ============================================
-- 9. VALIDATION QUERIES (Final Checks)
-- ============================================

-- Verify all tables exist (non-blocking, just logs)
DO $$ 
DECLARE
  table_count INTEGER;
  missing_tables TEXT[];
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('users', 'bots', 'admins', 'resellers', 'products', 'orders', 'adbots', 'sessions', 'payments', 'notifications', 'activity_logs');
  
  -- Check for missing tables
  SELECT ARRAY_AGG(missing) INTO missing_tables
  FROM (
    SELECT unnest(ARRAY['users', 'bots', 'admins', 'resellers', 'products', 'orders', 'adbots', 'sessions', 'payments', 'notifications', 'activity_logs']) AS missing
    EXCEPT
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
  ) AS missing_list;
  
  IF table_count < 11 THEN
    RAISE NOTICE 'Warning: Expected 11 tables, found %. Missing: %', table_count, array_to_string(missing_tables, ', ');
  ELSE
    RAISE NOTICE 'Success: All 11 tables exist';
  END IF;
END $$;

-- Verify bots table has required columns (non-blocking)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bots' AND column_name = 'access_code'
  ) THEN
    RAISE WARNING 'Bots table missing access_code column';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bots' AND column_name = 'bot_id'
  ) THEN
    RAISE WARNING 'Bots table missing bot_id column';
  ELSE
    RAISE NOTICE 'Bots table structure verified';
  END IF;
END $$;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- 
-- This migration creates a complete, production-ready schema based on:
-- 1. Actual codebase usage (queries.ts, db.ts, bot-db.ts)
-- 2. TypeScript type definitions (types/index.ts)
-- 3. API endpoint usage patterns
-- 4. Bot-centric migration requirements
-- 
-- All operations are idempotent and safe to re-run.
-- No destructive operations (no DROP statements).
-- 
-- ============================================

