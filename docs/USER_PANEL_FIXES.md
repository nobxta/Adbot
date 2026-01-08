# User Panel Fixes - Plan Validity, Post Link, and Stats

## ✅ Fixed Issues

### 1. Plan Validity Calculation
**Problem**: Always showing 30 days regardless of actual validity (7 days, 8 days, etc.)

**Fix**:
- Removed hardcoded 30-day default in dashboard
- Fixed calculation to use `Math.floor()` instead of `Math.ceil()` for accurate day count
- Now calculates from `valid_until` date in database
- Shows 0 days if expired or no validity set

**Files Changed**:
- `frontend/app/api/user/stats/route.ts` - Fixed calculation logic
- `frontend/app/dashboard/page.tsx` - Removed 30-day default, uses `??` instead of `||`

### 2. Auto-Refresh for Validity
**Problem**: Validity not updating daily or when admin changes it

**Fix**:
- Added auto-refresh interval (60 seconds) to dashboard
- Automatically fetches updated stats and validity
- Updates when admin changes validity in admin panel

**Files Changed**:
- `frontend/app/dashboard/page.tsx` - Added `setInterval` to refresh data every 60 seconds

### 3. Post Link Saving
**Problem**: Post link only saved to Python backend, not to Supabase database

**Fix**:
- Updated `/api/user/advertisement` POST endpoint to save to both:
  1. Python backend (for bot execution)
  2. Supabase `adbots.post_link` field (for persistence)
- Updated GET endpoint to read from database first (source of truth), then fallback to Python backend

**Files Changed**:
- `frontend/app/api/user/advertisement/route.ts`:
  - GET: Reads from `adbots.post_link` first, then Python backend
  - POST: Saves to both Python backend AND Supabase `adbots.post_link`

### 4. Stats Display
**Problem**: Stats may not be accurate

**Fix**:
- Stats endpoint reads from `adbots.messages_sent` and `adbots.groups_reached`
- Auto-refresh ensures stats are updated every 60 seconds
- Properly calculates messages this week from activity logs

**Note**: Stats are updated by Python backend during bot execution. If stats seem incorrect, ensure Python backend is syncing stats to Supabase via `updateAdbotStats()` function.

## 📋 Testing Checklist

### Test 1: Plan Validity Display
1. Create adbot with 7-day validity
2. Check dashboard shows "7 days" (not 30)
3. Wait 1 day, refresh - should show "6 days"
4. Admin extends validity by 10 days
5. Dashboard should auto-refresh within 60 seconds showing new validity

### Test 2: Post Link Saving
1. User enters post link in dashboard
2. Save post link
3. Check Supabase `adbots.post_link` field - should contain the link
4. Refresh dashboard - should show saved link
5. Check Python backend state - should also have the link

### Test 3: Auto-Refresh
1. Open dashboard
2. Admin changes validity in admin panel
3. Wait up to 60 seconds
4. Dashboard should automatically update validity without manual refresh

### Test 4: Stats Accuracy
1. Start bot and let it post messages
2. Check dashboard stats update
3. Verify `messages_sent` and `groups_reached` match actual posts
4. Check "Messages This Week" shows correct count

## 🔧 Technical Details

### Plan Validity Calculation
```typescript
// Before: Always defaulted to 30
planValidityDays: statsData.planValidityDays || 30

// After: Uses actual calculation, no default
planValidityDays: statsData.planValidityDays ?? 0

// Calculation in API:
const daysRemaining = diffMs / (1000 * 60 * 60 * 24);
planValidityDays = Math.max(0, Math.floor(daysRemaining));
```

### Post Link Saving Flow
1. User saves post link → `/api/user/advertisement` POST
2. Get adbot ID from database
3. Save to Python backend (for bot execution)
4. Save to Supabase `adbots.post_link` (for persistence)
5. Return success

### Auto-Refresh Implementation
```typescript
// Refresh every 60 seconds
const refreshInterval = setInterval(() => {
  if (userId) {
    fetchUserData(userId); // Fetches stats, validity, etc.
  }
}, 60000);
```

## 🐛 Known Issues / Future Improvements

1. **Stats Sync**: Python backend updates stats in `stats.json`, but needs to sync to Supabase. Consider adding a sync endpoint or webhook.

2. **Real-time Updates**: Currently uses polling (60s interval). Could implement WebSocket or Supabase real-time subscriptions for instant updates.

3. **Validity Expiration**: When validity expires, should show warning/disable bot. Currently just shows 0 days.

## 📝 Notes

- All changes maintain backward compatibility
- Database is source of truth for post links
- Python backend is used for bot execution
- Auto-refresh can be adjusted (currently 60 seconds)

