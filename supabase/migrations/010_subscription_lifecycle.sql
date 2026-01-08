-- ============================================
-- SUBSCRIPTION LIFECYCLE SYSTEM
-- Adds subscription management fields to adbots table
-- ============================================

-- Add subscription_status enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE subscription_status AS ENUM ('ACTIVE', 'EXPIRED', 'DELETED');
  END IF;
END $$;

-- Add subscription fields to adbots table
DO $$ 
BEGIN
  -- Activated timestamp (when subscription started)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'adbots' AND column_name = 'activated_at'
  ) THEN
    ALTER TABLE adbots ADD COLUMN activated_at TIMESTAMPTZ;
  END IF;
  
  -- Expires timestamp (activated_at + validity_days)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'adbots' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE adbots ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;
  
  -- Grace period expires timestamp (expires_at + 24 hours)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'adbots' AND column_name = 'grace_expires_at'
  ) THEN
    ALTER TABLE adbots ADD COLUMN grace_expires_at TIMESTAMPTZ;
  END IF;
  
  -- Subscription status (ACTIVE, EXPIRED, DELETED)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'adbots' AND column_name = 'subscription_status'
  ) THEN
    ALTER TABLE adbots ADD COLUMN subscription_status subscription_status DEFAULT 'ACTIVE';
  END IF;
  
  -- Validity days (from product, stored for reference)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'adbots' AND column_name = 'validity_days'
  ) THEN
    ALTER TABLE adbots ADD COLUMN validity_days INTEGER;
  END IF;
  
  -- Pre-expiry notification sent flag (to send only once)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'adbots' AND column_name = 'pre_expiry_notification_sent'
  ) THEN
    ALTER TABLE adbots ADD COLUMN pre_expiry_notification_sent BOOLEAN DEFAULT FALSE;
  END IF;
  
  -- Expiry notification sent flag (to send only once)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'adbots' AND column_name = 'expiry_notification_sent'
  ) THEN
    ALTER TABLE adbots ADD COLUMN expiry_notification_sent BOOLEAN DEFAULT FALSE;
  END IF;
  
  -- Deletion notification sent flag (to send only once)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'adbots' AND column_name = 'deletion_notification_sent'
  ) THEN
    ALTER TABLE adbots ADD COLUMN deletion_notification_sent BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Add indexes for subscription queries
CREATE INDEX IF NOT EXISTS idx_adbots_subscription_status ON adbots(subscription_status);
CREATE INDEX IF NOT EXISTS idx_adbots_expires_at ON adbots(expires_at);
CREATE INDEX IF NOT EXISTS idx_adbots_grace_expires_at ON adbots(grace_expires_at);
CREATE INDEX IF NOT EXISTS idx_adbots_expires_at_status ON adbots(expires_at, subscription_status) WHERE subscription_status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_adbots_grace_expires_at_status ON adbots(grace_expires_at, subscription_status) WHERE subscription_status = 'EXPIRED';

-- Backfill existing adbots with subscription data
-- Use valid_until as expires_at if available
DO $$
BEGIN
  UPDATE adbots
  SET 
    activated_at = COALESCE(activated_at, created_at),
    expires_at = COALESCE(expires_at, valid_until),
    grace_expires_at = COALESCE(
      grace_expires_at,
      CASE 
        WHEN valid_until IS NOT NULL THEN valid_until + INTERVAL '24 hours'
        ELSE NULL
      END
    ),
    subscription_status = CASE
      WHEN deleted_state = TRUE THEN 'DELETED'::subscription_status
      WHEN valid_until IS NOT NULL AND valid_until < NOW() THEN 'EXPIRED'::subscription_status
      ELSE 'ACTIVE'::subscription_status
    END
  WHERE activated_at IS NULL OR expires_at IS NULL OR subscription_status IS NULL;
END $$;

-- Add comments
COMMENT ON COLUMN adbots.activated_at IS 'Timestamp when subscription was activated';
COMMENT ON COLUMN adbots.expires_at IS 'Timestamp when subscription expires (activated_at + validity_days)';
COMMENT ON COLUMN adbots.grace_expires_at IS 'Timestamp when grace period ends (expires_at + 24 hours)';
COMMENT ON COLUMN adbots.subscription_status IS 'Subscription status: ACTIVE, EXPIRED, or DELETED';
COMMENT ON COLUMN adbots.validity_days IS 'Number of days subscription is valid (from product)';
COMMENT ON COLUMN adbots.pre_expiry_notification_sent IS 'Whether pre-expiry notification (48h before) was sent';
COMMENT ON COLUMN adbots.expiry_notification_sent IS 'Whether expiry notification was sent';
COMMENT ON COLUMN adbots.deletion_notification_sent IS 'Whether deletion notification was sent';

