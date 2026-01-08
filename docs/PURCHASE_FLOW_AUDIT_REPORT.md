# 🔍 PRODUCTION SAAS PURCHASE FLOW AUDIT REPORT
**Date:** January 6, 2026  
**System:** HQAdz AdBot Platform  
**Auditor:** Senior Full-Stack Engineer  
**Scope:** Complete end-to-end user purchase to dashboard flow

---

## 📋 EXECUTIVE SUMMARY

This audit reveals a **CRITICAL ARCHITECTURAL DISCONNECT** between the frontend purchase flow and backend bot assignment system. The system has **TWO CONFLICTING DATABASE SCHEMAS** and **NO BRIDGE** between hardcoded frontend pricing and actual bot provisioning.

### ⚠️ SEVERITY: HIGH
**The current checkout flow creates payments but CANNOT assign bots because required database records are missing.**

---

## 🔴 CRITICAL ISSUES

### 1. **BROKEN PAYMENT WEBHOOK - CANNOT PROCESS PAYMENTS**
**File:** `frontend/app/api/payment/webhook/route.ts`  
**Lines:** 73-106

**Problem:**
The webhook expects:
```typescript
const order = await getOrderById(payment.order_id);  // ❌ FAILS - no order exists
const product = await getProductById(order.product_id);  // ❌ FAILS - no order
```

**Root Cause:**
- Payment creation (line 112-125 in `create/route.ts`) does **NOT** create an `order` record
- Only creates entry in `payments` table (using simple schema)
- Webhook uses `queries.ts` which expects full Supabase schema with `orders` and `products` tables
- **These tables don't exist in the simple schema** (`frontend/supabase/schema.sql`)

**Impact:**
- ❌ Webhook crashes when NOWPayments confirms payment
- ❌ No bot is assigned to user
- ❌ User pays but gets nothing
- ❌ No sessions assigned
- ❌ No notification sent

**Evidence:**
```typescript
// frontend/app/api/payment/create/route.ts (Lines 112-125)
const payment = await createPayment({
  payment_id: paymentData.payment_id,
  // ... NO ORDER CREATED HERE
});

// frontend/app/api/payment/webhook/route.ts (Lines 73-74)
const order = await getOrderById(payment.order_id);  // ❌ order_id doesn't reference valid order
const product = await getProductById(order.product_id);  // ❌ crashes
```

---

### 2. **HARDCODED PRICING WITH NO BACKEND MAPPING**
**File:** `frontend/components/ui/pricing-component.tsx`  
**Lines:** 10-107

**Problem:**
Frontend has hardcoded plans:
```typescript
{ name: "Bronze", price: "$30", features: ["1 Account", "Sends every 1 hour"] }
{ name: "Silver", price: "$55", features: ["2 Accounts", "Sends every 30 minutes"] }
{ name: "Gold", price: "$80", features: ["3 Accounts", "Sends every 20 minutes"] }
{ name: "Diamond", price: "$160", features: ["6 Accounts", "Sends every 10 minutes"] }
```

**BUT:**
- ❌ These plans are **strings in the UI only**
- ❌ No mapping from "Bronze" → 1 session, 60 min interval
- ❌ Supabase `products` table exists but is **NEVER QUERIED** during purchase
- ❌ Backend has no way to know "Bronze" = 1 session

**Current Flow:**
```
User clicks "Bronze" → URL params (plan=Bronze, price=$30, type=starter)
                    → Payment created with plan_name="Bronze"
                    → NOWPayments webhook fires
                    → getProductById(???)  ❌ No product_id exists
```

**Expected Flow:**
```
User clicks "Bronze" → Lookup product_id for "Bronze" in products table
                    → Create order with product_id
                    → Create payment linked to order
                    → Webhook reads product.sessions_count, product.posting_interval_seconds
                    → Assign sessions from stock
```

---

### 3. **TWO CONFLICTING DATABASE SCHEMAS**
**Files:**
- `frontend/supabase/schema.sql` (Simple schema - currently in use)
- `supabase/migrations/001_complete_schema.sql` (Full schema - NOT in use)

**Simple Schema (IN USE):**
```sql
users (id, email, plan_type, plan_status)
payments (id, payment_id, user_id, plan_name, amount)
bots (id, user_id, bot_id, status)
access_codes (id, code, role)
```
**Missing:** `orders`, `products`, `adbots`, `sessions`, `resellers`, `admins`

**Full Schema (NOT IN USE):**
```sql
users, admins, resellers, products, orders, adbots, sessions, payments, notifications, activity_logs
```
**Has:** Complete e-commerce tables with plan configuration

