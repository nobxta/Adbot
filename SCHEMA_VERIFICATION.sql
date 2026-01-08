-- ============================================
-- SCHEMA VERIFICATION QUERIES
-- Run these in Supabase SQL Editor to verify all columns exist
-- ============================================

-- 1. Check if all required columns exist in adbots table
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'adbots'
  AND column_name IN (
    'frozen_state',
    'frozen_at',
    'frozen_reason',
    'suspended_at',
    'suspend_reason',
    'deleted_state',
    'deleted_at',
    'deletion_scheduled_at',
    'deleted_by_admin_id',
    'delete_reason'
  )
ORDER BY column_name;

-- 2. Check if all required columns exist in bots table
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'bots'
  AND column_name IN (
    'frozen_state',
    'frozen_at',
    'frozen_reason',
    'suspended_at',
    'suspend_reason'
  )
ORDER BY column_name;

-- 3. Check if FROZEN and DELETED enum values exist
SELECT 
  enumlabel
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'adbot_status')
  AND enumlabel IN ('FROZEN', 'DELETED');

-- 4. Check if database functions exist
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('can_adbot_start', 'can_bot_start');

-- 5. Check if trigger exists
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name = 'enforce_adbot_status_trigger';

-- Expected Results:
-- 1. Should return 10 rows (all adbots columns)
-- 2. Should return 5 rows (all bots columns)
-- 3. Should return 2 rows (FROZEN and DELETED)
-- 4. Should return 2 rows (both functions)
-- 5. Should return 1 row (trigger exists)


