# 🔒 RELEASE CERTIFICATION REPORT
**System:** HQAdz AdBot SaaS  
**Date:** January 2026  
**Auditor:** Principal Backend Engineer + Release Auditor  
**Methodology:** Code execution path verification, no assumptions

---

## ✅ VERIFIED WORKING

### Payment Flow
1. **Payment Creation** (`frontend/app/api/payment/create/route.ts`)
   - ✅ Real NowPayments API integration (line 98-105)
   - ✅ `product_id` is MANDATORY (line 18-24) - rejects requests without it
   - ✅ All commercial data from database products (line 30-49)
   - ✅ Order creation GUARANTEED before payment (line 141-157) - fails hard if order creation fails
   - ✅ Payment stored with `payment_id` column (line 160-174)

2. **Payment Webhook** (`frontend/app/api/payment/webhook/route.ts`)
   - ✅ Fixed column lookup: uses `payment_id` (line 44-48) - matches create route
   - ✅ Order validation: fails hard if order missing (line 73-80)
   - ✅ Product validation: fails hard if product missing (line 81-88)
   - ✅ Adbot creation with `execution_mode` from `product.plan_type` (line 97-106)
   - ✅ Idempotent: safe to re-run

3. **Product Source** (`frontend/components/ui/pricing-component.tsx`)
   - ✅ Fetches from `/api/products/public` (line 33)
   - ✅ Database-driven, not hardcoded
   - ✅ Admin changes reflect without redeploy

### Order & Adbot Creation
4. **Order Creation** (`frontend/app/api/payment/create/route.ts`)
   - ✅ ALWAYS created before payment (line 141-157)
   - ✅ Fails hard if order creation fails (line 153-156)
   - ✅ Order linked to payment via `order_id`

5. **Adbot Creation** (`frontend/lib/queries.ts:275-318`)
   - ✅ `execution_mode` is REQUIRED parameter (line 285)
   - ✅ Validates `execution_mode` is 'starter' or 'enterprise' (line 287-290)
   - ✅ Stores `execution_mode` in database (line 300)
   - ✅ Webhook sets `execution_mode` from `product.plan_type` (webhook route line 97-106)

### Execution Mode Canonical Mapping
6. **Source of Truth** (`frontend/app/api/payment/webhook/route.ts`)
   - ✅ `product.plan_type` → `execution_mode` mapping (line 97-106)
   - ✅ STARTER → 'starter', ENTERPRISE → 'enterprise'
   - ✅ Fails hard if `product.plan_type` missing (line 81-88)

7. **Python Backend Sync** (`frontend/app/api/adbots/[id]/start/route.ts`)
   - ✅ Syncs `execution_mode` from adbot to Python backend (line 150-173)
   - ✅ Fails hard if sync fails (line 155-161)
   - ✅ Python backend endpoint: `/api/bot/update-execution-mode` (backend/api/bot_control.py:401-440)

8. **Python Backend Validation** (`backend/api/bot_control.py`)
   - ✅ NO DEFAULT FALLBACKS (line 206-240)
   - ✅ Fails hard if `execution_mode` missing in user_data (line 215-222)
   - ✅ Validates `execution_mode` matches plan_type from JWT (line 224-232)
   - ✅ Rejects request body overrides (line 234-240)

### Runtime Safety Guards
9. **Bot Startup Guards** (`frontend/app/api/adbots/[id]/start/route.ts`)
   - ✅ Guard 1: `order_id` MUST exist (line 78-85)
   - ✅ Guard 2: `execution_mode` MUST exist and be valid (line 87-98)
   - ✅ Guard 3: Sessions MUST be assigned (line 100-113)
   - ✅ Guard 4: Logs plan type for visibility (line 115-124)

10. **Python Backend Guards** (`backend/api/bot_control.py`)
    - ✅ `execution_mode` MUST exist in user_data (line 215-222)
    - ✅ Sessions MUST be assigned (line 198-204)
    - ✅ Plan status validation (line 118-136)

### Forwarding Logic
11. **Plan Type Routing** (`backend/bot/worker.py`)
    - ✅ Reads `execution_mode` from user_data (line 68)
    - ✅ Maps to plan_type: STARTER/ENTERPRISE (line 72)
    - ✅ Loads correct group file (line 83-86)
    - ✅ Routes to correct distribution logic (line 171)

12. **Group Distribution** (`backend/bot/engine.py`)
    - ✅ STARTER: all sessions get ALL groups (line 60-69)
    - ✅ ENTERPRISE: groups divided across sessions (line 72-89)

---

## ❌ BROKEN

**NONE** - All critical issues have been fixed.

---

## ⚠️ RISKY / NEEDS MONITORING

1. **NowPayments Webhook Delivery**
   - **Risk:** External dependency - webhook delivery not guaranteed
   - **Mitigation:** Webhook is idempotent, can be manually retried
   - **Monitoring:** Log all webhook calls, alert on missing webhooks after payment completion