**Problem:**
- ❌ Frontend code (`queries.ts`) expects full schema
- ❌ Database only has simple schema
- ❌ Webhook will fail when querying `orders` or `products` table

---

## ⚠️ HIGH-RISK ISSUES

### 4. **NO SESSION COUNT OR INTERVAL TRANSMITTED**
**File:** `frontend/app/api/payment/create/route.ts`

**Problem:**
When user purchases "Silver" plan (2 accounts, 30-min interval), the payment record stores:
```json
{
  "plan_name": "Silver",
  "plan_type": "starter",
  "amount": 55
}
```

**Missing:**
- ❌ `sessions_count: 2`
- ❌ `posting_interval_seconds: 1800`
- ❌ `validity_days: 30`

**Impact:**
Backend cannot know how many sessions to assign or what interval to use.

---

### 5. **RACE CONDITION: NO ORDER IDEMPOTENCY**
**File:** `frontend/app/api/payment/webhook/route.ts`

**Problem:**
- ❌ No check if payment already processed
- ❌ Webhook could be called multiple times by NOWPayments
- ❌ Could assign sessions twice to same user
- ❌ No database constraint prevents duplicate bot creation

**Missing:**
```typescript
// Should have:
if (payment.status === 'COMPLETED') {
  return NextResponse.json({ received: true, already_processed: true });
}
```

---

### 6. **BACKEND REGISTRATION EXPECTS DATA FRONTEND DOESN'T SEND**
**File:** `backend/api/bot_control.py`  
**Lines:** 30-33, 256-273

**Backend expects:**
```python
class RegisterUserRequest(BaseModel):
    plan_limits: Optional[Dict[str, Any]] = None  # expects max_sessions
```

**Frontend sends:**
Nothing. The `/register` endpoint is never called from the payment flow.

**Gap:**
Payment webhook should call backend `/register` with:
- `sessions_count` from product
- `posting_interval_seconds` from product
- But currently can't because product doesn't exist

---

### 7. **NO PLAN EXPIRY MECHANISM**
**Files:**
- `frontend/supabase/schema.sql` (users table)
- `backend/bot/data_manager.py`

**Problem:**
- ✅ `validity_days` exists in full schema's `products` table
- ❌ Simple schema has no `plan_expires_at` or `valid_until` field
- ❌ Scheduler has no way to stop expired bots
- ❌ User could use bot forever after single payment

**Risk:**
Users receive service indefinitely without renewal.

---

## ✅ WHAT WORKS CORRECTLY

### 1. **NOWPayments Integration (API Level)**
**Files:** `frontend/app/api/payment/create/route.ts`, `status/route.ts`

**Working:**
- ✅ Payment invoice creation with NOWPayments
- ✅ Unique order_id generation (`HQADZ-{timestamp}-{random}`)
- ✅ Payment address + amount returned to user
- ✅ Payment status polling works
- ✅ Webhook endpoint exposed at `/api/payment/webhook`
- ✅ IPN callback URL configured

