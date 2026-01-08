-- ============================================
-- ADD execution_mode COLUMN TO adbots TABLE
-- CRITICAL: Required for plan type routing
-- ============================================

-- Add execution_mode column to adbots table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'adbots' AND column_name = 'execution_mode'
  ) THEN
    ALTER TABLE adbots ADD COLUMN execution_mode TEXT 
      CHECK (execution_mode IN ('starter', 'enterprise'));
    
    -- Add comment
    COMMENT ON COLUMN adbots.execution_mode IS 
      'Execution mode: starter or enterprise. Set from product.plan_type during adbot creation. CRITICAL: Required for correct forwarding logic.';
    
    -- Add index for queries
    CREATE INDEX IF NOT EXISTS idx_adbots_execution_mode ON adbots(execution_mode);
  END IF;
END $$;

