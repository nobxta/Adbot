-- ============================================
-- QUEUE SYSTEM INDEX OPTIMIZATION
-- Adds optimized partial index for QUEUED status
-- This must be in a separate migration after QUEUED enum is committed
-- ============================================

-- Add optimized partial index for QUEUED status queries
-- This index only includes rows where status = 'QUEUED', making queries faster
CREATE INDEX IF NOT EXISTS idx_adbots_queued_status ON adbots(status) WHERE status = 'QUEUED';