**Evidence:**
```typescript
// Lines 49-58: Correct NOWPayments payload structure
const paymentPayload = {
  price_amount: parseFloat(amount),
  price_currency: 'USD',
  pay_currency: currency.toLowerCase(),
  ipn_callback_url: IPN_CALLBACK_URL,
  order_id: `HQADZ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  // ...
};
```

---

### 2. **User Creation on Payment Initiation**
**File:** `frontend/app/api/payment/create/route.ts`  
**Lines:** 88-109

**Working:**
- ✅ Creates user if email doesn't exist
- ✅ Generates unique `access_code` and `license_key`
- ✅ Links user to payment record via `user_id`
- ✅ Sets `plan_status: 'inactive'` (will activate on payment confirmation)

---

### 3. **Payment Status Mapping**
**File:** `frontend/app/api/payment/status/route.ts`  
**Lines:** 45-55

**Working:**
- ✅ Correctly maps NOWPayments statuses to internal statuses
- ✅ Handles: waiting, confirming, confirmed, finished, failed, expired
- ✅ Distinguishes between `confirming` and `paid`

---

### 4. **Frontend Checkout Flow (UI)**
**File:** `frontend/app/checkout/page.tsx`

**Working:**
- ✅ Email validation before payment
- ✅ Crypto currency selection (BTC, ETH, SOL, LTC, USDT)
- ✅ Payment data display (address, amount, currency)
- ✅ Payment status polling with 5-second interval
- ✅ Prevents duplicate payment creation (loading state)

---

### 5. **Backend Session Pool Management**
**File:** `backend/bot/session_manager.py`

**Working:**
- ✅ Sessions organized in folders: `unused/`, `assigned/`, `banned/`, `frozen/`
- ✅ `assign_sessions_to_user()` moves sessions from unused to assigned
- ✅ Checks for banned sessions before assignment
- ✅ Returns list of assigned session filenames
- ✅ Handles journal files correctly

---

### 6. **Dashboard Authentication**
**Files:** `frontend/app/dashboard/page.tsx`, `backend/api/bot_control.py`

**Working:**
- ✅ JWT-based authentication
- ✅ Backend extracts `user_id` from JWT (never trusts headers)
- ✅ Frontend stores token in localStorage
- ✅ Dashboard redirects if not authenticated

---

## 🔗 ACTUAL END-TO-END FLOW (AS IMPLEMENTED)

```
┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 1: USER BROWSES PRICING                                      │
└─────────────────────────────────────────────────────────────────────┘
  File: frontend/app/page.tsx
  ↓
  Component: <Pricing activePlanType="starter" />
  ↓
  File: frontend/components/ui/pricing-component.tsx
  ↓
  User sees: Bronze ($30), Silver ($55), Gold ($80), Diamond ($160)
  ↓
  [✅ WORKS] User clicks "Get Started" on "Silver"
  ↓
  URL: /checkout?plan=Silver&type=starter&price=$55&description=...

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 2: CHECKOUT PAGE                                             │
└─────────────────────────────────────────────────────────────────────┘
  File: frontend/app/checkout/page.tsx
  ↓
  [✅ WORKS] User enters email + validates
  ↓
  [✅ WORKS] User selects cryptocurrency (e.g., USDT)
  ↓
  onClick: handleCryptoSelect('USDT')
  ↓
  POST /api/payment/create
    Body: {
      email: "user@example.com",
      planName: "Silver",
      planType: "starter",
      amount: 55,
      currency: "USDT"
    }

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 3: PAYMENT CREATION (FRONTEND API)                           │
└─────────────────────────────────────────────────────────────────────┘
  File: frontend/app/api/payment/create/route.ts
  ↓
  [✅ WORKS] Validate request body
  ↓
  [✅ WORKS] Build NOWPayments payload:
    {
      price_amount: 55,
      price_currency: "USD",
      pay_currency: "usdt",
      order_id: "HQADZ-1736198745000-abc123xyz",
      ipn_callback_url: "https://domain.com/api/payment/webhook"
    }
  ↓
  [✅ WORKS] POST to NOWPayments API: /v1/payment
  ↓
  [✅ WORKS] NOWPayments returns:
    {
      payment_id: "5847123456",
      pay_address: "TXyz123...",
      pay_amount: "55.00",
      pay_currency: "USDT"
    }
  ↓
  [✅ WORKS] getUserByEmail() - check if user exists
  ↓
  [✅ WORKS] If not exists → createUser():
    - access_code: "USER-1736198745-AB12CD"
    - license_key: "LIC-A1B2C3D4E5F67890"
    - plan_type: "starter"
    - plan_status: "inactive"
  ↓
  [✅ WORKS] createPayment() - store in `payments` table:
    {
      payment_id: "5847123456",
      user_id: "uuid-xxx",
      plan_name: "Silver",       ← Just a string!
      plan_type: "starter",      ← Just a type!
      amount: 55,
      order_id: "HQADZ-...",     ← NOT linked to orders table
      payment_status: "waiting"
    }
  ↓
  [⚠️ MISSING] No order record created
  [⚠️ MISSING] No product lookup
  [⚠️ MISSING] No sessions_count stored
  [⚠️ MISSING] No posting_interval stored
  ↓
  [✅ WORKS] Return payment data to frontend
  ↓
  Frontend shows payment address + QR code

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 4: USER SENDS PAYMENT                                        │
└─────────────────────────────────────────────────────────────────────┘
  [✅ WORKS] User sends 55 USDT to pay_address
  ↓
  [✅ WORKS] Frontend polls GET /api/payment/status?paymentId=5847123456
    - Every 5 seconds
    - Displays status: pending → confirming → paid
  ↓
  NOWPayments detects payment on blockchain
  ↓
  NOWPayments sends webhook to: https://domain.com/api/payment/webhook

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 5: PAYMENT WEBHOOK (CRITICAL FAILURE POINT)                  │
└─────────────────────────────────────────────────────────────────────┘
  File: frontend/app/api/payment/webhook/route.ts
  ↓
  [✅ WORKS] Receive webhook from NOWPayments:
    {
      payment_id: "5847123456",
      payment_status: "finished",
      order_id: "HQADZ-...",
      actually_paid: "55.00"
    }
  ↓
  [✅ WORKS] Query payments table by provider_payment_id
  ↓
  [✅ WORKS] Update payment status to 'COMPLETED'
  ↓
  [❌ FAILS] Line 73: const order = await getOrderById(payment.order_id);
    ERROR: No order record exists with this ID
    - payment.order_id is just the NOWPayments order string
    - orders table doesn't have this record
  ↓
  [❌ FAILS] Line 74: const product = await getProductById(order.product_id);
    ERROR: order is undefined, crashes
  ↓
  [❌ FAILS] Lines 81-91: autoAssignSessions() never called
  ↓
  [❌ FAILS] Lines 97-106: createAdbot() never called
  ↓
  [❌ FAILS] User never gets bot
  ↓
  [⚠️ NO RETRY] Webhook returns 500 error to NOWPayments
    - NOWPayments may retry, but will fail again

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 6: USER DASHBOARD (NO BOT ASSIGNED)                          │
└─────────────────────────────────────────────────────────────────────┘
  File: frontend/app/dashboard/page.tsx
  ↓
  [✅ WORKS] User logs in with access_code
  ↓
  [✅ WORKS] JWT issued by backend
  ↓
  [✅ WORKS] Dashboard renders
  ↓
  GET /api/user/stats
    ↓
    [⚠️ EMPTY] Returns: { messagesSent: 0, status: 'inactive' }
    - Because no bot was created
  ↓
  GET /api/user/status
    ↓
    [⚠️ EMPTY] Returns: { accountBanned: false, notificationCount: 0 }
  ↓
  [❌ USER SEES] No active bot, no sessions, no configuration
  ↓
  User has paid $55 but received nothing
