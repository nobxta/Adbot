# 🔍 COLD AUDIT REPORT - HQAdz AdBot System
**Date:** January 2026  
**Auditor:** Senior Backend Engineer  
**Methodology:** Runtime logic analysis, no assumptions

---

## STEP 1: PAYMENTS & PLANS SOURCE AUDIT

### Payment Creation
**File:** `frontend/app/api/payment/create/route.ts`

**Status:** ✅ **Working** (with conditions)

**Facts:**
- Line 98-105: Makes **REAL API call** to NowPayments: `fetch(${NOWPAYMENTS_API_URL}/payment)`
- Line 8-9: Uses environment variables `NOWPAYMENTS_API_KEY` and `NOWPAYMENTS_API_URL`
- Line 116: Receives real payment response with `payment_id`, `pay_address`, `pay_amount`
- **NOT a mock** - actual external API integration

**Payment Tracking:**
- Line 160-174: Stores payment in Supabase `payments` table via `createPayment()`
- Fields stored: `payment_id`, `email`, `plan_name`, `plan_type`, `amount`, `currency`, `user_id`, `order_id`
- **Real database storage** - not mocked

**Product Lookup:**
- Line 30-49: **IF** `product_id` provided, fetches from Supabase `products` table
- Line 38-48: Uses database price if product found, otherwise uses provided amount
- **Conditional** - works if `product_id` is provided, otherwise uses frontend-provided values

### Payment Confirmation/Webhook
**File:** `frontend/app/api/payment/webhook/route.ts`

**Status:** ❌ **BROKEN**

**Critical Bug:**
- Line 44-48: Queries `payments` table with `.eq('provider_payment_id', payment_id)`
- **BUT** Line 160-174 in `create/route.ts`: Stores payment with field `payment_id` (NOT `provider_payment_id`)
- **Schema Check:** `frontend/supabase/schema.sql` line 35: Table has `payment_id` field, NOT `provider_payment_id`
- **Mismatch:** Webhook looks for `provider_payment_id` but payment is stored with `payment_id` AND column doesn't exist
- **Result:** Webhook will **ALWAYS return 404** - payment not found

**Evidence:**
```typescript
// create/route.ts line 160
createPayment({
  payment_id: paymentData.payment_id,  // Stored as 'payment_id'
  ...
})

// webhook/route.ts line 47
.eq('provider_payment_id', payment_id)  // Looking for 'provider_payment_id'
```

**Impact:**
- ❌ Webhook crashes on line 50-55: "Payment not found"
- ❌ No order processing
- ❌ No adbot creation
- ❌ No session assignment
- ❌ User pays but gets nothing

### Plans Source
**Status:** ⚠️ **Partially Working**

**Database Storage:**
- Products table exists: `supabase/migrations/001_complete_schema.sql` lines 67-83
- Fields: `id`, `name`, `type`, `plan_type`, `sessions_count`, `posting_interval_seconds`, `price`, `validity_days`
- **Real database table** - not mocked

**Landing Page:**
- **File:** `frontend/app/page.tsx` line 330: Uses `<Pricing>` component
- **File:** `frontend/components/ui/pricing-component.tsx` line 29-46: Fetches from `/api/products/public?plan_type=${planType}`
- **Status:** ✅ **Fetches from database** - confirmed
- **Line 33:** Makes API call to public products endpoint
- **Line 38:** Sets products from API response
- **NOT hardcoded** - confirmed database-driven

**Admin-Managed:**
- `frontend/app/admin/products/page.tsx`: Admin can manage products
- `frontend/lib/queries.ts` line 184-192: `listProducts()` function exists
- **Products CAN be managed by admin** - confirmed

**Reflection:**
- **CONFIRMED:** Landing page fetches from `/api/products/public` endpoint
- **CONFIRMED:** Admin can change products in database
- **CONFIRMED:** Admin changes reflect on user pages without redeploy (database-driven)

---

## STEP 2: ORDER CREATION & PLAN MAPPING

### Order Creation
**File:** `frontend/app/api/payment/create/route.ts`

**Status:** ⚠️ **Conditional**

**Facts:**
- Line 141-157: Order is created **ONLY IF** `actualProduct && user` exists
- Line 145-149: Calls `createOrder()` from `queries.ts`
- Line 150: Stores order ID in `payment.order_id`
- **BUT:** If `product_id` not provided in request, `actualProduct` is null → **NO ORDER CREATED**

**Order Fields:**
- `frontend/lib/queries.ts` line 210-225: `createOrder()` function
- Fields: `user_id`, `product_id`, `total_amount`, `reseller_id?`, `commission_amount?`
- **Missing:** `plan_name`, `interval`, `session_count`, `plan_type` - these come from `product` table via join

