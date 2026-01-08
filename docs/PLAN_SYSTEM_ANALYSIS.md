# PLAN SYSTEM ANALYSIS & IMPLEMENTATION PLAN

## EXECUTIVE SUMMARY

This document analyzes the current codebase and outlines the required changes to implement a plan-based system with **Starter** and **Enterprise** plans. The key principle: **NO hardcoded limits** - only execution flow and group source differ between plans.

---

## 1. CURRENT STATE ANALYSIS

### 1.1 Plan Types (Already Exist)
- ✅ **Supabase Schema**: `plan_type` field exists (`'starter' | 'enterprise'`)
- ✅ **Frontend**: Plan types are used in checkout, pricing components
- ✅ **Backend**: Plan type is stored in `users.json` via `plan_status` and `plan_limits`

### 1.2 Current Limitations (MUST BE REMOVED)
- ❌ **Hardcoded Limits in Frontend**: 
  - `frontend/lib/backend-api.ts:31,73` - `max_sessions: user.plan_type === 'enterprise' ? 3 : 1`
  - This enforces a hard limit based on plan type
- ❌ **Backend Plan Limits**: 
  - `backend/api/bot_control.py:144-147` - Uses `plan_limits.get("max_sessions")` to determine session count
  - This enforces a hard limit from JWT claims

### 1.3 Current Group Management
- **Location**: Groups stored per-user in `backend/data/users.json` (`groups: []`)
- **Global File**: `backend/Adbot/groups.txt` exists but is used by old AdBot (not multi-user system)
- **API Routes**: `backend/api/routes/groups.py` manages groups via API
- **Worker**: `backend/bot/worker.py:39` loads groups from `user_data.get("groups", [])`

### 1.4 Current Execution Flow
- **Single Flow**: All users use the same execution path
- **Scheduler**: `backend/bot/scheduler.py` calls `execute_user_cycle()` for all users
- **Worker**: `backend/bot/worker.py:20` - `execute_user_cycle()` is the single entry point
- **Engine**: `backend/bot/engine.py:195` - `execute_forwarding_cycle()` is the shared forwarding logic

### 1.5 Current Data Storage
- **Supabase**: Stores `plan_type`, `plan_status` (no plan metadata like sessions_allocated, interval)
- **Backend users.json**: Stores `plan_status`, `plan_limits` (but limits are hardcoded)
- **No Plan Metadata**: No storage for `sessions_allocated`, `interval_seconds`, `group_list_type`

---

## 2. REQUIRED CHANGES

### 2.1 Frontend Changes

#### A. Remove Hardcoded Limits
**Files:**
- `frontend/lib/backend-api.ts` (Lines 29-32, 72-74)

**Current Code:**
```typescript
planLimits = {
  max_sessions: user.plan_type === 'enterprise' ? 3 : 1,
};
```

**Change:** Remove this hardcoding. Plan limits should come from order/payment data, not plan type.

#### B. Add Plan Metadata to Supabase Schema
**File:** `frontend/supabase/schema.sql`

**Add Columns to `payments` table:**
```sql
ALTER TABLE payments ADD COLUMN IF NOT EXISTS sessions_allocated INTEGER;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS interval_seconds INTEGER;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS group_list_type TEXT CHECK (group_list_type IN ('starter', 'enterprise'));
```

