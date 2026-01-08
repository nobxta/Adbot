# 🧪 TESTING CHECKLIST - Bot-Centric Migration

**Date:** After Migration 005  
**Status:** Ready for Testing  
**Priority:** Critical - Verify bot-centric identity model

---

## 📋 PRE-TESTING VERIFICATION

### 1. Database Schema Verification ✅
- [x] Migration 005 executed successfully
- [ ] Verify all tables exist in Supabase
- [ ] Verify `bots` table has all required columns
- [ ] Verify `users` table is minimal (no auth fields)
- [ ] Verify foreign keys are correct

**SQL Queries to Run:**
```sql
-- Check bots table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'bots' 
ORDER BY ordinal_position;

-- Check users table structure (should be minimal)
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;

-- Verify foreign keys
SELECT 
  tc.table_name, 
  kcu.column_name, 
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_schema = 'public';
```

---

## 🔐 AUTHENTICATION FLOW TESTING

### 2. Bot Login (Primary Flow) ✅

**Test Case 2.1: Login with Access Code Only**
- [ ] Navigate to `/access`
- [ ] Enter a valid bot `access_code` (no password)
- [ ] Verify login succeeds
- [ ] Verify JWT token contains `botId` (not `userId`)
- [ ] Verify redirect to dashboard
- [ ] Check `bots.last_login` is updated

**Test Case 2.2: Login with Access Code + Password**
- [ ] Create bot with password via admin panel
- [ ] Navigate to `/access`
- [ ] Enter `access_code` + `password`
- [ ] Verify login succeeds
- [ ] Verify JWT contains `botId`

**Test Case 2.3: Invalid Access Code**
- [ ] Enter invalid access code
- [ ] Verify error: "Invalid access code"
- [ ] Verify rate limiting works (5 attempts per 15 min)

**Test Case 2.4: Admin Login (Backward Compatibility)**
- [ ] Login with admin user access code
- [ ] Verify admin bot is created/linked automatically
- [ ] Verify admin can access `/admin` panel

**API Endpoint:** `POST /api/auth/verify-access-code`

**Expected JWT Payload:**
```json
{
  "botId": "uuid-here",
  "ownerUserId": "uuid-here" | null,
  "role": "ADMIN" | "USER" | "RESELLER",
  "email": "user@example.com" | null
}
```

---

## 👤 ADMIN OPERATIONS TESTING

### 3. Bot Creation (Admin) ✅

**Test Case 3.1: Create Bot Without User**
- [ ] Login as admin
- [ ] Navigate to admin panel
- [ ] Create new bot:
  - Access code: auto-generated
  - Password: optional
  - Plan type: starter/enterprise
  - Plan status: active
- [ ] Verify bot created in `bots` table
- [ ] Verify `owner_user_id` is NULL
- [ ] Verify credentials returned (ONE-TIME)
- [ ] Verify bot can login immediately

**Test Case 3.2: Create Bot With User Link**
- [ ] Create user first (optional, via admin)
- [ ] Create bot with `owner_user_id`
- [ ] Verify bot linked to user
- [ ] Verify user can see bot in dashboard

**Test Case 3.3: Create Bot With Custom Access Code**
- [ ] Create bot with custom access code
- [ ] Verify access code is unique
- [ ] Verify error if access code exists

**Test Case 3.4: Create Bot With Password**
- [ ] Create bot with password (min 6 chars)
- [ ] Verify password is hashed in database
- [ ] Verify plain password returned ONCE
- [ ] Verify bot can login with password

**API Endpoint:** `POST /api/admin/bots/create`

**Required Headers:**
```
Authorization: Bearer <admin-jwt-token>
```

---

## 📊 DASHBOARD & DATA DISPLAY

### 4. Admin Dashboard ✅

**Test Case 4.1: Dashboard Metrics**
- [ ] Login as admin
- [ ] Navigate to `/admin`
- [ ] Verify "Overall Active Adbots" shows correct count
- [ ] Verify "Currently Active Adbots" shows running bots
- [ ] Verify "Recently Active Adbots" shows recent activity
- [ ] Verify "Lifetime Revenue" is accurate
- [ ] Verify "Sales Overview" with date filters works
- [ ] Verify "Stock Overview" shows: Unused, Assigned, Banned, Frozen
- [ ] Verify "Adbot Runtime Status" shows real data

**Test Case 4.2: Date Range Filters**
- [ ] Test "Today" filter
- [ ] Test "This Week" filter
- [ ] Test "This Month" filter
- [ ] Test "Lifetime" filter
- [ ] Test "Custom Range" date picker
- [ ] Verify revenue chart updates correctly

**API Endpoint:** `GET /api/admin/dashboard`

---

## 🤖 BOT OPERATIONS TESTING

### 5. Bot Dashboard (User Panel) ⚠️

**Test Case 5.1: Bot Dashboard Access**
- [ ] Login with bot access code
- [ ] Navigate to `/dashboard` (if exists)
- [ ] Verify bot sees own adbots
- [ ] Verify bot sees own orders
- [ ] Verify bot sees own sessions

