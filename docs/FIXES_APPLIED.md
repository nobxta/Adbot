# Runtime Errors Fixed

## 1. Trash2 Import Error
**Status:** ✅ Already Fixed
- `Trash2` is properly imported in `frontend/components/admin/AdminLayout.tsx` (line 18)
- If error persists, it may be a build cache issue - try clearing `.next` folder

## 2. Schema Mismatches Fixed

### Fixed API Routes:
- ✅ `/api/admin/adbots/[id]/delete` - Removed duplicate variable declaration
- ✅ `/api/admin/adbots/[id]/suspend` - Removed redundant bot update code
- ✅ `/api/admin/adbots/[id]/route.ts` - Changed to use `supabaseAdmin` for all queries

### Required Columns (Migration 006):
All columns are defined in `supabase/migrations/006_status_enforcement_and_cache.sql`:

**adbots table:**
- `frozen_state` (BOOLEAN)
- `frozen_at` (TIMESTAMPTZ)
- `frozen_reason` (TEXT)
- `suspended_at` (TIMESTAMPTZ)
- `suspend_reason` (TEXT)
- `deleted_state` (BOOLEAN)
- `deleted_at` (TIMESTAMPTZ)
- `deletion_scheduled_at` (TIMESTAMPTZ)
- `deleted_by_admin_id` (UUID)
- `delete_reason` (TEXT)

**bots table:**
- `frozen_state` (BOOLEAN)
- `frozen_at` (TIMESTAMPTZ)
- `frozen_reason` (TEXT)
- `suspended_at` (TIMESTAMPTZ)
- `suspend_reason` (TEXT)

## 3. Status Enforcement

### Freeze Endpoint (`/api/admin/adbots/[id]/freeze`)
- Sets `status = 'FROZEN'`
- Sets `frozen_state = true`
- Sets `frozen_at` timestamp
- Sets `frozen_reason`
- Stops bot if running
- Updates bot table

### Unfreeze Endpoint (`/api/admin/adbots/[id]/unfreeze`)
- Sets `status = 'STOPPED'`
- Clears `frozen_state = false`
- Clears `frozen_at = null`
- Clears `frozen_reason = null`
- Updates bot table

### Suspend Endpoint (`/api/admin/adbots/[id]/suspend`)
- Sets `status = 'SUSPENDED'`
- Sets `suspended_at` timestamp
- Sets `suspend_reason`
- Stops bot if running
- Updates bot table

### Resume Endpoint (`/api/admin/adbots/[id]/resume`)
- Sets `status = 'STOPPED'`
- Clears `suspended_at = null`
- Clears `suspend_reason = null`
- Updates bot table

### Delete Endpoint (`/api/admin/adbots/[id]/delete`)
- Sets `status = 'DELETED'`
- Sets `deleted_state = true`
- Sets `deleted_at` timestamp
- Sets `deletion_scheduled_at` (10 days from now)
- Sets `deleted_by_admin_id`
- Sets `delete_reason`
- Unassigns all sessions
- Stops bot if running

## 4. RLS Bypass

All admin operations now use `supabaseAdmin` client:
- ✅ `/api/admin/adbots/[id]/route.ts` - GET and PUT use `supabaseAdmin`
- ✅ All freeze/unfreeze/suspend/resume/delete routes use `supabaseAdmin`
- ✅ Admin cache routes use `supabaseAdmin`

## 5. Migration Required

**Action Required:** Run the migration in Supabase SQL Editor:
```sql
-- File: supabase/migrations/006_status_enforcement_and_cache.sql
```

This migration:
1. Adds FROZEN and DELETED to adbot_status enum
2. Adds all required columns to adbots and bots tables
3. Creates database functions for status checking
4. Creates trigger to enforce status rules

## 6. Status Logic

### Active Bot
- `status = 'ACTIVE'` or `'RUNNING'`
- `frozen_state = false`
- `suspended_at = null`
- `deleted_state = false`
- User can start/stop

### Frozen Bot
- `status = 'FROZEN'`
- `frozen_state = true`
- `frozen_at` is set
- `frozen_reason` is set
- User CANNOT start/stop
- User can see reason

### Suspended Bot
- `status = 'SUSPENDED'`
- `suspended_at` is set
- `suspend_reason` is set
- User CANNOT start/stop
- User can see reason

### Deleted Bot
- `status = 'DELETED'`
- `deleted_state = true`
- `deleted_at` is set
- `deletion_scheduled_at` is set (10 days)
- User CANNOT see bot
- Admin can recover within 10 days

## Testing Checklist

After running migration:
- [ ] Freeze adbot → Check `frozen_state = true`, `frozen_at` set
- [ ] Unfreeze adbot → Check `frozen_state = false`, `frozen_at = null`
- [ ] Suspend adbot → Check `suspended_at` set, `suspend_reason` set
- [ ] Resume adbot → Check `suspended_at = null`, `suspend_reason = null`
- [ ] Delete adbot → Check `deleted_state = true`, `deleted_at` set
- [ ] User queries exclude deleted adbots
- [ ] Admin can see deleted adbots in cache
- [ ] Recovery works within 10 days