**Add Columns to `users` table (for current plan metadata):**
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS sessions_allocated INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS interval_seconds INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS group_list_type TEXT CHECK (group_list_type IN ('starter', 'enterprise'));
```

#### C. Update Payment Creation
**File:** `frontend/app/api/payment/create/route.ts`

**Add to request body:**
- `sessions_allocated`: number (from frontend form/input)
- `interval_seconds`: number (from frontend form/input)
- `group_list_type`: 'starter' | 'enterprise' (derived from `planType`)

**Store in payment record:**
```typescript
await createPayment({
  // ... existing fields
  sessions_allocated: body.sessions_allocated,
  interval_seconds: body.interval_seconds,
  group_list_type: planType, // Same as plan_type
});
```

#### D. Update Payment Webhook
**File:** `frontend/app/api/payment/webhook/route.ts`

**On payment success, update user with plan metadata:**
```typescript
await updateUser(user.id, {
  plan_status: 'active',
  plan_type: payment.plan_type,
  sessions_allocated: payment.sessions_allocated,
  interval_seconds: payment.interval_seconds,
  group_list_type: payment.group_list_type,
});
```

**Send plan metadata to backend:**
```typescript
await backendApi.registerUser(user.id, user.email, {
  plan_type: payment.plan_type,
  sessions_allocated: payment.sessions_allocated,
  interval_seconds: payment.interval_seconds,
  group_list_type: payment.group_list_type,
});
```

#### E. Update Backend API Client
**File:** `frontend/lib/backend-api.ts`

**Modify `registerUser` to accept plan metadata:**
```typescript
registerUser: async (userId: string, email?: string, planMetadata?: {
  plan_type?: string;
  sessions_allocated?: number;
  interval_seconds?: number;
  group_list_type?: string;
}) => {
  // Fetch user plan info
  const user = await getUserById(userId);
  
  // Use plan metadata from parameter, fallback to user data
  const planType = planMetadata?.plan_type || user?.plan_type;
  const sessionsAllocated = planMetadata?.sessions_allocated || user?.sessions_allocated;
  const intervalSeconds = planMetadata?.interval_seconds || user?.interval_seconds;
  const groupListType = planMetadata?.group_list_type || user?.group_list_type;
  
  return fetchBackend(
    '/api/bot/register-user',
    {
      method: 'POST',
      body: JSON.stringify({ 
        email,
        plan_type: planType,
        sessions_allocated: sessionsAllocated,
        interval_seconds: intervalSeconds,
        group_list_type: groupListType,
      }),
    },
    userId
  );
}
```

**Remove hardcoded `planLimits` from JWT generation:**
```typescript
// REMOVE THIS:
planLimits = {
  max_sessions: user.plan_type === 'enterprise' ? 3 : 1,
};

// JWT should only include plan_status, not plan_limits
```

#### F. Update Database Types
**File:** `frontend/lib/supabase.ts`

**Add to `User` interface:**
```typescript
export interface User {
  // ... existing fields
  sessions_allocated?: number | null;
  interval_seconds?: number | null;
  group_list_type?: 'starter' | 'enterprise' | null;
}
```

**Add to `Payment` interface:**
```typescript
export interface Payment {
  // ... existing fields
  sessions_allocated?: number | null;
  interval_seconds?: number | null;
  group_list_type?: 'starter' | 'enterprise' | null;
}
```

---

### 2.2 Backend Changes

#### A. Remove Hardcoded Limits
**File:** `backend/api/bot_control.py`

**Current Code (Lines 142-147):**
```python
num_sessions = 1
if plan_limits and isinstance(plan_limits, dict):
    max_sessions = plan_limits.get("max_sessions")
    if isinstance(max_sessions, int) and max_sessions > 0:
        num_sessions = max_sessions
```

**Change:** Use `sessions_allocated` from user data instead:
```python
# Get sessions_allocated from user data (set during registration)
user_data = get_user_data(user_id)
sessions_allocated = user_data.get("sessions_allocated")
if sessions_allocated and isinstance(sessions_allocated, int) and sessions_allocated > 0:
    num_sessions = sessions_allocated
else:
    # Fallback: default to 1 if not set
    num_sessions = 1