**Test Case 5.2: Bot Adbots List**
- [ ] Verify `GET /api/user/adbots` returns bot's adbots
- [ ] Verify query uses `bot_id` not `user_id`
- [ ] Verify only bot's adbots are returned

**Test Case 5.3: Bot Orders List**
- [ ] Verify `GET /api/user/orders` returns bot's orders
- [ ] Verify query uses `bot_id` not `user_id`

**API Endpoints:**
- `GET /api/user/adbots`
- `GET /api/user/orders`
- `GET /api/user/notifications`

---

## 📦 SESSION MANAGEMENT TESTING

### 6. Session Assignment ✅

**Test Case 6.1: Session Assignment to Bot**
- [ ] Assign session to adbot
- [ ] Verify `sessions.assigned_to_bot_id` is set
- [ ] Verify `sessions.assigned_to_adbot_id` is set
- [ ] Verify `sessions.assigned_to_user_id` is NOT used (deprecated)

**Test Case 6.2: Session Status**
- [ ] Verify "Unused" sessions count
- [ ] Verify "Assigned" sessions count
- [ ] Verify "Banned" sessions count
- [ ] Verify "Frozen" sessions count

**Test Case 6.3: Session Query by Bot**
- [ ] Query sessions for specific bot
- [ ] Verify query uses `assigned_to_bot_id`
- [ ] Verify only bot's sessions returned

**Code Location:** `frontend/lib/queries.ts` - `assignSessionToAdbot`

---

## 💳 PAYMENT & ORDER FLOW

### 7. Payment Webhook Testing ✅

**Test Case 7.1: Payment Creates Order**
- [ ] Simulate payment webhook
- [ ] Verify order created with `bot_id`
- [ ] Verify order linked to correct bot
- [ ] Verify `user_id` is optional (legacy)

**Test Case 7.2: Payment Auto-Assigns Sessions**
- [ ] Complete payment flow
- [ ] Verify sessions assigned to bot
- [ ] Verify adbot created with `bot_id`

**API Endpoint:** `POST /api/payment/webhook`

**Verify:**
- `orders.bot_id` is set
- `adbots.bot_id` is set
- `payments.bot_id` is set

---

## 🔍 DATA INTEGRITY TESTING

### 8. Foreign Key Relationships ✅

**Test Case 8.1: Bot Deletion Cascade**
- [ ] Delete bot
- [ ] Verify related records:
  - `adbots.bot_id` → CASCADE (adbots deleted)
  - `orders.bot_id` → CASCADE (orders deleted)
  - `payments.bot_id` → CASCADE (payments deleted)
  - `sessions.assigned_to_bot_id` → SET NULL

**Test Case 8.2: User Deletion (Optional)**
- [ ] Delete user
- [ ] Verify `bots.owner_user_id` → SET NULL
- [ ] Verify bot still exists (bot is primary)

**Test Case 8.3: Data Consistency**
- [ ] Verify no orphaned records
- [ ] Verify all `bot_id` references are valid
- [ ] Verify deprecated `user_id` fields are not used

---

## 🚨 ERROR HANDLING TESTING

### 9. Edge Cases & Errors ✅

**Test Case 9.1: Missing Bot**
- [ ] Try to access endpoint with invalid `botId` in JWT
- [ ] Verify proper error handling
- [ ] Verify 401/403 response

**Test Case 9.2: Expired Bot**
- [ ] Create bot with `expires_at` in past
- [ ] Try to login
- [ ] Verify login blocked or warning shown

**Test Case 9.3: Suspended Bot**
- [ ] Set bot `plan_status` to 'suspended'
- [ ] Try to login
- [ ] Verify access restricted

**Test Case 9.4: Rate Limiting**
- [ ] Make 5+ failed login attempts
- [ ] Verify rate limit error (429)
- [ ] Verify retry-after header
- [ ] Wait 15 minutes, verify reset

---

## 🎨 FRONTEND TESTING

### 10. UI Components ✅

**Test Case 10.1: Login Page**
- [ ] Verify `/access` page loads
- [ ] Verify access code input works
- [ ] Verify password input (if shown)
- [ ] Verify error messages display
- [ ] Verify loading states

**Test Case 10.2: Admin Panel**
- [ ] Verify admin sidebar navigation
- [ ] Verify all admin pages load
- [ ] Verify bot creation form
- [ ] Verify dashboard charts render

**Test Case 10.3: User Panel (if exists)**
- [ ] Verify user dashboard loads
- [ ] Verify bot information displays
- [ ] Verify adbots list works

---

## 📝 JWT TOKEN TESTING

### 11. Token Validation ✅

**Test Case 11.1: Token Structure**
- [ ] Decode JWT token
- [ ] Verify `botId` exists
- [ ] Verify `ownerUserId` (optional)
- [ ] Verify `role` is correct
- [ ] Verify `exp` (expiration) is set

**Test Case 11.2: Token Refresh**
- [ ] Use refresh token endpoint
- [ ] Verify new access token generated
- [ ] Verify new token has correct `botId`

