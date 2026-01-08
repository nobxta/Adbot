-- ============================================
-- BOT-CENTRIC MIGRATION
-- Migrates system from USER-CENTRIC to BOT-CENTRIC identity
-- ============================================
-- 
-- CORE PRINCIPLE: BOT is PRIMARY, USER is OPTIONAL metadata
-- Access codes and passwords belong to BOTS, not USERS
--
-- This migration:
-- 1. Creates new bots table (primary entity)
-- 2. Migrates data from users to bots
-- 3. Updates users table to be minimal (optional metadata)
-- 4. Updates foreign key relationships
-- 5. Updates sessions to reference bots
-- ============================================

-- Step 1: Create new bots table structure
-- This becomes the PRIMARY entity for authentication and bot operations
CREATE TABLE IF NOT EXISTS bots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bot_id UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(), -- Primary identity (same as id for now, but can be separate)
  access_code TEXT UNIQUE NOT NULL, -- Authentication credential
  password_hash TEXT, -- Optional password (nullable)
  plan_type TEXT CHECK (plan_type IN ('starter', 'enterprise')), -- Bot plan type
  plan_status TEXT CHECK (plan_status IN ('active', 'expired', 'suspended')) DEFAULT 'active', -- Bot status
  cycle_delay INTEGER, -- Posting interval in seconds
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Optional user ownership (nullable)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- Optional expiration
  last_login TIMESTAMPTZ -- Track last login
);

-- Create indexes for bots table
CREATE INDEX IF NOT EXISTS idx_bots_access_code ON bots(access_code);
CREATE INDEX IF NOT EXISTS idx_bots_bot_id ON bots(bot_id);
CREATE INDEX IF NOT EXISTS idx_bots_owner_user_id ON bots(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_bots_plan_status ON bots(plan_status);

-- Step 2: Migrate existing user data to bots
-- For each user with access_code, create a corresponding bot
INSERT INTO bots (bot_id, access_code, password_hash, plan_type, plan_status, owner_user_id, created_at, last_login)
SELECT 
  id, -- Use user id as bot_id initially
  access_code,
  password_hash,
  plan_type,
  CASE 
    WHEN plan_status = 'active' THEN 'active'
    WHEN plan_status = 'expired' THEN 'expired'
    WHEN plan_status = 'inactive' THEN 'suspended'
    ELSE 'active'
  END,
  id, -- Link bot to user (owner_user_id)
  created_at,
  last_login
FROM users
WHERE access_code IS NOT NULL
ON CONFLICT (access_code) DO NOTHING;

-- Step 3: Update sessions table to reference bots instead of users
-- Add new column for bot assignment
ALTER TABLE sessions 
  ADD COLUMN IF NOT EXISTS assigned_to_bot_id UUID REFERENCES bots(id) ON DELETE SET NULL;

-- Migrate existing session assignments from user_id to bot_id
UPDATE sessions s
SET assigned_to_bot_id = b.id
FROM bots b
WHERE s.assigned_to_user_id = b.owner_user_id
  AND s.assigned_to_bot_id IS NULL;

-- Step 4: Update adbots table to reference bots
-- Add bot_id column to adbots
ALTER TABLE adbots
  ADD COLUMN IF NOT EXISTS bot_id UUID REFERENCES bots(id) ON DELETE CASCADE;

-- Migrate adbots from user_id to bot_id
UPDATE adbots a
SET bot_id = b.id
FROM bots b
WHERE a.user_id = b.owner_user_id
  AND a.bot_id IS NULL;

-- Step 5: Update orders table to reference bots
-- Add bot_id column to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS bot_id UUID REFERENCES bots(id) ON DELETE CASCADE;

-- Migrate orders from user_id to bot_id
UPDATE orders o
SET bot_id = b.id
FROM bots b
WHERE o.user_id = b.owner_user_id
  AND o.bot_id IS NULL;

-- Step 6: Update payments table to reference bots
-- Add bot_id column to payments
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS bot_id UUID REFERENCES bots(id) ON DELETE CASCADE;

-- Migrate payments from user_id to bot_id
UPDATE payments p
SET bot_id = b.id
FROM bots b
WHERE p.user_id = b.owner_user_id
  AND p.bot_id IS NULL;

-- Step 7: Create indexes for new foreign keys
CREATE INDEX IF NOT EXISTS idx_sessions_assigned_to_bot_id ON sessions(assigned_to_bot_id);
CREATE INDEX IF NOT EXISTS idx_adbots_bot_id ON adbots(bot_id);
CREATE INDEX IF NOT EXISTS idx_orders_bot_id ON orders(bot_id);
CREATE INDEX IF NOT EXISTS idx_payments_bot_id ON payments(bot_id);

-- Step 8: Update users table to be minimal (optional metadata only)
-- Remove authentication fields (these now belong to bots)
-- Keep only: id, email, created_at
-- Note: We'll keep the columns for backward compatibility but mark them as deprecated
-- In a future migration, we can drop them after all code is updated

-- Add comment to mark deprecated columns
COMMENT ON COLUMN users.access_code IS 'DEPRECATED: Access codes now belong to bots table. Use bots.access_code instead.';
COMMENT ON COLUMN users.password_hash IS 'DEPRECATED: Passwords now belong to bots table. Use bots.password_hash instead.';
COMMENT ON COLUMN users.plan_type IS 'DEPRECATED: Plan info now belongs to bots table. Use bots.plan_type instead.';
COMMENT ON COLUMN users.plan_status IS 'DEPRECATED: Plan status now belongs to bots table. Use bots.plan_status instead.';

-- Step 9: Create function to update updated_at timestamp for bots
CREATE OR REPLACE FUNCTION update_bots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bots_updated_at
  BEFORE UPDATE ON bots
  FOR EACH ROW
  EXECUTE FUNCTION update_bots_updated_at();

-- Step 10: Add comments to document the new structure
COMMENT ON TABLE bots IS 'PRIMARY ENTITY: Bots are the source of truth for authentication and bot operations. Users are optional metadata for ownership/CRM.';
COMMENT ON COLUMN bots.bot_id IS 'Primary identity for bot. Used in JWT tokens and API calls.';
COMMENT ON COLUMN bots.access_code IS 'Authentication credential. Resolves to bot_id for login.';
COMMENT ON COLUMN bots.password_hash IS 'Optional password (bcrypt hashed). Never required for authentication.';
COMMENT ON COLUMN bots.owner_user_id IS 'Optional user ownership link. Used for CRM/email purposes only. NOT used for authentication.';
COMMENT ON COLUMN sessions.assigned_to_bot_id IS 'Sessions belong to BOTS, not users. This is the primary assignment field.';
COMMENT ON COLUMN sessions.assigned_to_user_id IS 'DEPRECATED: Sessions now belong to bots. Use assigned_to_bot_id instead.';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- After this migration:
-- 1. Bots table is the PRIMARY entity
-- 2. Users table is minimal (id, email, created_at)
-- 3. All foreign keys point to bots
-- 4. Authentication uses bots.access_code → bots.bot_id
-- 5. Sessions belong to bots (assigned_to_bot_id)
-- ============================================