```

#### B. Add Plan Metadata to users.json
**File:** `backend/bot/data_manager.py`

**Update `update_user_data` default structure (Line 191-200):**
```python
if user_id not in users:
    users[user_id] = {
        "assigned_sessions": [],
        "api_pairs": [],
        "groups": [],
        "post_type": "link",
        "post_content": "",
        "bot_status": "stopped",
        "delay_between_posts": 5,
        "delay_between_cycles": 300,
        # NEW FIELDS:
        "plan_type": None,  # 'starter' | 'enterprise'
        "sessions_allocated": None,  # number
        "interval_seconds": None,  # number (overrides delay_between_cycles)
        "execution_flow": None,  # 'starter' | 'enterprise' (derived from plan_type)
        "group_list_type": None,  # 'starter' | 'enterprise'
    }
```

#### C. Update User Registration
**File:** `backend/api/bot_control.py`

**Update `RegisterUserRequest` model (Line 29-34):**
```python
class RegisterUserRequest(BaseModel):
    email: Optional[str] = None
    plan_status: Optional[str] = None
    plan_type: Optional[str] = None  # NEW
    sessions_allocated: Optional[int] = None  # NEW
    interval_seconds: Optional[int] = None  # NEW
    group_list_type: Optional[str] = None  # NEW
    # REMOVE: plan_limits: Optional[Dict[str, Any]] = None
```

**Update `register_user` function (Line 249-306):**
```python
# Store plan info if provided
if request and request.plan_type:
    user_defaults["plan_type"] = request.plan_type
if request and request.sessions_allocated:
    user_defaults["sessions_allocated"] = request.sessions_allocated
if request and request.interval_seconds:
    user_defaults["interval_seconds"] = request.interval_seconds
    # Also update delay_between_cycles if interval_seconds is provided
    user_defaults["delay_between_cycles"] = request.interval_seconds
if request and request.group_list_type:
    user_defaults["group_list_type"] = request.group_list_type

# Derive execution_flow from plan_type
if request and request.plan_type:
    user_defaults["execution_flow"] = request.plan_type  # 'starter' or 'enterprise'
```

#### D. Create Separate Group Sources
**Files to Create:**
- `backend/Adbot/groups/starter_groups.txt`
- `backend/Adbot/groups/enterprise_groups.txt`

**Note:** These files should be manually populated by admin. The system will load groups from the appropriate file based on `group_list_type`.

#### E. Modify Worker to Load Groups Based on Plan
**File:** `backend/bot/worker.py`

**Current Code (Line 39):**
```python
groups = user_data.get("groups", [])
```

**Change:** Load groups from file if `groups` is empty, based on `group_list_type`:
```python
groups = user_data.get("groups", [])

# If groups list is empty, load from plan-specific file
if not groups:
    group_list_type = user_data.get("group_list_type")
    if group_list_type:
        groups = load_groups_from_file(group_list_type)
    else:
        # Fallback: try to derive from plan_type
        plan_type = user_data.get("plan_type")
        if plan_type:
            groups = load_groups_from_file(plan_type)
```

**Add helper function:**
```python
def load_groups_from_file(group_list_type: str) -> List[str]:
    """Load groups from starter_groups.txt or enterprise_groups.txt"""
    groups_file = Path(__file__).parent.parent.parent / "Adbot" / "groups" / f"{group_list_type}_groups.txt"
    
    if not groups_file.exists():
        return []
    
    try:
        with open(groups_file, "r", encoding="utf-8") as f:
            groups = [line.strip() for line in f if line.strip() and not line.strip().startswith("#")]
        return groups
    except Exception as e:
        print(f"ERROR: Failed to load groups from {groups_file}: {e}")
        return []
```

#### F. Modify Scheduler to Use User-Specific Interval
**File:** `backend/bot/scheduler.py`

**Current Code (Line 151-156):**
```python
await execute_user_cycle(
    user_id, 
    is_running, 
    self.delay_between_cycles,  # Global delay
    self.user_semaphores.get(user_id)
)
```

**Change:** Use user-specific `interval_seconds` if available:
```python
# Get user-specific interval
user_data = get_user_data(user_id)
user_interval = user_data.get("interval_seconds")
if user_interval and isinstance(user_interval, int) and user_interval > 0:
    delay_between_cycles = user_interval
