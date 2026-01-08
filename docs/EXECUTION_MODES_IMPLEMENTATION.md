# Execution Modes Implementation - Starter vs Enterprise

## Overview

The system now supports **TWO DISTINCT** adbot forwarding modes:

1. **STARTER (ROTATIONAL BROADCAST)** - Slow, safe, rotational
2. **ENTERPRISE (PARALLEL DISTRIBUTED)** - Fast, parallel, distributed

## Mode Determination

Mode is determined by:
- `product.plan_type` in Supabase (`STARTER` | `ENTERPRISE`)
- Passed to Python backend as `execution_mode` parameter
- Stored in `backend/data/users.json` as `execution_mode` field

## MODE 1: STARTER (ROTATIONAL BROADCAST)

### Goal
- Every session forwards to **ALL groups**
- Posts are **time-distributed** to avoid simultaneous posting
- **NO parallel posting** to the same group

### Rules
- `sessions_count = N`
- `total_cycle_minutes = C` (e.g., 60 minutes)
- `per_session_offset = C / N` (in seconds)

### Implementation

**Group Distribution:**
- Each session gets **ALL groups** (no partitioning)
- Function: `distribute_groups_starter()` in `backend/bot/engine.py`

**Scheduler Behavior:**
- Calculates offsets: `[0, C/N, 2*C/N, ..., (N-1)*C/N]`
- Each session starts at its offset time
- Example: 2 sessions, 60 minutes → offsets: [0s, 1800s]

**Worker Behavior:**
- Each session waits for its offset before starting
- Each session loops over **ALL groups**
- Per-group delay is respected (`delay_between_posts`)
- No two sessions post to same group at same time

**Example Timing (2 sessions, 60 minutes, 10 groups, 5s delay):**
```
Session 0: Starts at 0s
  - Group 0: 0s
  - Group 1: 5s
  - Group 2: 10s
  - ...
  - Group 9: 45s
  - Total: ~50s

Session 1: Starts at 1800s (30 minutes)
  - Group 0: 1800s
  - Group 1: 1805s
  - ...
  - Group 9: 1845s
  - Total: ~50s
```

**Example Timing (6 sessions, 60 minutes, 10 groups, 5s delay):**
```
Session 0: Starts at 0s (0 min)
Session 1: Starts at 600s (10 min)
Session 2: Starts at 1200s (20 min)
Session 3: Starts at 1800s (30 min)
Session 4: Starts at 2400s (40 min)
Session 5: Starts at 3000s (50 min)

Each session posts to all 10 groups with 5s delay
```

### Characteristics
- **Slow**: Only one session active at a time per group
- **Safe**: No simultaneous posts to same group
- **Rotational**: Sessions take turns

## MODE 2: ENTERPRISE (PARALLEL DISTRIBUTED)

### Goal
- **Fast posting** with parallel execution
- **Low per-account load** (each account handles subset)
- **Parallel execution** across all sessions

### Rules
- Groups are **evenly partitioned** across sessions
- Each session receives a **UNIQUE subset**
- All sessions run **in parallel**
- **No overlap** between group subsets

### Implementation

**Group Distribution:**
- Groups are partitioned evenly: `distribute_groups_enterprise()`
- Example: 10 groups, 3 sessions → [4, 3, 3] groups per session

**Scheduler Behavior:**
- All sessions start **immediately** (no offsets)
- All sessions run **in parallel**

**Worker Behavior:**
- Each session posts to its **assigned groups only**
- Minimal delay only for Telegram safety
- All sessions execute concurrently

**Example Timing (3 sessions, 10 groups partitioned [4, 3, 3], 5s delay):**
```
Session 0: Groups [0,1,2,3] - Starts immediately
  - Group 0: 0s
  - Group 1: 5s
  - Group 2: 10s
  - Group 3: 15s

Session 1: Groups [4,5,6] - Starts immediately (parallel)
  - Group 4: 0s
  - Group 5: 5s
  - Group 6: 10s

Session 2: Groups [7,8,9] - Starts immediately (parallel)
  - Group 7: 0s
  - Group 8: 5s
  - Group 9: 10s

Total time: ~15s (vs 50s in starter mode)
```

### Characteristics
- **Fast**: All sessions run in parallel
- **Parallel**: No waiting between sessions
- **Distributed**: Work is split across sessions

## Code Changes

### 1. Engine (`backend/bot/engine.py`)

**New Functions:**
- `distribute_groups_starter()` - Each session gets all groups
- `distribute_groups_enterprise()` - Groups partitioned across sessions
- `distribute_groups()` - Routes to correct function based on mode

**Modified:**
- `distribute_groups()` now accepts `execution_mode` parameter

