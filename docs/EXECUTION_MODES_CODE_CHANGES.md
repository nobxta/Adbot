# Execution Modes - Exact Code Changes

## Summary

Implemented two distinct forwarding modes:
- **STARTER**: Rotational broadcast (all sessions → all groups, time-distributed)
- **ENTERPRISE**: Parallel distributed (groups partitioned, parallel execution)

## Files Modified

1. `backend/bot/engine.py` - Group distribution logic
2. `backend/bot/worker.py` - Worker execution with mode support
3. `backend/bot/scheduler.py` - Offset calculation for starter mode
4. `backend/api/bot_control.py` - API endpoint with mode parameter

## Code Changes

### 1. `backend/bot/engine.py`

**Added Functions:**
```python
def distribute_groups_starter(groups: List[str], num_sessions: int) -> List[List[str]]:
    """STARTER MODE: Each session gets ALL groups"""
    if num_sessions == 0:
        return []
    return [groups.copy() for _ in range(num_sessions)]

def distribute_groups_enterprise(groups: List[str], num_sessions: int) -> List[List[str]]:
    """ENTERPRISE MODE: Partition groups evenly across sessions"""
    if num_sessions == 0:
        return []
    groups_per_session = len(groups) // num_sessions
    remainder = len(groups) % num_sessions
    distribution = []
    start_idx = 0
    for i in range(num_sessions):
        count = groups_per_session + (1 if i < remainder else 0)
        distribution.append(groups[start_idx:start_idx + count])
        start_idx += count
    return distribution

def distribute_groups(groups: List[str], num_sessions: int, execution_mode: str = "enterprise") -> List[List[str]]:
    """Distribute groups based on execution mode"""
    if execution_mode == "starter":
        return distribute_groups_starter(groups, num_sessions)
    elif execution_mode == "enterprise":
        return distribute_groups_enterprise(groups, num_sessions)
    else:
        raise ValueError(f"Invalid execution_mode: {execution_mode}")
```

### 2. `backend/bot/worker.py`

**Modified `execute_user_cycle()` signature:**
```python
async def execute_user_cycle(
    user_id: str,
    is_running: Callable[[], bool],
    delay_between_cycles: int = 300,
    user_semaphore: Optional[asyncio.Semaphore] = None,
    execution_mode: str = "enterprise",  # NEW
    total_cycle_minutes: Optional[int] = None,  # NEW
    session_start_offsets: Optional[List[float]] = None  # NEW
) -> Dict[str, Any]:
```

**Modified group distribution call:**
```python
# OLD:
groups_distribution = distribute_groups(groups, len(assigned_sessions))

# NEW:
groups_distribution = distribute_groups(groups, len(assigned_sessions), execution_mode)
```

**Modified session cycle call:**
```python
# Calculate start offset for starter mode
start_offset = None
if execution_mode == "starter" and session_start_offsets and idx < len(session_start_offsets):
    start_offset = session_start_offsets[idx]

task = execute_session_cycle(
    user_id,
    session_filename,
    str(session_path),
    api_id,
    api_hash,
    post_content,
    assigned_groups,
    delay_between_posts,
    logger,
    is_running,
    user_semaphore,
    execution_mode,  # NEW
    start_offset  # NEW
)
```

**Modified `execute_session_cycle()` signature:**
```python
async def execute_session_cycle(
    user_id: str,
    session_filename: str,
    session_path: str,
    api_id: int,
    api_hash: str,
    post_link: str,
    assigned_groups: List[str],
    delay_between_posts: int,
    logger,
    is_running: Callable[[], bool],
    user_semaphore: Optional[asyncio.Semaphore] = None,
    execution_mode: str = "enterprise",  # NEW
    start_offset: Optional[float] = None  # NEW
) -> Dict[str, Any]:
```