```

---

## 🔍 DATA FLOW DIAGRAM (TEXTUAL)

```
┌─────────────────────────────────────────────────────────────────────┐
│ CURRENT REALITY                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  FRONTEND PRICING          FRONTEND PAYMENT          DATABASE      │
│  ┌────────────┐           ┌─────────────┐          ┌──────────┐   │
│  │ Bronze $30 │──click──▶ │ plan_name:  │─store──▶ │ payments │   │
│  │ Silver $55 │           │ "Silver"    │          │ table    │   │
│  │ Gold $80   │           │ (string)    │          └──────────┘   │
│  └────────────┘           └─────────────┘                 │        │
│                                  │                         │        │
│                                  │                         │        │
│                           ┌──────▼─────────┐              │        │
│                           │  NOWPayments   │              │        │
│                           │    Webhook     │              │        │
│                           └──────┬─────────┘              │        │
│                                  │                         │        │
│                                  │                         │        │
│                           ┌──────▼─────────┐              │        │
│                           │ getOrderById() │◀─────────────┘        │
│                           │   ❌ FAILS     │                        │
│                           └────────────────┘                        │
│                                                                     │
│  NO CONNECTION TO:                                                 │
│  - products table (sessions_count, interval)                       │
│  - orders table                                                    │
│  - adbots table                                                    │
│  - sessions table (assignment)                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ EXPECTED ARCHITECTURE                                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  FRONTEND PRICING          FRONTEND PAYMENT          DATABASE      │
│  ┌────────────┐           ┌─────────────┐          ┌──────────┐   │
│  │ Bronze $30 │──lookup─▶ │ product_id: │─store──▶ │ orders   │   │
│  │ product_id │           │ uuid-123    │          │ table    │   │
│  │ uuid-123   │           │             │          └────┬─────┘   │
│  └────────────┘           └─────────────┘               │         │
│       ▲                          │                       │         │
│       │                          │                       │         │
│       │                   ┌──────▼─────────┐            │         │
│  ┌────┴────────┐          │  NOWPayments   │            │         │
│  │  products   │          │    Webhook     │            │         │
│  │  table      │          └──────┬─────────┘            │         │
│  │             │                 │                       │         │
│  │ sessions:2  │          ┌──────▼─────────┐            │         │
│  │ interval:   │          │ getOrderById() │◀───────────┘         │
│  │ 1800 sec    │          │   ✅ WORKS     │                      │
│  └─────────────┘          └──────┬─────────┘                      │
│                                  │                                 │
│                           ┌──────▼──────────┐                     │
│                           │ getProductById()│◀───────────┐        │
│                           │   ✅ WORKS      │            │        │
│                           └──────┬──────────┘            │        │
│                                  │                        │        │
│                           ┌──────▼─────────┐       ┌─────┴────┐  │
│                           │ autoAssignSessions     │ sessions │  │
│                           │ (count=2)      │──────▶│ table    │  │
│                           └──────┬─────────┘       └──────────┘  │
│                                  │                                │
│                           ┌──────▼─────────┐                     │
│                           │ createAdbot()  │                     │
│                           │ interval:1800  │──────▶ adbots table │
│                           └────────────────┘                     │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## 🔐 SECURITY AUDIT

