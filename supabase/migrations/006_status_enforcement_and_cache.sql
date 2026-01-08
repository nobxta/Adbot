-- ============================================
-- STATUS ENFORCEMENT AND ADMIN CACHE MIGRATION
-- Adds missing status fields, enums, and admin cache support
-- ============================================

-- 1. Add FROZEN and DELETED to adbot_status enum
DO $$ 
BEGIN
  -- Add FROZEN if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'FROZEN' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'adbot_status')
  ) THEN
    ALTER TYPE adbot_status ADD VALUE 'FROZEN';
  END IF;
  
  -- Add DELETED if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'DELETED' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'adbot_status')
  ) THEN
    ALTER TYPE adbot_status ADD VALUE 'DELETED';
  END IF;
END $$;

-- 2. Add status tracking columns to adbots table
DO $$ 
BEGIN
  -- Frozen state tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'frozen_state') THEN
    ALTER TABLE adbots ADD COLUMN frozen_state BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'frozen_at') THEN
    ALTER TABLE adbots ADD COLUMN frozen_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'frozen_reason') THEN
    ALTER TABLE adbots ADD COLUMN frozen_reason TEXT;
  END IF;
  
  -- Suspended state tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'suspended_at') THEN
    ALTER TABLE adbots ADD COLUMN suspended_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'suspend_reason') THEN
    ALTER TABLE adbots ADD COLUMN suspend_reason TEXT;
  END IF;
  
  -- Deleted state tracking (soft delete)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'deleted_state') THEN
    ALTER TABLE adbots ADD COLUMN deleted_state BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'deleted_at') THEN
    ALTER TABLE adbots ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'deletion_scheduled_at') THEN
    ALTER TABLE adbots ADD COLUMN deletion_scheduled_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'deleted_by_admin_id') THEN
    ALTER TABLE adbots ADD COLUMN deleted_by_admin_id UUID REFERENCES admins(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'delete_reason') THEN
    ALTER TABLE adbots ADD COLUMN delete_reason TEXT;
  END IF;
END $$;

-- 3. Add indexes for status queries
CREATE INDEX IF NOT EXISTS idx_adbots_frozen_state ON adbots(frozen_state) WHERE frozen_state = true;
CREATE INDEX IF NOT EXISTS idx_adbots_deleted_state ON adbots(deleted_state) WHERE deleted_state = true;
CREATE INDEX IF NOT EXISTS idx_adbots_status ON adbots(status);
CREATE INDEX IF NOT EXISTS idx_adbots_deletion_scheduled_at ON adbots(deletion_scheduled_at) WHERE deleted_state = true;

-- 4. Add frozen/suspended state to bots table (for bot-level enforcement)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'frozen_state') THEN
    ALTER TABLE bots ADD COLUMN frozen_state BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'frozen_at') THEN
    ALTER TABLE bots ADD COLUMN frozen_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'frozen_reason') THEN
    ALTER TABLE bots ADD COLUMN frozen_reason TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'suspended_at') THEN
    ALTER TABLE bots ADD COLUMN suspended_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bots' AND column_name = 'suspend_reason') THEN
    ALTER TABLE bots ADD COLUMN suspend_reason TEXT;
  END IF;
END $$;

-- 5. Create function to check if adbot can be started (enforces frozen/suspended/deleted)
CREATE OR REPLACE FUNCTION can_adbot_start(adbot_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  adbot_record RECORD;
BEGIN
  SELECT 
    status,
    frozen_state,
    deleted_state,
    valid_until,
    suspended_at
  INTO adbot_record
  FROM adbots
  WHERE id = adbot_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Cannot start if deleted
  IF adbot_record.deleted_state = true THEN
    RETURN false;
  END IF;
  
  -- Cannot start if frozen
  IF adbot_record.frozen_state = true THEN
    RETURN false;
  END IF;
  
  -- Cannot start if suspended
  IF adbot_record.suspended_at IS NOT NULL THEN
    RETURN false;
  END IF;
  
  -- Cannot start if expired
  IF adbot_record.valid_until IS NOT NULL AND adbot_record.valid_until < NOW() THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- 6. Create function to check if bot can be started (enforces frozen/suspended)
CREATE OR REPLACE FUNCTION can_bot_start(bot_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  bot_record RECORD;
BEGIN
  SELECT 
    plan_status,
    frozen_state,
    suspended_at,
    expires_at
  INTO bot_record
  FROM bots
  WHERE id = bot_uuid OR bot_id = bot_uuid;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Cannot start if frozen
  IF bot_record.frozen_state = true THEN
    RETURN false;
  END IF;
  
  -- Cannot start if suspended
  IF bot_record.suspended_at IS NOT NULL THEN
    RETURN false;
  END IF;
  
  -- Cannot start if plan is expired or inactive
  IF bot_record.plan_status NOT IN ('active', NULL) THEN
    RETURN false;
  END IF;
  
  -- Cannot start if expired
  IF bot_record.expires_at IS NOT NULL AND bot_record.expires_at < NOW() THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- 7. Add trigger to prevent starting frozen/suspended/deleted adbots
CREATE OR REPLACE FUNCTION enforce_adbot_status()
RETURNS TRIGGER AS $$
BEGIN
  -- If trying to set status to ACTIVE or RUNNING, check if it's allowed
  IF NEW.status IN ('ACTIVE', 'RUNNING') THEN
    IF NOT can_adbot_start(NEW.id) THEN
      RAISE EXCEPTION 'Cannot start adbot: frozen, suspended, deleted, or expired';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_adbot_status_trigger ON adbots;
CREATE TRIGGER enforce_adbot_status_trigger
  BEFORE UPDATE OF status ON adbots
  FOR EACH ROW
  WHEN (NEW.status IN ('ACTIVE', 'RUNNING'))
  EXECUTE FUNCTION enforce_adbot_status();

-- 8. Add comments
COMMENT ON COLUMN adbots.frozen_state IS 'True if bot is frozen (user can login but cannot perform actions)';
COMMENT ON COLUMN adbots.deleted_state IS 'True if bot is soft-deleted (10-day recovery window)';
COMMENT ON COLUMN adbots.deletion_scheduled_at IS 'Date when bot will be permanently deleted (10 days after deletion)';
COMMENT ON FUNCTION can_adbot_start IS 'Checks if adbot can be started (not frozen, suspended, deleted, or expired)';
COMMENT ON FUNCTION can_bot_start IS 'Checks if bot can be started (not frozen, suspended, or expired)';


