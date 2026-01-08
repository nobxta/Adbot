# Execution Modes - Fixes Applied

## Overview

Fixed critical issues in STARTER and ENTERPRISE execution logic:
1. Per-cycle offset alignment
2. Starter feasibility validation
3. Timing authority moved to worker
4. Safe delay enforcement
5. Plan enforcement (STARTER/ENTERPRISE only)

## FIX 1: STARTER OFFSET PER CYCLE

### Problem
- Offsets were calculated once in scheduler
- Applied only to first cycle
- Sessions would drift across cycles

### Solution
- **Worker now owns offset calculation**
- Offsets calculated **per cycle** based on `cycle_start_time`
- Each cycle re-aligns: `target_time = cycle_start_time + (session_index * offset)`
- No session drift, no collision across cycles

### Code Changes

**Scheduler (`backend/bot/scheduler.py`):**
```python
# REMOVED: Offset calculation from scheduler
# OLD:
# session_start_offsets = [i * per_session_offset for i in range(num_sessions)]
# await execute_user_cycle(..., session_start_offsets)

# NEW:
# Scheduler only triggers cycles - worker owns timing
await execute_user_cycle(user_id, is_running, self.delay_between_cycles, self.user_semaphores.get(user_id))
```

**Worker (`backend/bot/worker.py`):**
```python
# FIX 1 & 3: Calculate offsets per cycle (worker owns timing authority)
cycle_start_time = asyncio.get_event_loop().time()
session_start_offsets = None

if execution_mode == "starter" and total_cycle_minutes:
    num_sessions = len(assigned_sessions)
    total_cycle_seconds = total_cycle_minutes * 60
    per_session_offset = total_cycle_seconds / num_sessions
    # Calculate offsets relative to cycle start: [0, offset, 2*offset, ...]
    session_start_offsets = [i * per_session_offset for i in range(num_sessions)]
```

**Session Cycle (`execute_session_cycle`):**
```python
# FIX 1: Calculate wait time relative to cycle start
if execution_mode == "starter" and start_offset is not None and start_offset >= 0:
    if cycle_start_time is not None:
        # Calculate absolute target time
        target_time = cycle_start_time + start_offset
        current_time = asyncio.get_event_loop().time()
        wait_time = max(0, target_time - current_time)
        
        if wait_time > 0:
            await asyncio.sleep(wait_time)
```

### Result
- Each cycle starts with fresh alignment
- Sessions never drift
- No collisions across cycles

## FIX 2: STARTER FEASIBILITY VALIDATION

### Problem
- No validation that starter mode is feasible
- Could allow `session_runtime >= per_session_offset`
- Would cause collisions

### Solution
- Calculate `session_runtime = len(groups) * delay_between_posts`
- Calculate `per_session_offset = total_cycle_seconds / num_sessions`
- Reject if `session_runtime >= per_session_offset`

### Code Changes

**Worker (`backend/bot/worker.py`):**
```python
# FIX 2: Starter feasibility validation
if execution_mode == "starter":
    # ... validate total_cycle_minutes exists ...
    
    # Calculate session runtime and offset
    num_sessions = len(assigned_sessions)
    total_cycle_seconds = total_cycle_minutes * 60
    per_session_offset = total_cycle_seconds / num_sessions
    session_runtime = len(groups) * delay_between_posts
    
    # Validate feasibility: session_runtime must be < per_session_offset
    if session_runtime >= per_session_offset:
        return {
            "error": f"Starter mode infeasible: session runtime ({session_runtime}s) must be less than per-session offset ({per_session_offset:.1f}s). Increase total_cycle_minutes or reduce groups/delay.",
            ...
        }
```

### Validation Error Example
```
Starter mode infeasible: session runtime (50s) must be less than per-session offset (30s). 
Increase total_cycle_minutes or reduce groups/delay.
```

### Result
- Unsafe starter execution prevented
- Clear error messages guide user
- System never allows collisions

## FIX 3: TIMING AUTHORITY

### Problem
- Scheduler calculated offsets (wrong authority)
- Worker had no control over timing
- Mixed responsibilities

### Solution
- **Scheduler**: Only triggers cycles
- **Worker**: Owns offsets, delays, alignment
- Clear separation of concerns

### Authority Moved

**From Scheduler:**
- ❌ Offset calculation
- ❌ Timing logic

**To Worker:**
- ✅ Offset calculation (per cycle)
- ✅ Delay enforcement
- ✅ Cycle alignment
- ✅ Timing authority

### Code Changes

**Scheduler (`backend/bot/scheduler.py`):**
```python
# REMOVED all timing logic
# Only triggers cycles
await execute_user_cycle(user_id, is_running, self.delay_between_cycles, self.user_semaphores.get(user_id))
```

**Worker (`backend/bot/worker.py`):**
```python
# Worker owns all timing
cycle_start_time = asyncio.get_event_loop().time()
# Calculate offsets
# Enforce delays
# Align sessions
```

### Result
- Clear authority: worker owns timing
- Scheduler is simple: only triggers
- No mixed responsibilities