### ✅ SECURE

1. **JWT Authentication** (`backend/api/bot_control.py`)
   - ✅ User ID extracted from JWT, never from headers
   - ✅ JWT signature verified with secret
   - ✅ No trust in `X-User-Id` header

2. **Email Validation** (`frontend/app/checkout/page.tsx`)
   - ✅ Regex validation before payment
   - ✅ Prevents invalid email submissions

3. **Payment Uniqueness** (NOWPayments)
   - ✅ Unique `payment_id` from NOWPayments
   - ✅ Order ID includes timestamp + random string

### ⚠️ RISKS

1. **No Webhook Signature Verification** (`webhook/route.ts` line 22)
   ```typescript
   // const signature = request.headers.get('x-nowpayments-sig');
   // Verify signature here if needed ← ⚠️ COMMENTED OUT
   ```
   **Risk:** Anyone can send fake webhooks to assign bots

2. **No Rate Limiting on Payment Creation**
   **Risk:** User could spam payment creation endpoint

3. **No Idempotency Key**
   **Risk:** Duplicate payment processing on webhook retry

4. **Plan Status Not Enforced in Dashboard**
   - Dashboard checks localStorage token
   - But doesn't verify `plan_status === 'active'` server-side

---

## 📊 COMPARISON: FRONTEND PRICING vs DATABASE PRODUCTS

### Frontend Hardcoded Plans
**File:** `frontend/components/ui/pricing-component.tsx`

| Plan Name | Price | Sessions | Interval | Type       |
|-----------|-------|----------|----------|------------|
| Bronze    | $30   | 1        | 1 hour   | starter    |
| Silver    | $55   | 2        | 30 min   | starter    |
| Gold      | $80   | 3        | 20 min   | starter    |
| Diamond   | $160  | 6        | 10 min   | starter    |
| Basic     | $199  | 3        | 15 min   | enterprise |
| Pro       | $450  | 7        | 7 min    | enterprise |
| Elite     | $899  | 15       | 2 min    | enterprise |

### Database Products Table
**File:** `supabase/migrations/001_complete_schema.sql` (Lines 365-374)

| Product Name        | Price  | Sessions | Interval (sec) | Type       |
|---------------------|--------|----------|----------------|------------|
| Starter Basic       | $20    | 1        | 1800 (30 min)  | STARTER    |
| Starter Standard    | $40    | 2        | 1200 (20 min)  | STARTER    |
| Starter Premium     | $80    | 3        | 900 (15 min)   | STARTER    |
| Starter Diamond     | $160   | 6        | 600 (10 min)   | STARTER    |
| Enterprise Basic    | $199   | 3        | 900 (15 min)   | ENTERPRISE |
| Enterprise Pro      | $450   | 7        | 420 (7 min)    | ENTERPRISE |
| Enterprise Elite    | $899   | 15       | 120 (2 min)    | ENTERPRISE |

### 🔥 CRITICAL MISMATCHES

1. **Name Mismatch:**
   - Frontend: "Bronze", "Silver", "Gold"
   - Database: "Starter Basic", "Starter Standard", "Starter Premium"
   - ❌ No way to map "Silver" → "Starter Standard"

2. **Price Mismatch:**
   - Frontend Bronze: $30
   - Database Starter Basic: $20
   - ❌ $10 difference

3. **Interval Mismatch:**
   - Frontend Bronze: "1 hour" (display only)
   - Database Starter Basic: 1800 seconds (30 min)
   - ❌ Different values

4. **No Mapping Table:**
   - ❌ No table to map frontend plan names to database product IDs

---

## 🎯 ROOT CAUSE ANALYSIS

The system was **partially migrated** from a simple architecture to a complex e-commerce architecture, but the migration was **never completed**.

### Evidence:

1. **Two Database Schemas Exist:**
   - `frontend/supabase/schema.sql` (simple, 192 lines)
   - `supabase/migrations/001_complete_schema.sql` (full, 516 lines)

2. **Two Payment Creation Systems:**
   - `frontend/lib/db.ts` - uses simple schema (payments table only)
   - `frontend/lib/queries.ts` - uses full schema (orders, products, adbots)

3. **Webhook Uses Wrong System:**
   - Webhook imports from `queries.ts` (full schema)
   - But database uses simple schema
   - Result: Table not found errors

### Timeline Reconstruction:

```
Phase 1: Simple System Built
  - Simple schema with just users, payments, bots
  - Hardcoded plans in frontend
  - Working for initial launch

Phase 2: E-commerce System Designed
  - Full schema with products, orders, adbots, sessions
  - Migration file created (001_complete_schema.sql)
  - queries.ts updated to use new tables

Phase 3: Migration Abandoned Mid-Flight ❌
  - New schema NOT applied to database
  - Webhook updated to use queries.ts
  - But database still running old schema
  - Payment creation still uses old db.ts
  - RESULT: BROKEN SYSTEM
```

---

## 🛠️ CONCRETE RECOMMENDATIONS

### **OPTION A: QUICK FIX (Use Simple Schema) - 2-4 hours**

Keep existing simple schema, bridge the gap with minimal changes.

#### Step 1: Extend Simple Schema
**File:** `frontend/supabase/schema.sql`

Add columns to store plan configuration:
```sql
ALTER TABLE payments ADD COLUMN sessions_count INTEGER;
ALTER TABLE payments ADD COLUMN posting_interval_seconds INTEGER;
ALTER TABLE payments ADD COLUMN validity_days INTEGER DEFAULT 30;

ALTER TABLE users ADD COLUMN sessions_count INTEGER;
ALTER TABLE users ADD COLUMN posting_interval_seconds INTEGER;
ALTER TABLE users ADD COLUMN plan_expires_at TIMESTAMPTZ;
```

#### Step 2: Create Plan Mapping
**File:** `frontend/lib/plan-config.ts` (NEW FILE)

```typescript
export const PLAN_CONFIG = {
  // Starter Plans
  "Bronze": { sessions: 1, interval: 3600, price: 30, days: 30 },
  "Silver": { sessions: 2, interval: 1800, price: 55, days: 30 },
  "Gold": { sessions: 3, interval: 1200, price: 80, days: 30 },
  "Diamond": { sessions: 6, interval: 600, price: 160, days: 30 },
  
  // Enterprise Plans
  "Basic": { sessions: 3, interval: 900, price: 199, days: 30 },
  "Pro": { sessions: 7, interval: 420, price: 450, days: 30 },
  "Elite": { sessions: 15, interval: 120, price: 899, days: 30 },
};

export function getPlanConfig(planName: string) {
  return PLAN_CONFIG[planName] || { sessions: 1, interval: 3600, price: 30, days: 30 };
}
```

#### Step 3: Update Payment Creation
**File:** `frontend/app/api/payment/create/route.ts`

```typescript
import { getPlanConfig } from '@/lib/plan-config';

export async function POST(request: NextRequest) {
  const { email, planName, planType, amount, currency } = body;
  
  // Get plan configuration
  const planConfig = getPlanConfig(planName);
  
  // ... NOWPayments call ...
  
  // Store payment with plan config
  const payment = await createPayment({
    payment_id: paymentData.payment_id,
    email,
    plan_name: planName,
    plan_type: planType,
    amount: parseFloat(amount),
    currency: currency || 'USD',
    user_id: user?.id,
    order_id: paymentPayload.order_id,
    
    // NEW: Store plan configuration
    sessions_count: planConfig.sessions,
    posting_interval_seconds: planConfig.interval,
    validity_days: planConfig.days,
  });
}
```

#### Step 4: Rewrite Webhook (Simplified)
**File:** `frontend/app/api/payment/webhook/route.ts`