else:
    delay_between_cycles = self.delay_between_cycles  # Global default

await execute_user_cycle(
    user_id, 
    is_running, 
    delay_between_cycles,  # User-specific delay
    self.user_semaphores.get(user_id)
)
```

**Also update `next_run_at` calculation (Line 49):**
```python
# Use user-specific interval for next run
user_data = get_user_data(user_id)
user_interval = user_data.get("interval_seconds")
if user_interval and isinstance(user_interval, int) and user_interval > 0:
    delay = user_interval
else:
    delay = self.delay_between_cycles

self.next_run_at[user_id] = now + timedelta(seconds=delay)
```

#### G. Add Execution Flow Routing (Optional - Can Share Logic)
**File:** `backend/bot/worker.py`

**Current:** Single execution flow via `execute_user_cycle()`

**Option 1 (Recommended):** Keep single flow, but load groups based on plan
- Already handled in step E above
- No code duplication needed

**Option 2:** Separate functions if execution logic differs
- Create `execute_starter_cycle()` and `execute_enterprise_cycle()`
- Route based on `execution_flow` field
- Share common logic via `execute_forwarding_cycle()` in `engine.py`

**Decision:** Since user specified "Different execution flow", we should implement Option 2, but keep shared logic in `engine.py`. The routing will be minimal - just different entry points that call the same underlying functions.

**Implementation:**
```python
async def execute_user_cycle(
    user_id: str,
    is_running: Callable[[], bool],
    delay_between_cycles: int = 300,
    user_semaphore: Optional[asyncio.Semaphore] = None
) -> Dict[str, Any]:
    """Execute one cycle for a user - routes to starter or enterprise flow"""
    user_data = get_user_data(user_id)
    if not user_data:
        return {"error": "User data not found"}
    
    execution_flow = user_data.get("execution_flow")
    
    if execution_flow == "enterprise":
        return await execute_enterprise_cycle(user_id, is_running, delay_between_cycles, user_semaphore)
    else:
        # Default to starter flow
        return await execute_starter_cycle(user_id, is_running, delay_between_cycles, user_semaphore)


async def execute_starter_cycle(
    user_id: str,
    is_running: Callable[[], bool],
    delay_between_cycles: int = 300,
    user_semaphore: Optional[asyncio.Semaphore] = None
) -> Dict[str, Any]:
    """Starter plan execution flow"""
    # Current implementation from execute_user_cycle
    # ... (existing code)


async def execute_enterprise_cycle(
    user_id: str,
    is_running: Callable[[], bool],
    delay_between_cycles: int = 300,
    user_semaphore: Optional[asyncio.Semaphore] = None
) -> Dict[str, Any]:
    """Enterprise plan execution flow"""
    # For now, same as starter (can be customized later)
    # ... (same code as starter, or different logic if needed)
```

**Note:** If execution flows are identical, we can keep a single function and just route based on group source. The user said "Different execution flow" but didn't specify what differs. We'll implement routing but keep logic shared until differences are defined.

---

## 3. ARCHITECTURE FLOW

### 3.1 Order Creation Flow
```
Frontend Checkout
  ↓
User selects plan (starter/enterprise)
  ↓
User enters: sessions_allocated, interval_seconds (or defaults)
  ↓
POST /api/payment/create
  ↓
Store in Supabase payments table:
  - plan_type
  - sessions_allocated
  - interval_seconds
  - group_list_type (= plan_type)
  ↓
NowPayments payment created
  ↓
Payment webhook received
  ↓
Update user in Supabase:
  - plan_status = 'active'
  - plan_type
  - sessions_allocated
  - interval_seconds
  - group_list_type
  ↓
Call backendApi.registerUser() with plan metadata
  ↓
Backend stores in users.json:
  - plan_type
  - sessions_allocated
  - interval_seconds
  - execution_flow (= plan_type)
  - group_list_type
```

### 3.2 Bot Execution Flow
```
Scheduler checks active users
  ↓