## FIX 4: SAFE DELAY ENFORCEMENT

### Problem
- `delay_between_posts` could be too low
- Starter mode could compress delays
- Risk of spam detection

### Solution
- Enforce minimum delay: **3 seconds**
- Apply to both starter and enterprise modes
- Never allow unsafe delays

### Code Changes

**Worker (`backend/bot/worker.py`):**
```python
# FIX 4: Safe delay enforcement - minimum 3 seconds
MIN_DELAY_BETWEEN_POSTS = 3
if delay_between_posts < MIN_DELAY_BETWEEN_POSTS:
    logger.warning(f"User {user_id}: delay_between_posts ({delay_between_posts}s) below minimum ({MIN_DELAY_BETWEEN_POSTS}s), enforcing minimum")
    delay_between_posts = MIN_DELAY_BETWEEN_POSTS
```

### Result
- Minimum 3 seconds enforced
- Starter mode cannot compress delays
- Safe posting guaranteed

## FIX 5: PLAN ENFORCEMENT

### Problem
- Request body could override plan limits
- STARTER plan could use enterprise mode
- ENTERPRISE plan could use starter mode

### Solution
- **Plan type is authoritative**
- STARTER plan → starter mode only
- ENTERPRISE plan → enterprise mode only
- Request body cannot override

### Code Changes

**API (`backend/api/bot_control.py`):**
```python
# FIX 5: PLAN ENFORCEMENT - plan_type determines execution_mode, cannot override
plan_type = None
if plan_limits and isinstance(plan_limits, dict):
    plan_type = plan_limits.get("plan_type")

# Enforce plan limits: STARTER plan → starter mode, ENTERPRISE plan → enterprise mode
if plan_type == "STARTER":
    execution_mode = "starter"
    # Request body cannot override plan limits
    if request and request.execution_mode and request.execution_mode != "starter":
        raise HTTPException(
            status_code=403,
            detail="STARTER plan requires starter execution mode. Cannot use enterprise mode with STARTER plan."
        )
elif plan_type == "ENTERPRISE":
    execution_mode = "enterprise"
    # Request body cannot override plan limits
    if request and request.execution_mode and request.execution_mode != "enterprise":
        raise HTTPException(
            status_code=403,
            detail="ENTERPRISE plan requires enterprise execution mode. Cannot use starter mode with ENTERPRISE plan."
        )
```

### Validation Errors

**STARTER plan trying to use enterprise:**
```
403 Forbidden: STARTER plan requires starter execution mode. Cannot use enterprise mode with STARTER plan.
```

**ENTERPRISE plan trying to use starter:**
```
403 Forbidden: ENTERPRISE plan requires enterprise execution mode. Cannot use starter mode with ENTERPRISE plan.
```

### Result
- Plan limits enforced
- Request body cannot override
- Clear error messages

## Summary of Changes

### Files Modified

1. **`backend/bot/scheduler.py`**
   - Removed offset calculation
   - Removed timing logic
   - Only triggers cycles

2. **`backend/bot/worker.py`**
   - Added per-cycle offset calculation
   - Added starter feasibility validation
   - Added safe delay enforcement
   - Added cycle alignment logic
   - Worker owns all timing authority

3. **`backend/api/bot_control.py`**
   - Added plan enforcement
   - Request body cannot override plan limits
   - Clear validation errors

### Timing Logic (Corrected)

**Per Cycle:**
1. Worker captures `cycle_start_time`
2. Calculates offsets: `[0, offset, 2*offset, ...]`
3. Each session waits: `target_time = cycle_start_time + offset`
4. Sessions align to cycle start
5. No drift across cycles

**Example (2 sessions, 60 minutes):**
```
Cycle 1:
  cycle_start_time = 1000.0
  Session 0: target = 1000.0 + 0 = 1000.0
  Session 1: target = 1000.0 + 1800 = 2800.0

Cycle 2 (after delay_between_cycles):
  cycle_start_time = 4300.0
  Session 0: target = 4300.0 + 0 = 4300.0
  Session 1: target = 4300.0 + 1800 = 6100.0
```

### Validation Rules

1. **Starter Feasibility:**
   - `session_runtime < per_session_offset`
   - Reject if infeasible

2. **Safe Delay:**
   - `delay_between_posts >= 3 seconds`
   - Auto-enforce minimum

3. **Plan Enforcement:**
   - STARTER plan → starter mode only
   - ENTERPRISE plan → enterprise mode only
   - Request body cannot override

## Testing Checklist

- [ ] Starter mode: Offsets recalculated per cycle
- [ ] Starter mode: No session drift across cycles
- [ ] Starter mode: Feasibility validation works
- [ ] Starter mode: Infeasible config rejected
- [ ] Enterprise mode: No offsets applied
- [ ] Delay enforcement: Minimum 3 seconds enforced
- [ ] Plan enforcement: STARTER plan → starter mode only
- [ ] Plan enforcement: ENTERPRISE plan → enterprise mode only
- [ ] Plan enforcement: Request body cannot override