**Test Case 11.3: Token Expiration**
- [ ] Wait for token to expire
- [ ] Make API request
- [ ] Verify 401 error
- [ ] Verify refresh flow works

**API Endpoint:** `POST /api/auth/refresh`

---

## 🔄 MIGRATION DATA VERIFICATION

### 12. Data Migration Check ✅

**Test Case 12.1: Existing Users Migrated**
- [ ] Check if users from migration 004 have bots
- [ ] Verify `bots.owner_user_id` links correctly
- [ ] Verify `bots.access_code` matches old `users.access_code`

**Test Case 12.2: Existing Sessions Migrated**
- [ ] Verify `sessions.assigned_to_bot_id` is populated
- [ ] Verify old `assigned_to_user_id` still exists (deprecated)

**Test Case 12.3: Existing Orders Migrated**
- [ ] Verify `orders.bot_id` is populated
- [ ] Verify old `orders.user_id` still exists (legacy)

**SQL Query:**
```sql
-- Check migration status
SELECT 
  (SELECT COUNT(*) FROM bots) as total_bots,
  (SELECT COUNT(*) FROM users) as total_users,
  (SELECT COUNT(*) FROM bots WHERE owner_user_id IS NOT NULL) as bots_with_users,
  (SELECT COUNT(*) FROM sessions WHERE assigned_to_bot_id IS NOT NULL) as sessions_assigned_to_bots,
  (SELECT COUNT(*) FROM orders WHERE bot_id IS NOT NULL) as orders_with_bots;
```

---

## 🐛 KNOWN ISSUES TO VERIFY

### 13. Backward Compatibility ✅

**Test Case 13.1: Legacy User Login**
- [ ] Verify old user access codes still work (if migrated)
- [ ] Verify admin users can login
- [ ] Verify backward compatibility maintained

**Test Case 13.2: Deprecated Fields**
- [ ] Verify `users.access_code` is marked DEPRECATED
- [ ] Verify `users.password_hash` is marked DEPRECATED
- [ ] Verify code doesn't use deprecated fields

---

## 📊 PERFORMANCE TESTING

### 14. Query Performance ✅

**Test Case 14.1: Bot Lookup**
- [ ] Test `getBotByAccessCode` performance
- [ ] Verify index on `bots.access_code` works
- [ ] Verify query is fast (< 100ms)

**Test Case 14.2: Dashboard Queries**
- [ ] Test admin dashboard load time
- [ ] Verify aggregations are fast
- [ ] Verify indexes are used

---

## ✅ FINAL VERIFICATION

### 15. Complete System Test ✅

**Test Case 15.1: End-to-End Flow**
1. [ ] Admin creates bot
2. [ ] Bot logs in with access code
3. [ ] Bot views dashboard
4. [ ] Bot creates order (if payment flow exists)
5. [ ] Payment completes
6. [ ] Sessions auto-assigned
7. [ ] Adbot created
8. [ ] Bot can start/stop adbot

**Test Case 15.2: Multi-Bot Scenario**
- [ ] Create multiple bots
- [ ] Verify bots are isolated
- [ ] Verify each bot sees only own data
- [ ] Verify admin sees all bots

---

## 🚨 CRITICAL CHECKS

### Must Pass Before Production:

- [ ] ✅ All authentication uses `botId`, not `userId`
- [ ] ✅ JWT tokens contain `botId` as primary identifier
- [ ] ✅ Admin can create bots without users
- [ ] ✅ Sessions belong to bots (`assigned_to_bot_id`)
- [ ] ✅ Orders belong to bots (`orders.bot_id`)
- [ ] ✅ Adbots belong to bots (`adbots.bot_id`)
- [ ] ✅ No business logic duplicated
- [ ] ✅ Deprecated fields marked and not used
- [ ] ✅ Foreign keys cascade correctly
- [ ] ✅ Rate limiting works
- [ ] ✅ Error handling is proper

---

## 📝 TESTING NOTES

**Environment:**
- Frontend: `http://localhost:3000` (or Vercel URL)
- Backend API: Next.js API routes
- Database: Supabase PostgreSQL

**Test Data:**
- Create test bots via admin panel
- Use test access codes for login
- Verify data in Supabase dashboard

**Tools:**
- Browser DevTools (Network tab)
- Supabase SQL Editor
- Postman/Insomnia (optional)
- JWT.io (decode tokens)

---

## 🎯 PRIORITY ORDER

1. **CRITICAL** (Do First):
   - Authentication flow (Test 2)
   - Bot creation (Test 3)
   - JWT tokens (Test 11)
   - Data integrity (Test 8)

2. **HIGH** (Do Second):
   - Admin dashboard (Test 4)
   - Session management (Test 6)
   - Payment flow (Test 7)

3. **MEDIUM** (Do Third):
   - Bot dashboard (Test 5)
   - Error handling (Test 9)
   - Frontend UI (Test 10)

4. **LOW** (Do Last):
   - Performance (Test 14)
   - Migration verification (Test 12)

---

**Status:** Ready for Testing  
**Next Steps:** Start with Critical tests, then proceed through priority order.