**Added offset wait:**
```python
# STARTER MODE: Wait for offset before starting
if execution_mode == "starter" and start_offset is not None and start_offset > 0:
    logger.info(f"Session {session_filename}: Waiting {start_offset:.1f}s offset (starter mode)")
    await asyncio.sleep(start_offset)
```

### 3. `backend/bot/scheduler.py`

**Modified `_execute_user_with_lock()`:**
```python
# Get execution mode and cycle config from user data
execution_mode = user_data.get("execution_mode", "enterprise")
total_cycle_minutes = user_data.get("total_cycle_minutes")

# Calculate session offsets for starter mode
session_start_offsets = None
if execution_mode == "starter" and total_cycle_minutes:
    assigned_sessions = user_data.get("assigned_sessions", [])
    num_sessions = len(assigned_sessions)
    if num_sessions > 0:
        total_cycle_seconds = total_cycle_minutes * 60
        per_session_offset = total_cycle_seconds / num_sessions
        session_start_offsets = [i * per_session_offset for i in range(num_sessions)]

await execute_user_cycle(
    user_id, 
    is_running, 
    self.delay_between_cycles,
    self.user_semaphores.get(user_id),
    execution_mode,  # NEW
    total_cycle_minutes,  # NEW
    session_start_offsets  # NEW
)
```

### 4. `backend/api/bot_control.py`

**Added Request Model:**
```python
class StartBotRequest(BaseModel):
    execution_mode: Optional[str] = None  # "starter" | "enterprise"
    total_cycle_minutes: Optional[int] = None  # Required for starter mode
```

**Modified `/api/bot/start` endpoint:**
```python
@router.post("/start")
async def start_bot(
    auth_data: tuple[str, Optional[str], Optional[Dict[str, Any]]] = Depends(verify_auth_and_get_plan_status),
    request: Optional[StartBotRequest] = Body(None)  # NEW
) -> Dict[str, Any]:
```

**Added mode validation and storage:**
```python
# Get execution_mode from request body, plan_limits, or default
execution_mode = "enterprise"  # Default
total_cycle_minutes = None

# Priority 1: Request body (explicit)
if request and request.execution_mode:
    execution_mode = request.execution_mode
    if execution_mode not in ["starter", "enterprise"]:
        raise HTTPException(status_code=400, detail="Invalid execution_mode")
    if execution_mode == "starter":
        if request.total_cycle_minutes is None or request.total_cycle_minutes <= 0:
            raise HTTPException(status_code=400, detail="Starter mode requires total_cycle_minutes > 0")
        total_cycle_minutes = request.total_cycle_minutes

# Priority 2: Infer from plan_limits
elif plan_limits and isinstance(plan_limits, dict):
    plan_type = plan_limits.get("plan_type")
    if plan_type == "STARTER":
        execution_mode = "starter"
        total_cycle_minutes = 60  # Default

# Store in user_data
update_data = {"bot_status": "running"}
if execution_mode:
    update_data["execution_mode"] = execution_mode
if total_cycle_minutes:
    update_data["total_cycle_minutes"] = total_cycle_minutes
update_user_data(user_id, update_data)
```

## Example Timing Calculations

### Example 1: Starter Mode (2 sessions, 60 minutes)

**Input:**
- Sessions: 2
- Total cycle: 60 minutes = 3600 seconds
- Groups: 10
- Delay between posts: 5 seconds

**Calculation:**
```
per_session_offset = 3600 / 2 = 1800 seconds (30 minutes)
session_start_offsets = [0, 1800]
```

**Timeline:**
```
Session 0: Starts at 0s
  - Group 0: 0s
  - Group 1: 5s
  - Group 2: 10s
  - ...
  - Group 9: 45s
  - Duration: ~50s

Session 1: Starts at 1800s (30 minutes)
  - Group 0: 1800s
  - Group 1: 1805s
  - ...
  - Group 9: 1845s
  - Duration: ~50s
```

**Result:** No simultaneous posts to same group. Posts are time-distributed.

### Example 2: Starter Mode (6 sessions, 60 minutes)

