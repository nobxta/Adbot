-- ============================================
-- CRON MONITORING SYSTEM
-- Tracks cron job execution for reliability monitoring
-- ============================================

-- Create cron_runs table
CREATE TABLE IF NOT EXISTS cron_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Cron job identifier
  job_name TEXT NOT NULL,
  
  -- Execution details
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'PARTIAL', 'FAILED')),
  
  -- Results
  affected_bot_count INTEGER DEFAULT 0,
  error TEXT,
  
  -- Metadata
  execution_time_ms INTEGER, -- Calculated: end_time - start_time
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_cron_runs_job_name ON cron_runs(job_name);
CREATE INDEX IF NOT EXISTS idx_cron_runs_start_time ON cron_runs(start_time);
CREATE INDEX IF NOT EXISTS idx_cron_runs_status ON cron_runs(status);
CREATE INDEX IF NOT EXISTS idx_cron_runs_job_name_start_time ON cron_runs(job_name, start_time DESC);

-- Add comments
COMMENT ON TABLE cron_runs IS 'Tracks cron job execution for reliability monitoring';
COMMENT ON COLUMN cron_runs.job_name IS 'Identifier for the cron job (e.g., subscription-expire, subscription-expire-check, pre-expiry-notify)';
COMMENT ON COLUMN cron_runs.status IS 'Execution status: SUCCESS (all operations succeeded), PARTIAL (some operations failed), FAILED (all operations failed)';
COMMENT ON COLUMN cron_runs.affected_bot_count IS 'Number of adbots affected by this cron run';
COMMENT ON COLUMN cron_runs.execution_time_ms IS 'Execution time in milliseconds';