```typescript
import { supabase } from '@/lib/supabase';
import { autoAssignSessions } from '@/lib/stock';

export async function POST(request: NextRequest) {
  const { payment_id, payment_status } = await request.json();
  
  // Get payment by payment_id
  const { data: payment } = await supabase
    .from('payments')
    .select('*')
    .eq('payment_id', payment_id)
    .single();
  
  if (!payment || payment.payment_status === 'paid') {
    return NextResponse.json({ received: true }); // Already processed
  }
  
  if (payment_status === 'finished' || payment_status === 'confirmed') {
    // Update payment status
    await supabase
      .from('payments')
      .update({ payment_status: 'paid', completed_at: new Date().toISOString() })
      .eq('payment_id', payment_id);
    
    // Update user plan status
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (payment.validity_days || 30));
    
    await supabase
      .from('users')
      .update({
        plan_status: 'active',
        sessions_count: payment.sessions_count,
        posting_interval_seconds: payment.posting_interval_seconds,
        plan_expires_at: expiresAt.toISOString(),
      })
      .eq('id', payment.user_id);
    
    // Call backend to register user and assign sessions
    const backendRegisterUrl = process.env.BACKEND_URL + '/api/register';
    await fetch(backendRegisterUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: payment.user_id,
        email: payment.email,
        plan_type: payment.plan_type,
        sessions_count: payment.sessions_count,
        posting_interval_seconds: payment.posting_interval_seconds,
      }),
    });
    
    // Send success email
    await sendPaymentSuccessEmail({
      email: payment.email,
      planName: payment.plan_name,
      accessCode: user.access_code,
    });
  }
  
  return NextResponse.json({ received: true });
}
```

#### Step 5: Update Backend Registration
**File:** `backend/api/bot_control.py`

Accept plan configuration in `/register` endpoint (lines 249-306):
```python
@router.post("/register")
async def register_user(request: RegisterUserRequest) -> Dict[str, Any]:
    user_id = request.user_id or str(uuid.uuid4())
    
    user_defaults = {
        "assigned_sessions": [],
        "api_pairs": [],
        "groups": [],
        "post_type": "link",
        "post_content": "",
        "bot_status": "stopped",
        
        # NEW: Accept from frontend
        "sessions_count": request.sessions_count,
        "delay_between_cycles": request.posting_interval_seconds,
        "plan_type": request.plan_type,
    }
    
    update_user_data(user_id, user_defaults)
    
    return {"status": "registered", "user_id": user_id}
```

---

### **OPTION B: FULL MIGRATION (Use Full Schema) - 1-2 days**

Properly migrate to the full e-commerce schema.

#### Step 1: Apply Full Schema
Run in Supabase SQL Editor:
```sql
-- File: supabase/migrations/001_complete_schema.sql
-- Apply entire schema (516 lines)
```

#### Step 2: Seed Products
Manually insert products or create admin panel to manage products.

#### Step 3: Update Payment Creation
Look up product by name, create order, link payment to order.