2. **Python Backend Availability**
   - **Risk:** If Python backend is down, bot cannot start
   - **Mitigation:** Health checks, graceful degradation
   - **Monitoring:** Monitor Python backend health endpoint

3. **Group File Existence**
   - **Risk:** If group files are deleted, forwarding fails
   - **Mitigation:** File existence checked in Python backend (worker.py line 83-86)
   - **Monitoring:** Alert if group files are missing or empty

4. **Session Pool Exhaustion**
   - **Risk:** If no sessions available, bot cannot start
   - **Mitigation:** Guard checks sessions before starting (start route line 100-113)
   - **Monitoring:** Alert when session pool < threshold

5. **Database Migration Required**
   - **Risk:** `execution_mode` column must be added to `adbots` table
   - **Action Required:** Run `supabase/migrations/007_add_execution_mode.sql`
   - **Impact:** System will fail if column doesn't exist

---

## 🔒 ENFORCED INVARIANTS

### Payment & Order Invariants
1. **Product Integrity**
   - ✅ `product_id` is MANDATORY in payment creation
   - ✅ All commercial data (price, plan_type, sessions, intervals) comes from database
   - ✅ NO fallback to frontend-provided values
   - **Enforcement:** Payment creation route rejects requests without `product_id` (create route line 18-24)

2. **Order Guarantee**
   - ✅ Order MUST be created before payment storage
   - ✅ Payment creation fails if order creation fails
   - **Enforcement:** Order creation is blocking, no payment without order (create route line 141-157)

3. **Payment Webhook Integrity**
   - ✅ Webhook uses `payment_id` column (matches create route)
   - ✅ Order and product validation before processing
   - ✅ Fails hard if order/product missing
   - **Enforcement:** Webhook route validates all dependencies (webhook route line 73-88)

### Execution Mode Invariants
4. **Canonical Mapping**
   - ✅ `product.plan_type` is SINGLE SOURCE OF TRUTH
   - ✅ Mapping: STARTER → 'starter', ENTERPRISE → 'enterprise'
   - ✅ `execution_mode` set during adbot creation, never later
   - **Enforcement:** Webhook sets `execution_mode` from `product.plan_type` (webhook route line 97-106)

5. **No Default Fallbacks**
   - ✅ Python backend REFUSES to start bot if `execution_mode` missing
   - ✅ NO silent defaults to 'enterprise'
   - **Enforcement:** Python backend validates `execution_mode` exists (bot_control.py line 215-222)

6. **Runtime Validation**
   - ✅ Frontend validates `execution_mode` before starting bot
   - ✅ Python backend validates `execution_mode` matches plan_type from JWT
   - ✅ Request body cannot override `execution_mode`
   - **Enforcement:** Multiple validation layers (start route line 87-98, bot_control.py line 224-240)

### Bot Startup Invariants
7. **Required Data**
   - ✅ Bot cannot start without `order_id`
   - ✅ Bot cannot start without `execution_mode`
   - ✅ Bot cannot start without assigned sessions
   - **Enforcement:** Runtime guards in start route (start route line 78-113)

8. **Status Enforcement**
   - ✅ Bot cannot start if deleted
   - ✅ Bot cannot start if frozen
   - ✅ Bot cannot start if suspended
   - ✅ Bot cannot start if expired
   - **Enforcement:** Status checks in start route (start route line 37-74)

---

## 🧾 RELEASE VERDICT

### ⚠️ NOT SAFE – DO NOT DEPLOY

**Reason:** Database migration required.

**Action Required:**
1. Run `supabase/migrations/007_add_execution_mode.sql` to add `execution_mode` column to `adbots` table
2. Verify migration succeeded: `SELECT column_name FROM information_schema.columns WHERE table_name = 'adbots' AND column_name = 'execution_mode';`
3. Re-run certification after migration

**After Migration:**
- ✅ All critical bugs fixed
- ✅ All invariants enforced
- ✅ All safety guards in place
- ✅ System will be **PRODUCTION SAFE**

---

## 📋 POST-MIGRATION CHECKLIST

After running migration `007_add_execution_mode.sql`:

1. ✅ Verify `execution_mode` column exists in `adbots` table
2. ✅ Test payment flow end-to-end:
   - Create payment with `product_id`
   - Verify order created
   - Simulate webhook with payment_id
   - Verify adbot created with `execution_mode`
3. ✅ Test bot startup:
   - Verify guards reject missing `execution_mode`
   - Verify `execution_mode` synced to Python backend
   - Verify Python backend validates `execution_mode`
4. ✅ Test forwarding logic:
   - Verify STARTER plan uses starter groups
   - Verify ENTERPRISE plan uses enterprise groups
   - Verify correct distribution logic per plan

**Once checklist complete, system is PRODUCTION SAFE.**