For each user:
  - Get user_data from users.json
  - Check execution_flow ('starter' | 'enterprise')
  - Get interval_seconds (user-specific or global default)
  ↓
Route to execution function:
  - execute_starter_cycle() OR
  - execute_enterprise_cycle()
  ↓
Load groups:
  - If user_data.groups is populated → use it
  - Else → load from starter_groups.txt or enterprise_groups.txt
    based on group_list_type
  ↓
Execute forwarding cycle (shared logic in engine.py)
  ↓
Use sessions_allocated (not hardcoded limit) for session assignment
```

### 3.3 Group Source Selection
```
User starts bot
  ↓
Worker checks user_data.groups
  ↓
If empty:
  - Check group_list_type ('starter' | 'enterprise')
  - Load from backend/Adbot/groups/{group_list_type}_groups.txt
  - Store in user_data.groups (cache for performance)
  ↓
If populated:
  - Use existing groups (user can override via API)
```

---

## 4. FILES TO MODIFY

### Frontend (7 files)
1. ✅ `frontend/lib/backend-api.ts` - Remove hardcoded limits, add plan metadata
2. ✅ `frontend/app/api/payment/create/route.ts` - Accept and store plan metadata
3. ✅ `frontend/app/api/payment/webhook/route.ts` - Update user with plan metadata
4. ✅ `frontend/lib/supabase.ts` - Add new fields to TypeScript interfaces
5. ✅ `frontend/lib/db.ts` - Update database functions to handle new fields
6. ✅ `frontend/supabase/schema.sql` - Add new columns to tables
7. ✅ `frontend/lib/backend-jwt.ts` - Remove plan_limits from JWT (optional)

### Backend (5 files)
1. ✅ `backend/api/bot_control.py` - Remove hardcoded limits, accept plan metadata
2. ✅ `backend/bot/data_manager.py` - Add new fields to user data structure
3. ✅ `backend/bot/worker.py` - Load groups from plan-specific files, route execution flow
4. ✅ `backend/bot/scheduler.py` - Use user-specific interval_seconds
5. ✅ `backend/api/routes/groups.py` - (No changes needed - groups still managed via API)

### New Files (2 files)
1. ✅ `backend/Adbot/groups/starter_groups.txt` - Starter plan groups (manual creation)
2. ✅ `backend/Adbot/groups/enterprise_groups.txt` - Enterprise plan groups (manual creation)

---

## 5. NEW FIELDS ADDED

### Supabase Schema
**`payments` table:**
- `sessions_allocated` (INTEGER, nullable)
- `interval_seconds` (INTEGER, nullable)
- `group_list_type` (TEXT, 'starter' | 'enterprise', nullable)

**`users` table:**
- `sessions_allocated` (INTEGER, nullable)
- `interval_seconds` (INTEGER, nullable)
- `group_list_type` (TEXT, 'starter' | 'enterprise', nullable)

### Backend users.json
**Per-user object:**
- `plan_type` (string, 'starter' | 'enterprise' | null)
- `sessions_allocated` (integer | null)
- `interval_seconds` (integer | null)
- `execution_flow` (string, 'starter' | 'enterprise' | null) - derived from plan_type
- `group_list_type` (string, 'starter' | 'enterprise' | null)

---

## 6. EXECUTION FLOW DIFFERENCES

### Starter Plan
- **Group Source**: `backend/Adbot/groups/starter_groups.txt`
- **Execution Function**: `execute_starter_cycle()`
- **Shared Logic**: Uses `execute_forwarding_cycle()` from `engine.py`

### Enterprise Plan
- **Group Source**: `backend/Adbot/groups/enterprise_groups.txt`
- **Execution Function**: `execute_enterprise_cycle()`
- **Shared Logic**: Uses `execute_forwarding_cycle()` from `engine.py`

**Note:** Currently, both flows use the same underlying logic. If execution differences are needed later, they can be added to the respective cycle functions without affecting the shared `engine.py` code.

---

## 7. CONFIRMATION: NO HARD LIMITS

### ✅ Removed Hardcoded Limits
1. **Frontend**: Removed `max_sessions: user.plan_type === 'enterprise' ? 3 : 1`
2. **Backend**: Removed `plan_limits.get("max_sessions")` logic
3. **Session Assignment**: Now uses `sessions_allocated` from user data (set per order)
4. **Group Limits**: No group count limits (only validation for reasonable max: 1000)
5. **Interval**: Uses `interval_seconds` from user data (set per order)

### ✅ Dynamic Values
- `sessions_allocated`: Set per order, no plan-based assumption
- `interval_seconds`: Set per order, no plan-based assumption
- `group_list_type`: Determines which group file to load, not quantity limits

### ✅ No Plan-Based Blocking
- Starter plan can have 100 sessions if order specifies it
- Enterprise plan can have 1 session if order specifies it
- No code enforces "starter = small, enterprise = big"

---

## 8. QUESTIONS & CLARIFICATIONS

### Q1: Execution Flow Differences
**Question:** What specific differences should exist between Starter and Enterprise execution flows?

**Current Understanding:** 
- Both use same forwarding logic (`execute_forwarding_cycle()`)
- Only difference is group source (starter_groups.txt vs enterprise_groups.txt)
- Should we implement separate functions even if logic is identical?

**Recommendation:** Implement routing structure but keep logic shared until differences are defined.

### Q2: Group File Management
**Question:** Should groups be:
- A) Only loaded from files (starter_groups.txt / enterprise_groups.txt)
- B) User can override via API (current behavior - groups stored in users.json)
- C) Both (load from file if empty, allow API override)

**Recommendation:** Option C - Load from file if `user_data.groups` is empty, but allow API override for custom groups.

### Q3: Interval Override
**Question:** Should `interval_seconds`:
- A) Override global `delay_between_cycles` for that user only
- B) Be ignored if not set (use global default)
- C) Be required for all users

**Recommendation:** Option A - User-specific interval overrides global default.

### Q4: Plan Metadata Source
**Question:** Where should plan metadata (sessions_allocated, interval_seconds) come from?
- A) Frontend form input during checkout
- B) Backend defaults based on plan type
- C) Admin configuration

**Current Implementation:** Option A - Frontend sends these values during order creation.

---

## 9. IMPLEMENTATION CHECKLIST

### Phase 1: Database & Types
- [ ] Update Supabase schema (add columns)
- [ ] Update TypeScript interfaces
- [ ] Update database functions

### Phase 2: Frontend Changes
- [ ] Remove hardcoded limits from backend-api.ts
- [ ] Update payment creation to accept plan metadata
- [ ] Update payment webhook to store plan metadata
- [ ] Update backend API client to send plan metadata

### Phase 3: Backend Changes
- [ ] Remove hardcoded limits from bot_control.py
- [ ] Update data_manager.py user structure
- [ ] Update register_user to accept plan metadata
- [ ] Create group loading function
- [ ] Update worker to load groups from files
- [ ] Add execution flow routing (starter vs enterprise)
- [ ] Update scheduler to use user-specific intervals

### Phase 4: Group Files
- [ ] Create starter_groups.txt (manual)
- [ ] Create enterprise_groups.txt (manual)

### Phase 5: Testing
- [ ] Test order creation with plan metadata
- [ ] Test group loading from files
- [ ] Test execution flow routing
- [ ] Test user-specific intervals
- [ ] Verify no hard limits exist

---

## 10. FINAL VERDICT

✅ **Architecture is sound** - Plan-based system with no hard limits
✅ **Changes are minimal** - Mostly adding fields and routing logic
✅ **Backward compatible** - Existing users will work (with defaults)
✅ **Extensible** - Easy to add execution flow differences later

**Ready to implement?** Yes, pending clarification on execution flow differences (Q1).

---

**END OF ANALYSIS**

