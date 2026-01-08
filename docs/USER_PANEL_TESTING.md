# User Panel Status Enforcement - Testing Guide

## ✅ Implemented Features

### 1. Status Display in User Dashboard
- **Deleted State**: Shows red alert banner with "Adbot Deleted" message
- **Frozen State**: Shows blue alert banner with "Adbot Frozen" message and reason
- **Suspended State**: Shows orange alert banner with "Adbot Suspended" message and reason
- **Account Banned**: Shows red alert banner (existing feature)

### 2. Status Enforcement in UI
- Start/Stop button is **disabled** when:
  - `deleted_state = true`
  - `frozen_state = true`
  - `suspended_state = true`
  - `accountBanned = true`

### 3. Status Enforcement in API
- `/api/adbots/[id]/start` checks:
  - ✅ Deleted state (`deleted_state`)
  - ✅ Frozen state (`frozen_state`)
  - ✅ Suspended state (`suspended_at`)
  - ✅ Expired validity (`valid_until`)
- Uses `supabaseAdmin` to ensure all fields are accessible

### 4. Status Fetching
- `/api/user/info` returns:
  - `frozen_state` (boolean)
  - `suspended_state` (boolean)
  - `deleted_state` (boolean)
  - `frozen_reason` (string | null)
  - `suspend_reason` (string | null)
  - `adbot_id` (string | null) - for start/stop operations

## 🧪 Testing Checklist

### Test 1: Frozen Adbot
1. **Admin Action**: Freeze an adbot via `/api/admin/adbots/[id]/freeze`
2. **User View**: 
   - Login as user
   - Check dashboard shows blue "Adbot Frozen" banner
   - Check reason is displayed
   - Verify Start/Stop button is disabled
3. **User Action**: Try to start adbot
   - Should show alert: "This bot is frozen and cannot be controlled..."
   - API should return 403 with error message

### Test 2: Suspended Adbot
1. **Admin Action**: Suspend an adbot via `/api/admin/adbots/[id]/suspend`
2. **User View**:
   - Login as user
   - Check dashboard shows orange "Adbot Suspended" banner
   - Check reason is displayed
   - Verify Start/Stop button is disabled
3. **User Action**: Try to start adbot
   - Should show alert: "This bot is suspended and cannot be controlled..."
   - API should return 403 with error message

### Test 3: Deleted Adbot
1. **Admin Action**: Delete an adbot via `/api/admin/adbots/[id]/delete`
2. **User View**:
   - Login as user
   - Check dashboard shows red "Adbot Deleted" banner
   - Verify Start/Stop button is disabled
   - Adbot should NOT appear in user's adbot list
3. **User Action**: Try to start adbot
   - Should show alert: "This bot has been deleted..."
   - API should return 403 with error message

### Test 4: Unfreeze Adbot
1. **Admin Action**: Unfreeze an adbot via `/api/admin/adbots/[id]/unfreeze`
2. **User View**:
   - Refresh dashboard
   - Frozen banner should disappear
   - Start/Stop button should be enabled
3. **User Action**: Should be able to start adbot normally

### Test 5: Resume Adbot
1. **Admin Action**: Resume an adbot via `/api/admin/adbots/[id]/resume`
2. **User View**:
   - Refresh dashboard
   - Suspended banner should disappear
   - Start/Stop button should be enabled
3. **User Action**: Should be able to start adbot normally

### Test 6: Status Persistence
1. **Admin Action**: Freeze an adbot
2. **User Action**: Refresh dashboard multiple times
3. **Expected**: Status should persist, banner should always show

### Test 7: Multiple Status States
1. **Admin Action**: Freeze an adbot, then suspend it
2. **User View**: Should show suspended banner (suspended takes precedence)
3. **Admin Action**: Unfreeze, then resume
4. **User View**: Banners should disappear, button enabled

## 🔍 Verification Points

### Database Verification
```sql
-- Check adbot status
SELECT 
  id,
  status,
  frozen_state,
  frozen_at,
  frozen_reason,
  suspended_at,
  suspend_reason,
  deleted_state,
  deleted_at
FROM adbots
WHERE user_id = '<user_id>';
```

### API Verification
```bash
# Check user info endpoint
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/user/info

# Expected response includes:
# {
#   "frozen_state": true/false,
#   "suspended_state": true/false,
#   "deleted_state": true/false,
#   "frozen_reason": "..." or null,
#   "suspend_reason": "..." or null,
#   "adbot_id": "..."
# }
```

### Frontend Verification
1. Open browser DevTools → Network tab
2. Check `/api/user/info` response
3. Verify status fields are present
4. Check dashboard UI reflects status
5. Verify button disabled state matches status

## 🐛 Common Issues

### Issue: Status not showing
- **Check**: Is migration `006_status_enforcement_and_cache.sql` applied?
- **Check**: Are columns `frozen_state`, `suspended_at`, `deleted_state` in database?
- **Check**: Is `/api/user/info` returning status fields?

### Issue: Button not disabled
- **Check**: Is `botStatus` state being set correctly?
- **Check**: Are status checks in `toggleBot` function working?
- **Check**: Is button `disabled` prop correctly set?

### Issue: API returns 403 but UI doesn't show error
- **Check**: Is error handling in `toggleBot` function working?
- **Check**: Are alerts being shown to user?

## 📝 Notes

- Status is fetched on dashboard mount via `/api/user/info`
- Status is checked before allowing start/stop operations
- Status is enforced at both UI and API levels
- Admin actions immediately affect user view (after refresh)
- Deleted adbots are excluded from user queries automatically