### 2. Worker (`backend/bot/worker.py`)

**Modified `execute_user_cycle()`:**
- Accepts `execution_mode`, `total_cycle_minutes`, `session_start_offsets`
- Calls `distribute_groups()` with mode
- Passes offsets to session workers

**Modified `execute_session_cycle()`:**
- Accepts `execution_mode`, `start_offset`
- Waits for offset before starting (starter mode only)
- No offset in enterprise mode (starts immediately)

### 3. Scheduler (`backend/bot/scheduler.py`)

**Modified `_execute_user_with_lock()`:**
- Reads `execution_mode` and `total_cycle_minutes` from user_data
- Calculates `session_start_offsets` for starter mode
- Passes to `execute_user_cycle()`

**Offset Calculation:**
```python
if execution_mode == "starter" and total_cycle_minutes:
    num_sessions = len(assigned_sessions)
    total_cycle_seconds = total_cycle_minutes * 60
    per_session_offset = total_cycle_seconds / num_sessions
    session_start_offsets = [i * per_session_offset for i in range(num_sessions)]
```

### 4. API (`backend/api/bot_control.py`)

**New Model:**
- `StartBotRequest` - Accepts `execution_mode` and `total_cycle_minutes`

**Modified `/api/bot/start`:**
- Accepts `StartBotRequest` in body
- Validates execution_mode (must be "starter" or "enterprise")
- Validates total_cycle_minutes for starter mode
- Stores in `users.json`

**Priority:**
1. Request body (explicit)
2. Plan limits (inferred from plan_type)
3. Default: "enterprise"

## Frontend Integration

**Required Changes:**

1. **When starting adbot:**
   ```typescript
   POST /api/bot/start
   {
     "execution_mode": "starter" | "enterprise",
     "total_cycle_minutes": 60  // Required for starter mode
   }
   ```

2. **Get execution_mode from product:**
   - Read `product.plan_type` from Supabase
   - Map: `STARTER` → `"starter"`, `ENTERPRISE` → `"enterprise"`

3. **Calculate total_cycle_minutes (starter mode):**
   - Use `product.posting_interval_seconds` and number of groups
   - Or use a default (e.g., 60 minutes)

## Delay and Spam Prevention

### Starter Mode
- **Per-group delay**: `delay_between_posts` (e.g., 5 seconds)
- **Session offset**: Prevents simultaneous posts to same group
- **Time distribution**: Spreads posts over entire cycle

### Enterprise Mode
- **Per-group delay**: `delay_between_posts` (e.g., 5 seconds)
- **No session offset**: All sessions start immediately
- **Group partitioning**: Ensures no overlap (no same group posted by multiple sessions)

## Validation Rules

1. **Execution Mode:**
   - Must be "starter" or "enterprise"
   - No fallback or silent default

2. **Starter Mode:**
   - Requires `total_cycle_minutes > 0`
   - Rejects if missing or invalid

3. **Enterprise Mode:**
   - No `total_cycle_minutes` required
   - Groups are partitioned automatically

## Example Scenarios

### Scenario 1: Starter Mode (2 sessions, 60 minutes)
- **Groups**: 10 groups
- **Sessions**: 2
- **Cycle**: 60 minutes
- **Offsets**: [0s, 1800s]
- **Behavior**: Session 0 posts to all 10 groups, then Session 1 posts to all 10 groups (30 min later)

### Scenario 2: Enterprise Mode (3 sessions)
- **Groups**: 10 groups
- **Sessions**: 3
- **Distribution**: [4, 3, 3] groups
- **Behavior**: All 3 sessions post in parallel to their assigned groups

### Scenario 3: Starter Mode (6 sessions, 60 minutes)
- **Groups**: 20 groups
- **Sessions**: 6
- **Cycle**: 60 minutes
- **Offsets**: [0s, 600s, 1200s, 1800s, 2400s, 3000s]
- **Behavior**: Each session posts to all 20 groups, staggered by 10 minutes

## Testing

**Test Cases:**

1. **Starter Mode:**
   - Verify all sessions get all groups
   - Verify offsets are calculated correctly
   - Verify sessions start at correct times
   - Verify no simultaneous posts to same group

2. **Enterprise Mode:**
   - Verify groups are partitioned evenly
   - Verify no overlap between sessions
   - Verify all sessions start immediately
   - Verify parallel execution

3. **Mode Validation:**
   - Reject invalid execution_mode
   - Require total_cycle_minutes for starter
   - Default to enterprise if not specified

## Notes

- **No mixing**: Modes are completely separate, no fallback
- **Explicit mode**: Must be explicitly set, no inference
- **Backward compatible**: Defaults to enterprise if not specified
- **Performance**: Enterprise is faster, Starter is safer