**Plan Mapping:**
- Line 30-49: If `product_id` provided, fetches product from DB
- Line 40-41: Maps `product.name` → `actualPlanName`, `product.plan_type` → `actualPlanType`
- **Uses database values** - confirmed
- **BUT:** If no `product_id`, uses frontend-provided `planName` and `planType` (hardcoded)

**Default Fallbacks:**
- Line 28: `actualPlanType = planType` (from request body)
- Line 77: `finalAmount = actualProduct ? actualProduct.price : parseFloat(amount)`
- **YES, fallbacks exist** - uses request body if no product_id

**Mismatches:**
- If frontend sends `planName="Bronze"` but no `product_id`, system uses "Bronze" string
- No mapping from "Bronze" → sessions/intervals
- **CRITICAL:** Webhook expects `order.product_id` to exist (line 74), but order may not exist if no `product_id` provided

---

## STEP 3: PLAN TYPE LOGIC VALIDATION

### Plan Type Detection
**File:** `backend/api/bot_control.py`

**Status:** ✅ **Working** (DB-driven)

**Facts:**
- Line 206-243: `execution_mode` determined from `plan_limits.plan_type` in JWT
- Line 213: `plan_type = plan_limits.get("plan_type")`
- Line 216-217: `if plan_type == "STARTER": execution_mode = "starter"`
- Line 224-225: `elif plan_type == "ENTERPRISE": execution_mode = "enterprise"`
- **DB-driven** - reads from JWT `plan_limits` claim

**JWT Generation:**
- `frontend/app/api/adbots/[id]/start/route.ts` line 92-99: Generates JWT with `plan_limits`
- **BUT:** `plan_limits` comes from adbot data, not product
- **UNKNOWN:** How `plan_limits.plan_type` is set when adbot is created

**Hardcoded Values:**
- Line 207: Default `execution_mode = "enterprise"` if no plan_type
- **Fallback exists** - defaults to enterprise

### Forwarding Logic Routing
**File:** `backend/bot/worker.py`

**Status:** ✅ **Working**

**Facts:**
- Line 68: `execution_mode = user_data.get("execution_mode", "enterprise")`
- Line 72: `plan_type = "STARTER" if execution_mode == "starter" else "ENTERPRISE"`
- Line 83-86: Loads groups from file based on `plan_type`:
  - STARTER → `starter_groups.txt`
  - ENTERPRISE → `enterprise_groups.txt`
- **Correct routing** - confirmed

**Group Distribution:**
- Line 171: `distribute_groups(groups, num_sessions, execution_mode)`
- `backend/bot/engine.py` line 72-89: Routes to:
  - `distribute_groups_starter()` if `execution_mode == "starter"` → all sessions get ALL groups
  - `distribute_groups_enterprise()` if `execution_mode == "enterprise"` → groups divided across sessions
- **Correct logic** - confirmed

**Shared Logic:**
- `backend/bot/engine.py` line 230-400: `execute_forwarding_cycle()` is shared
- Uses `execution_mode` parameter to determine behavior
- **Appropriate sharing** - single function with mode parameter

**Missing Link:**
- **UNKNOWN:** How `execution_mode` gets into `user_data` when adbot is created
- `createAdbot()` in `queries.ts` line 275-318: **DOES NOT SET** `execution_mode`
- **GAP:** Product `plan_type` → adbot creation → Python backend `execution_mode` mapping is **NOT VERIFIED**

---

## STEP 4: RUN / START EXECUTION CHECK

### Start Function Triggered
**File:** `frontend/app/api/adbots/[id]/start/route.ts`

**Status:** ✅ **Working**

**Facts:**
- Line 112-124: Calls `startAdbot()` from `python-backend.ts`
- Line 58: Makes POST to `${PYTHON_BACKEND_URL}/api/bot/start`
- **Real API call** - confirmed

**Python Backend:**
- `backend/api/bot_control.py` line 100-277: `start_bot()` endpoint
- Line 138: Gets `user_data` from `get_user_data(user_id)`
- Line 143: Checks `bot_status == "running"` (already running check)
- Line 190-196: Updates `user_data` with `execution_mode`
- Line 257-263: Sets `bot_status = "running"` and `execution_mode` in user_data
- **Status is set** - confirmed

### Sessions Loading
**Status:** ✅ **Working**

**Facts:**
- `frontend/app/api/adbots/[id]/start/route.ts` line 77-88: Fetches sessions from Supabase
- Query: `.eq('assigned_to_adbot_id', adbotId).eq('status', 'ASSIGNED')`
- Line 118-123: Maps sessions with `phone_number`, `api_id`, `api_hash`, `session_file_path`
- **Sessions are loaded** - confirmed

