-- ============================================
-- QUEUE SYSTEM FOR RESOURCE UNAVAILABILITY
-- Adds QUEUED status and queue tracking fields
-- ============================================

-- 1. Add QUEUED to adbot_status enum
-- NOTE: This must be in a separate transaction/statement block
-- PostgreSQL requires enum values to be committed before use
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'QUEUED' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'adbot_status')
  ) THEN
    ALTER TYPE adbot_status ADD VALUE 'QUEUED';
  END IF;
END $$;

-- 2. Add queue tracking columns to adbots table
DO $$ 
BEGIN
  -- Required sessions count (what was requested)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'adbots' AND column_name = 'required_sessions'
  ) THEN
    ALTER TABLE adbots ADD COLUMN required_sessions INTEGER;
  END IF;
  
  -- Missing sessions count (how many are still needed)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'adbots' AND column_name = 'missing_sessions_count'
  ) THEN
    ALTER TABLE adbots ADD COLUMN missing_sessions_count INTEGER;
  END IF;
  
  -- Queue timestamp
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'adbots' AND column_name = 'queued_at'
  ) THEN
    ALTER TABLE adbots ADD COLUMN queued_at TIMESTAMPTZ;
  END IF;
  
  -- Queue reason
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'adbots' AND column_name = 'queued_reason'
  ) THEN
    ALTER TABLE adbots ADD COLUMN queued_reason TEXT;
  END IF;
  
  -- Creation source (USER_PAYMENT or ADMIN_MANUAL)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'adbots' AND column_name = 'creation_source'
  ) THEN
    ALTER TABLE adbots ADD COLUMN creation_source TEXT CHECK (creation_source IN ('USER_PAYMENT', 'ADMIN_MANUAL'));
  END IF;
END $$;

-- 3. Add indexes for queue queries
-- NOTE: Cannot use WHERE status = 'QUEUED' in same transaction as enum addition
-- Create general index on status (will work for all status values including QUEUED)
CREATE INDEX IF NOT EXISTS idx_adbots_status ON adbots(status);
CREATE INDEX IF NOT EXISTS idx_adbots_queued_at ON adbots(queued_at) WHERE queued_at IS NOT NULL;

-- 4. Add comments
COMMENT ON COLUMN adbots.required_sessions IS 'Number of sessions required for this adbot';
COMMENT ON COLUMN adbots.missing_sessions_count IS 'Number of sessions still needed (0 when ready)';
COMMENT ON COLUMN adbots.queued_at IS 'Timestamp when adbot entered QUEUED state';
COMMENT ON COLUMN adbots.queued_reason IS 'Reason for queuing (e.g., "Insufficient sessions", "Insufficient API pairs")';
COMMENT ON COLUMN adbots.creation_source IS 'How adbot was created: USER_PAYMENT or ADMIN_MANUAL';

