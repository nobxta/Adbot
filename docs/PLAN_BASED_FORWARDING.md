# Plan-Based Forwarding Logic Implementation

## Overview
This document describes the implementation of different forwarding behaviors for STARTER and ENTERPRISE subscription plans in the Telegram AdBot system.

## Architecture

### Core Components

1. **`bot/plan_config.py`**: Defines timing constraints based on plan type
2. **`bot/error_tracker.py`**: Tracks errors per (session, group) pair with skipping logic
3. **`bot/engine.py`**: Updated forwarding cycle with plan-specific behavior
4. **`bot/worker.py`**: Updated to use plan-specific timing and error tracking
5. **`bot/scheduler.py`**: Updated to use plan-specific cycle gaps

## Plan Type Differences

### STARTER PLAN

**Intent**: Low-cost plan with simpler logic, acceptable higher spam risk

**Group Distribution**:
- All sessions post to ALL groups
- No group partitioning
- Duplicate posts across sessions are expected and allowed

**Timing Constraints**:
- Per-message delay: **30-60 seconds** (randomized)
- Cycle gap: **60-120 minutes** (longer, to reduce spam risk)
- Startup stagger: **5-10 minutes** between sessions (first cycle only)

**Failure Behavior**:
- Track errors per (session, group) pair
- Skip group after **2+ errors** for that session only
- Retry skipped groups after **3 cycles**

**Example**:
```
Groups: 100, Sessions: 3

Session A: Groups 1-100 (starts immediately)
Session B: Groups 1-100 (starts after 5-10 min)
Session C: Groups 1-100 (starts after 10-20 min)

Each session:
- Posts to all 100 groups
- Cycle complete
- Wait 60-120 minutes
- Repeat
```

### ENTERPRISE PLAN

**Intent**: High-value plan, large group counts, long-term survivability, no duplicate spam

**Group Distribution**:
- Groups are **evenly divided** across sessions
- Each group assigned to **ONE session only**
- Sessions **NEVER** post to the same group
- Sequential distribution: Session A gets groups 1-N, Session B gets groups N+1-2N, etc.

**Timing Constraints**:
- Per-message delay: **15-30 seconds** (faster)
- Cycle gap: **20-45 minutes** (shorter)
- Cycle gap variance: **±5 minutes** per session (to avoid synchronized spam waves)
- No startup stagger (groups are partitioned)

**Failure Behavior**:
- Track errors per (session, group) pair
- Skip group after **2+ errors** for that session only
- Other sessions continue unaffected
- Retry skipped groups after **3 cycles**

**Example**:
```
Groups: 100, Sessions: 5

Session A: Groups 1-20
Session B: Groups 21-40
Session C: Groups 41-60
Session D: Groups 61-80
Session E: Groups 81-100

Each session:
- Posts only to assigned groups
- Completes cycle independently
- Waits own cycle gap (20-45 min ±5 min variance)
- Repeats independently
```

## Edge Cases

### Single Session with >100 Groups

**All Plans**:
- Allow execution
- Increase per-message delay (45-90 seconds)
- Increase cycle gap (2-3 hours)
- Log warning: "High load on single session"

## Error Tracking

### Per-Session Error Tracking

- Errors are tracked per `(session_name, group_id)` pair
- Each session maintains its own error count per group
- After **2+ errors** for a group, that session skips it temporarily
- Skipped groups are retried after **3 cycles**
- Success resets error count (but doesn't unskip if already skipped)

### Failure Isolation

- If one session stops or gets banned, only its assigned groups are affected
- Other sessions continue normally
- Enterprise mode maintains group isolation even on session failure

## Timing Implementation

### Per-Message Delays

- Calculated dynamically based on:
  - Plan type (STARTER vs ENTERPRISE)
  - Number of sessions
  - Number of groups
- Applied in `execute_forwarding_cycle()` before each post

### Cycle Gaps

- Calculated per user based on plan type
- STARTER: Random gap within 60-120 minute range
- ENTERPRISE: Base gap (20-45 min) with ±5 min variance per cycle
- Applied in scheduler after cycle completion

### Startup Stagger (Starter Only)

- Only applied on **first cycle** (cycle_number == 0)
- Session A: 0 minutes (starts immediately)
- Session B: 5-10 minutes
- Session C: 10-20 minutes
- Subsequent cycles: All sessions start together

## Logging

Enhanced logging includes:
- **Session ID**: Identifies which session is posting
- **Group ID**: Identifies target group
- **Cycle Number**: Tracks cycle progress per session
- **Plan Type**: Shows execution mode (STARTER/ENTERPRISE)
- **Error Count**: Shows error count per (session, group)
- **Skip Status**: Logs when groups are skipped

Example log format:
```
[Session A] Cycle #5 [1/100] ✓ Forwarded to Group Name
[Session B] Cycle #3 [15/20] ✗ Failed to Group Name: Error reason (errors: 1/2)
[Session C] Cycle #7 Skipping group Group Name (2+ errors, retry after 3 cycles)
```

## Verification

To verify the implementation is correct:

1. **STARTER Plan**:
   - Check that all sessions receive ALL groups
   - Verify startup stagger on first cycle (5-10 min intervals)
   - Verify longer delays (30-60 sec) and cycle gaps (60-120 min)
   - Verify duplicate posts are sent

2. **ENTERPRISE Plan**:
   - Check that groups are partitioned evenly
   - Verify no group overlap between sessions
   - Verify shorter delays (15-30 sec) and cycle gaps (20-45 min)
   - Verify no duplicate posts

3. **Error Tracking**:
   - Verify groups are skipped after 2+ errors
   - Verify skipped groups retry after 3 cycles
   - Verify error count resets on success

4. **Edge Case**:
   - Single session with >100 groups should show warning
   - Increased delays and cycle gaps applied

## Files Modified

- `backend/bot/plan_config.py` (NEW): Plan timing constraints
- `backend/bot/error_tracker.py` (NEW): Per-session error tracking
- `backend/bot/engine.py`: Updated `execute_forwarding_cycle()` with plan-specific behavior
- `backend/bot/worker.py`: Updated to use plan-specific timing and error tracking
- `backend/bot/scheduler.py`: Updated to use plan-specific cycle gaps
- `backend/api/bot_control.py`: Added error tracking cleanup on stop