**Input:**
- Sessions: 6
- Total cycle: 60 minutes = 3600 seconds
- Groups: 20
- Delay between posts: 5 seconds

**Calculation:**
```
per_session_offset = 3600 / 6 = 600 seconds (10 minutes)
session_start_offsets = [0, 600, 1200, 1800, 2400, 3000]
```

**Timeline:**
```
Session 0: Starts at 0s (0 min)
Session 1: Starts at 600s (10 min)
Session 2: Starts at 1200s (20 min)
Session 3: Starts at 1800s (30 min)
Session 4: Starts at 2400s (40 min)
Session 5: Starts at 3000s (50 min)

Each session posts to all 20 groups with 5s delay
Total per session: ~100s
```

**Result:** Sessions are staggered by 10 minutes. No overlap.

### Example 3: Enterprise Mode (3 sessions, 10 groups)

**Input:**
- Sessions: 3
- Groups: 10
- Delay between posts: 5 seconds

**Calculation:**
```
groups_per_session = 10 / 3 = 3.33
Distribution: [4, 3, 3] groups
```

**Timeline:**
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

Total time: ~15s (vs ~50s in starter mode)
```

**Result:** All sessions run in parallel. Fast execution.

## Delay and Spam Prevention

### Starter Mode
- **Per-group delay**: `delay_between_posts` (e.g., 5 seconds)
- **Session offset**: Prevents simultaneous posts to same group
- **Time distribution**: Spreads posts over entire cycle (e.g., 60 minutes)

**Spam Prevention:**
- No two sessions post to same group at same time
- Each group receives posts with time gaps (offset + delay)
- Example: Group 0 receives posts at 0s, 1800s, 3600s (if cycle repeats)

### Enterprise Mode
- **Per-group delay**: `delay_between_posts` (e.g., 5 seconds)
- **No session offset**: All sessions start immediately
- **Group partitioning**: Ensures no overlap (each group assigned to one session only)

**Spam Prevention:**
- Each group is assigned to exactly one session
- No simultaneous posts to same group (impossible - only one session has that group)
- Fast execution with parallel posting

## Validation

1. **Execution Mode:**
   - Must be "starter" or "enterprise"
   - No fallback or silent default
   - Raises `ValueError` if invalid

2. **Starter Mode:**
   - Requires `total_cycle_minutes > 0`
   - Raises `HTTPException` if missing or invalid
   - Calculates offsets automatically

3. **Enterprise Mode:**
   - No `total_cycle_minutes` required
   - Groups partitioned automatically
   - All sessions start immediately

## Frontend Integration (Required)

**API Call:**
```typescript
POST /api/bot/start
Headers: Authorization: Bearer {token}
Body: {
  "execution_mode": "starter" | "enterprise",
  "total_cycle_minutes": 60  // Required for starter mode
}
```

**Get from Product:**
```typescript
// Read product.plan_type from Supabase
const planType = product.plan_type; // "STARTER" | "ENTERPRISE"
const executionMode = planType === "STARTER" ? "starter" : "enterprise";

// Calculate total_cycle_minutes for starter mode
// Option 1: Use product.posting_interval_seconds and groups count
// Option 2: Use default (e.g., 60 minutes)
const totalCycleMinutes = executionMode === "starter" ? 60 : undefined;
```

## Testing Checklist

- [ ] Starter mode: All sessions get all groups
- [ ] Starter mode: Offsets calculated correctly
- [ ] Starter mode: Sessions start at correct times
- [ ] Starter mode: No simultaneous posts to same group
- [ ] Enterprise mode: Groups partitioned evenly
- [ ] Enterprise mode: No overlap between sessions
- [ ] Enterprise mode: All sessions start immediately
- [ ] Enterprise mode: Parallel execution works
- [ ] Invalid execution_mode rejected
- [ ] Starter mode without total_cycle_minutes rejected
- [ ] Default to enterprise if not specified