#### Step 4: Update Webhook
Use existing code (it's already written for full schema).

#### Step 5: Sync Frontend Pricing
Query products table instead of hardcoding.

**Pros:**
- ✅ Proper architecture
- ✅ Scalable for future features
- ✅ Admin can manage products

**Cons:**
- ❌ More complex
- ❌ Requires data migration if existing payments exist

---

### **OPTION C: HYBRID (Recommended) - 4-8 hours**

Use full schema but simplify webhook to avoid over-engineering.

1. Apply full schema
2. Create products manually to match frontend (7 products)
3. Update pricing component to query products API
4. Update payment creation to:
   - Look up product by name
   - Create order record
   - Create payment record linked to order
5. Simplify webhook:
   - Get order by payment.order_id
   - Get product by order.product_id
   - Assign sessions (sessions_count from product)
   - Call backend `/register` with config
   - Update user plan_status to active

**Pros:**
- ✅ Uses proper schema
- ✅ Less complex than full Option B
- ✅ Admin can add products later

**Cons:**
- ❌ Initial manual product setup required

---

## 🚨 EDGE CASES & FAILURE MODES

### 1. **Session Stock Exhaustion**
**Scenario:** 10 unused sessions, user buys 15-session plan

**Current Behavior:**
- ❌ Webhook crashes (can't assign 15 sessions)
- ❌ User charged but no bot assigned

**Expected Behavior:**
- ✅ Check stock before payment creation
- ✅ Block purchase if insufficient stock
- ✅ Or assign partial + notify admin

**Fix:**
Add to `create/route.ts`:
```typescript
const requiredSessions = getPlanConfig(planName).sessions;
const stockCheck = await hasEnoughStock(requiredSessions);

if (!stockCheck) {
  return NextResponse.json(
    { error: 'Insufficient stock. Please contact support.' },
    { status: 409 }
  );
}
```

---

### 2. **User Refreshes Payment Page**
**Scenario:** User creates payment, refreshes page

**Current Behavior:**
- ⚠️ Creates duplicate payment invoice with NOWPayments
- ⚠️ User sees two payment addresses

**Expected Behavior:**
- ✅ Check if pending payment exists
- ✅ Show existing payment instead of creating new one

**Fix:**
Check for existing pending payments before creating new one.

---

### 3. **Backend Restart During Payment**
**Scenario:** Webhook fires while backend is down

**Current Behavior:**
- ❌ Webhook can't call backend `/register`
- ❌ User data not created in backend

**Expected Behavior:**
- ✅ Queue mechanism (e.g., database flag)
- ✅ Backend checks on startup for pending registrations

---

### 4. **Underpayment or Overpayment**
**Scenario:** User sends $50 instead of $55

**Current Behavior:**
- ⚠️ NOWPayments status: `partially_paid`
- ⚠️ Webhook doesn't handle this status

**Expected Behavior:**
- ✅ Handle `partially_paid` status
- ✅ Notify user to send remainder
- ✅ Or refund partial payment

**Fix:**
Add to webhook:
```typescript
if (payment_status === 'partially_paid') {
  // Notify user, don't assign bot
  await createNotification({
    user_id: payment.user_id,
    type: 'WARNING',
    title: 'Partial Payment Received',
    message: 'Please complete your payment to activate your bot.',
  });
}
```

---

### 5. **Expired Invoice**
**Scenario:** User creates payment but doesn't pay within 24 hours

**Current Behavior:**
- ⚠️ Payment record stays as `waiting` forever
- ⚠️ No cleanup

**Expected Behavior:**
- ✅ NOWPayments sends `expired` webhook
- ✅ Update payment status to `expired`
- ✅ User can create new payment

---

### 6. **Duplicate Webhook Delivery**
**Scenario:** NOWPayments sends webhook twice

**Current Behavior:**
- ❌ Assigns sessions twice
- ❌ Creates duplicate bot

**Expected Behavior:**
- ✅ Check if already processed (idempotency)

**Fix:**
```typescript
if (payment.payment_status === 'paid') {
  return NextResponse.json({ received: true, already_processed: true });
}
```

---

## 📝 SUMMARY FOR NEW BACKEND ENGINEER

### What You Need to Know

1. **The system is broken right now.**
   - Users can pay, but won't receive bots
   - Webhook crashes because database schema mismatch

2. **There are two codebases living together:**
   - Simple system (payments → users → bots)
   - Complex system (products → orders → adbots → sessions)
   - Frontend uses simple, backend expects complex

3. **Frontend pricing is hardcoded.**
   - No dynamic product fetching
   - No connection to database products
   - Must map plan names manually

4. **To fix:**
   - Choose Option A (quick), B (proper), or C (hybrid)
   - Add plan configuration mapping
   - Rewrite webhook to work with current schema
   - Test end-to-end before deploying

5. **After fix, test these scenarios:**
   - [ ] User buys Bronze plan → receives 1 session, 60-min interval
   - [ ] User buys Silver plan → receives 2 sessions, 30-min interval
   - [ ] Payment expires → order marked expired
   - [ ] Insufficient stock → purchase blocked
   - [ ] Webhook fires twice → only processes once
   - [ ] User logs in → sees active bot in dashboard
   - [ ] Plan expires after 30 days → bot stops

---

## 🎯 FINAL VERDICT

| Component | Status | Note |
|-----------|--------|------|
| Frontend Pricing UI | ✅ WORKS | But hardcoded |
| Checkout Flow | ✅ WORKS | Email, crypto selection |
| NOWPayments API | ✅ WORKS | Payment creation, status polling |
| Payment Creation | ⚠️ PARTIAL | Creates payment but missing plan config |
| Payment Webhook | ❌ BROKEN | Can't find order/product, crashes |
| Bot Assignment | ❌ NEVER RUNS | Webhook fails before this |
| Session Assignment | ✅ CODE EXISTS | But never called |
| Dashboard | ⚠️ WORKS | But shows empty state (no bot) |
| Backend Bot Engine | ✅ WORKS | But user never gets created |
| JWT Auth | ✅ SECURE | Properly implemented |

### Critical Path to Fix:
1. Add plan configuration mapping (1 hour)
2. Extend payments table with sessions_count + interval (30 min)
3. Rewrite webhook to use simple schema (2 hours)
4. Add backend `/register` call from webhook (30 min)
5. Test end-to-end (1 hour)

**Total Time: ~5 hours to working state**

---

**Generated:** January 6, 2026  
**Auditor:** Senior Full-Stack Engineer  
**Status:** COMPLETE  
**Next Step:** Choose Option A, B, or C and begin implementation