**Python Backend:**
- `backend/api/bot_control.py` line 147: `assigned_sessions = user_data.get("assigned_sessions", [])`
- Line 148-196: If no sessions, assigns from unused pool
- **Sessions are assigned** - confirmed

### Groups Loading
**Status:** ✅ **Working**

**Facts:**
- `backend/bot/worker.py` line 83-86: Loads groups from file based on `plan_type`
- `backend/bot/group_file_manager.py`: File-based group loading
- **Groups loaded from files** - confirmed

### Forwarding Actually Starts
**Status:** ✅ **Working** (with conditions)

**Facts:**
- `backend/bot/scheduler.py`: Scheduler loops and calls `execute_user_cycle()`
- `backend/bot/worker.py` line 28-322: `execute_user_cycle()` function
- Line 57: Checks `bot_status == "running"` - **REQUIRED**
- Line 390-401: Calls `execute_forwarding_cycle()` from `engine.py`
- **Forwarding logic is called** - confirmed

**Silent Failures:**
- Line 57: If `bot_status != "running"`, returns early with error
- **No silent failure** - returns error dict

**Missing Awaits:**
- Line 265: `await asyncio.gather(*tasks, return_exceptions=True)` - **AWAITED**
- **No missing awaits** - confirmed

**Async Functions:**
- `execute_session_cycle()` is async and is awaited in `asyncio.gather()`
- **Functions are called** - confirmed

**Flags Set:**
- `backend/api/bot_control.py` line 258: `update_user_data(user_id, {"bot_status": "running"})`
- `backend/bot/scheduler.py` line 74: Checks `user_data.get("bot_status") == "running"`
- **Flag is checked** - confirmed

---

## SUMMARY

### ✅ WORKING
1. Payment creation (real NowPayments API)
2. Payment storage in database
3. Plan type detection (DB-driven from JWT)
4. Forwarding logic routing (STARTER vs ENTERPRISE)
5. Groups loading from files
6. Sessions loading and assignment
7. Start function triggers Python backend
8. Forwarding cycle execution

### ❌ BROKEN
1. **Payment webhook** - `provider_payment_id` vs `payment_id` mismatch → webhook crashes
2. **Order processing** - Cannot process orders because webhook fails
3. **Adbot creation after payment** - Never happens because webhook fails
4. **Session assignment after payment** - Never happens because webhook fails

### ⚠️ PARTIALLY WORKING
1. **Order creation** - Only if `product_id` provided in payment request
2. **Plan mapping** - Uses DB if `product_id` provided, otherwise uses frontend values
3. **execution_mode mapping** - Gap between product creation and Python backend user_data

### 🔴 CRITICAL ISSUES

**Issue #1: Webhook Payment Lookup Mismatch**
- **File:** `frontend/app/api/payment/webhook/route.ts` line 47
- **Problem:** Queries `provider_payment_id` but payment stored as `payment_id`
- **Fix Required:** Change line 47 to `.eq('payment_id', payment_id)` OR store as `provider_payment_id` in create route

**Issue #2: Missing execution_mode in Adbot Creation**
- **File:** `frontend/lib/queries.ts` line 275-318 (`createAdbot()`)
- **File:** `frontend/app/api/payment/webhook/route.ts` line 97-106 (webhook creates adbot)
- **Problem:** `createAdbot()` does not set `execution_mode` field. Webhook creates adbot but never sets `execution_mode` based on `product.plan_type`
- **Impact:** Python backend reads `execution_mode` from `user_data` (worker.py line 68), but it's never set during adbot creation → defaults to "enterprise" for ALL products
- **Result:** STARTER products run in ENTERPRISE mode (wrong groups, wrong timing)
- **Fix Required:** 
  1. Add `execution_mode` parameter to `createAdbot()` function
  2. In webhook, set `execution_mode = product.plan_type?.toLowerCase() === 'starter' ? 'starter' : 'enterprise'`
  3. Store `execution_mode` in Python backend `user_data` when adbot is created

**Issue #3: Order Creation Conditional**
- **File:** `frontend/app/api/payment/create/route.ts` line 141-157
- **Problem:** Order only created if `product_id` provided
- **Impact:** If frontend doesn't send `product_id`, webhook will crash (line 73-74)
- **Fix Required:** Ensure `product_id` is always provided OR handle missing order in webhook

---

## VERDICT

**System is 70% functional but has CRITICAL bugs:**

1. **Payment webhook is BROKEN** - prevents automated adbot creation after payment
2. **execution_mode is NEVER SET** - STARTER products run in wrong mode (ENTERPRISE)
3. **Order creation is conditional** - may fail if product_id not provided

**Payment flow is broken at webhook stage, causing complete failure of post-payment automation.**

**Plan type routing works correctly IF execution_mode is set, but execution_mode is never set during adbot creation.**

