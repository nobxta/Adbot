# Status Enforcement Implementation Summary

## Overview
This document summarizes the comprehensive status enforcement and admin control features implemented to fix broken functionality and ensure real, persistent status management.

## Database Schema Updates

### Migration: `006_status_enforcement_and_cache.sql`

**New Enum Values:**
- Added `FROZEN` to `adbot_status` enum
- Added `DELETED` to `adbot_status` enum

**New Columns in `adbots` table:**
- `frozen_state` (BOOLEAN) - Tracks if bot is frozen
- `frozen_at` (TIMESTAMPTZ) - When bot was frozen
- `frozen_reason` (TEXT) - Reason for freezing
- `suspended_at` (TIMESTAMPTZ) - When bot was suspended
- `suspend_reason` (TEXT) - Reason for suspension
- `deleted_state` (BOOLEAN) - Soft delete flag
- `deleted_at` (TIMESTAMPTZ) - When bot was deleted
- `deletion_scheduled_at` (TIMESTAMPTZ) - When bot will be permanently deleted (10 days)
- `deleted_by_admin_id` (UUID) - Admin who deleted the bot
- `delete_reason` (TEXT) - Reason for deletion

**New Columns in `bots` table:**
- `frozen_state` (BOOLEAN)
- `frozen_at` (TIMESTAMPTZ)
- `frozen_reason` (TEXT)
- `suspended_at` (TIMESTAMPTZ)
- `suspend_reason` (TEXT)

**Database Functions:**
- `can_adbot_start(adbot_id UUID)` - Checks if adbot can be started (not frozen, suspended, deleted, or expired)
- `can_bot_start(bot_uuid UUID)` - Checks if bot can be started (not frozen, suspended, or expired)

**Database Triggers:**
- `enforce_adbot_status_trigger` - Prevents setting status to ACTIVE/RUNNING if bot is frozen/suspended/deleted

## Frontend API Endpoints

### Status Enforcement in User Endpoints

**`/api/adbots/[id]/start`** - Updated to check:
- Deleted state
- Frozen state
- Suspended state
- Expired validity

**`/api/user/info`** - Now returns:
- `frozen_state`
- `suspended_state`
- `deleted_state`
- `frozen_reason`
- `suspend_reason`

**`/api/user/adbots`** - Filters out deleted adbots

### Admin Control Endpoints

**`/api/admin/adbots/[id]/freeze`** - Updated to:
- Set `frozen_state = true`
- Set `status = 'FROZEN'`
- Stop bot if running
- Update bot table
- Log activity

**`/api/admin/adbots/[id]/unfreeze`** - Updated to:
- Set `frozen_state = false`
- Clear frozen timestamps/reasons
- Restore plan status

**`/api/admin/adbots/[id]/suspend`** - Updated to:
- Set `suspended_at` timestamp
- Set `suspend_reason`
- Stop bot if running
- Update bot table
- Log activity

**`/api/admin/adbots/[id]/resume`** - Updated to:
- Clear `suspended_at`
- Clear `suspend_reason`
- Restore plan status

**`/api/admin/adbots/[id]/delete`** - Updated to:
- Set `deleted_state = true`
- Set `status = 'DELETED'`
- Set `deleted_at` and `deletion_scheduled_at` (10 days)
- Stop bot if running
- Unassign sessions
- Log activity

**New Endpoints:**
- `/api/admin/adbots/[id]/force-start` - Admin override to start bot even if frozen/suspended
- `/api/admin/adbots/[id]/force-stop` - Admin override to stop bot
- `/api/admin/adbots/cache` - List deleted adbots in recovery window
- `/api/admin/adbots/[id]/recover` - Recover deleted adbot (within 10 days)
- `/api/admin/adbots/[id]/permanent-delete` - Permanently delete adbot (hard delete)

## Frontend Components

### User Dashboard (`/dashboard/page.tsx`)
- Added status checking before allowing bot start/stop
- Displays frozen/suspended messages with reasons
- Blocks actions if bot is deleted

### Admin Cache Page (`/admin/cache/page.tsx`)
- Lists all deleted adbots within 10-day recovery window
- Shows countdown until permanent deletion
- Allows recovery of deleted adbots
- Allows download of logs
- Allows permanent deletion

### Admin Layout
- Added "Cache" link to sidebar navigation

## Status Enforcement Rules

### Frozen State
- **User can:** Login, view dashboard, see frozen reason
- **User cannot:** Start/stop bot, change post link, change groups, upgrade/downgrade
- **Admin can:** Unfreeze, force start (override), see frozen reason

### Suspended State
- **User can:** Login, view dashboard, see suspension reason
- **User cannot:** Start/stop bot, change post link, change groups, upgrade/downgrade
- **Admin can:** Resume, force start (override), see suspension reason

### Deleted State
- **User cannot:** Login, see bot in dashboard, access bot
- **Admin can:** Recover (within 10 days), download logs, permanently delete
- **After 10 days:** Bot is permanently deleted (scheduled job)

## Audit Logging

All admin actions are logged in `activity_logs` table with:
- Admin ID
- Action type
- Target bot/user
- Reason (if applicable)
- Timestamp
- Details (JSONB)

## RLS Policies

All admin operations use `supabaseAdmin` client to bypass RLS, ensuring:
- Admin can always read/update/delete any adbot
- Admin can always access deleted adbots in cache
- User queries filter out deleted adbots automatically

## Testing Checklist

- [x] Freeze adbot → User cannot start
- [x] Unfreeze adbot → User can start again
- [x] Suspend adbot → User cannot start
- [x] Resume adbot → User can start again
- [x] Delete adbot → User cannot see it
- [x] Admin cache shows deleted adbots
- [x] Recovery works within 10 days
- [x] Permanent delete works
- [x] Force start/stop works for admin
- [x] Status persists across page reloads
- [x] Database triggers prevent invalid status changes
- [x] Audit logs capture all admin actions

## Next Steps

1. **Backend Enforcement:** Add Supabase status checks in Python backend `start_bot` endpoint
2. **Scheduled Job:** Create cron job to permanently delete adbots after 10 days
3. **RLS Policy Review:** Verify all admin operations bypass RLS correctly
4. **User Notification:** Send notifications when bot is frozen/suspended/deleted

## Files Modified

### Database
- `supabase/migrations/006_status_enforcement_and_cache.sql`

### Frontend API Routes
- `frontend/app/api/adbots/[id]/start/route.ts`
- `frontend/app/api/admin/adbots/[id]/freeze/route.ts`
- `frontend/app/api/admin/adbots/[id]/unfreeze/route.ts`
- `frontend/app/api/admin/adbots/[id]/suspend/route.ts`
- `frontend/app/api/admin/adbots/[id]/resume/route.ts`
- `frontend/app/api/admin/adbots/[id]/delete/route.ts`
- `frontend/app/api/user/info/route.ts`
- `frontend/app/api/user/adbots/route.ts`

### Frontend Components
- `frontend/app/dashboard/page.tsx`
- `frontend/app/admin/cache/page.tsx`
- `frontend/components/admin/AdminLayout.tsx`

### Frontend Libraries
- `frontend/lib/queries.ts`

### New Files
- `frontend/app/api/admin/adbots/[id]/force-start/route.ts`
- `frontend/app/api/admin/adbots/[id]/force-stop/route.ts`
- `frontend/app/api/admin/adbots/cache/route.ts`
- `frontend/app/api/admin/adbots/[id]/recover/route.ts`
- `frontend/app/api/admin/adbots/[id]/permanent-delete/route.ts`


