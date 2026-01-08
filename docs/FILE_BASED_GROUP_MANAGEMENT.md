# File-Based Group Management Implementation

## Overview

The AdBot system now uses **file-based group management** instead of database-stored groups. Groups are stored in `.txt` files, one numeric group ID per line, with separate files for each plan type.

## Group Files

### Location
- **Directory**: `backend/data/groups/`
- **STARTER Plan**: `starter_groups.txt`
- **ENTERPRISE Plan**: `enterprise_groups.txt`

### File Format
- One numeric group ID per line
- Supports negative IDs for supergroups (e.g., `-1001234567890`)
- Empty lines and lines starting with `#` are ignored
- No usernames, no links - **ONLY numeric IDs**

### Example
```
-1001234567890
-1009876543210
1234567890
```

## Plan-Specific Behavior

### STARTER PLAN (Randomized Time-Based Forwarding)

**Intent**: Budget plan with less predictable timing, higher spam tolerance, simpler logic.

**Group Source**: `starter_groups.txt`

**Core Behavior**:
1. **All sessions post to ALL groups** - No group division
2. **Each session works independently**
3. **Timing between sessions is RANDOMIZED**

**Random Start Offsets**:
- Each cycle, every session gets a **RANDOM start offset** within a 60-minute window
- Example: Session A starts at minute 7, Session B starts at minute 41
- This ensures sessions do **NOT** post in synchronized patterns
- New random offsets are calculated for **EACH cycle**

**Cycle Completion**:
- Each session posts to ALL groups sequentially
- After finishing, waits a **RANDOM cycle gap** (60-120 minutes)
- Then repeats with a new random offset

**Per-Message Delay**: 30-60 seconds (random per message)

**File Reload**:
- If `starter_groups.txt` is changed, reload happens **AFTER current cycle finishes**
- Changes apply to the **next cycle**

**Result**:
- Sessions forward at different, random times
- Same groups, different timing
- No strict cycle alignment
- Unpredictable but controlled spam behavior

---

### ENTERPRISE PLAN (Cycle-Complete, Group-Distributed)

**Intent**: Premium plan with predictable load, scalable to large group counts, no duplicate spam.

**Group Source**: `enterprise_groups.txt`

**Core Behavior**:
1. **Groups are DIVIDED across sessions**
2. **Each group belongs to EXACTLY ONE session**
3. **Each session completes its assigned groups fully**
4. **A cycle is ONLY complete when ALL assigned groups are posted**

**Group Division Logic**:
- `total_groups ÷ total_sessions = groups_per_session`
- Assign sequentially
- Last session may take extra groups

**Example**:
- Groups: 100
- Sessions: 4
- Assignment:
  - Session A → Groups 1-25
  - Session B → Groups 26-50
  - Session C → Groups 51-75
  - Session D → Groups 76-100

**Timing Logic**:
- Each session posts to its assigned groups
- Per-message delay: 15-30 seconds
- After finishing its group list:
  - Session waits a **SHORT cycle gap** (20-45 minutes)
  - Then starts the **NEXT cycle**

**Important**:
- Sessions do **NOT** wait for each other
- Each session completes cycles independently
- Every cycle = **full coverage of all enterprise groups**

**File Reload**:
- If `enterprise_groups.txt` changes:
  - Recalculate group assignments
  - Apply changes at the **NEXT cycle start**
  - Do **NOT** interrupt mid-cycle posting

**Result**:
- Sessions have fixed group responsibility
- Every cycle completes full coverage
- Clean, repeatable, scalable behavior

---

## Error Handling (All Plans)

- Track errors per (session, group)
- If a group fails 2+ times:
  - Temporarily skip it for that session
- Retry skipped groups after N cycles
- **Never delete groups automatically**

---

## Implementation Details

### Group File Manager (`group_file_manager.py`)

**Functions**:
- `get_groups_for_plan(plan_type)`: Load groups from file
- `parse_group_file(file_path)`: Parse and validate group file
- `GroupFileCache`: Cache with modification time tracking

**Features**:
- Automatic file validation (numeric IDs only)
- Modification time tracking for reload detection
- Automatic directory creation
- Empty file handling

### Worker Updates (`worker.py`)

**Changes**:
1. Loads groups from files at cycle start
2. Checks file modification time for changes
3. Reloads groups at cycle completion if file changed
4. Calculates random start offsets for STARTER mode (each cycle)
5. Applies random offsets before starting each session

### Plan Config Updates (`plan_config.py`)

**STARTER Constraints**:
- `per_message_delay_min`: 30 seconds
- `per_message_delay_max`: 60 seconds
- `cycle_gap_min`: 60 minutes
- `cycle_gap_max`: 120 minutes
- `total_window_minutes`: 60 minutes (for random offsets)

**ENTERPRISE Constraints**:
- `per_message_delay_min`: 15 seconds
- `per_message_delay_max`: 30 seconds
- `cycle_gap_min`: 20 minutes
- `cycle_gap_max`: 45 minutes
- `cycle_gap_variance`: ±5 minutes per session

### Scheduler Updates (`scheduler.py`)

**Changes**:
1. Loads groups from files for cycle gap calculation
2. Uses plan-specific cycle gaps:
   - STARTER: Random 60-120 minutes
   - ENTERPRISE: Random 20-45 minutes

---

## Key Differences Between Plans

| Feature | STARTER | ENTERPRISE |
|---------|---------|------------|
| Group Assignment | All sessions → All groups | Groups divided across sessions |
| Start Timing | Random offset (0-60 min) | Immediate (no offset) |
| Cycle Gap | 60-120 minutes (random) | 20-45 minutes |
| Per-Message Delay | 30-60 seconds | 15-30 seconds |
| Cycle Completion | All groups posted by each session | All assigned groups posted |
| Synchronization | No synchronization | Independent cycles |

---

## File Reload Behavior

1. **Detection**: File modification time is checked at cycle start
2. **Notification**: If file changed, log message is emitted
3. **Application**: File is reloaded **AFTER current cycle completes**
4. **Next Cycle**: New groups are used in the next cycle

**STARTER Mode**:
- All sessions reload groups after cycle completion
- New groups apply to next cycle

**ENTERPRISE Mode**:
- Group assignments are recalculated
- New assignments apply at next cycle start
- Mid-cycle posting is not interrupted

---

## Admin Operations

### Adding Groups
1. Edit the appropriate group file (`starter_groups.txt` or `enterprise_groups.txt`)
2. Add one numeric group ID per line
3. Save the file
4. Changes apply automatically at the next cycle completion

### Removing Groups
1. Remove the group ID line from the file
2. Save the file
3. Changes apply automatically at the next cycle completion

### Validation
- Invalid group IDs (non-numeric) raise `ValueError` with line number
- Empty files are handled gracefully
- Comments (lines starting with `#`) are ignored

---

## Testing Checklist

- [ ] STARTER plan: Sessions post at different random times
- [ ] STARTER plan: All sessions post to all groups
- [ ] STARTER plan: Cycle gaps are randomized (60-120 min)
- [ ] ENTERPRISE plan: Groups are divided across sessions
- [ ] ENTERPRISE plan: Each session completes assigned groups
- [ ] ENTERPRISE plan: Cycle gaps are shorter (20-45 min)
- [ ] File reload: Changes apply at cycle completion
- [ ] File reload: Mid-cycle posting not interrupted
- [ ] Error handling: Groups with 2+ errors are skipped
- [ ] Error handling: Skipped groups retry after N cycles

---

## Migration Notes

**Backward Compatibility**:
- If group files don't exist or are empty, system falls back to `user_data.get("groups", [])`
- Legacy mode is logged as a warning

**File Creation**:
- Group files are automatically created if they don't exist
- Empty files are handled gracefully

**No Database Changes Required**:
- Groups are no longer stored in the database
- Existing database groups are ignored (file takes precedence)

---

## Summary

The system now supports:
1. ✅ File-based group management (`.txt` files)
2. ✅ STARTER plan: Randomized time-based forwarding
3. ✅ ENTERPRISE plan: Cycle-complete, group-distributed
4. ✅ Automatic file reload at cycle completion
5. ✅ Plan-specific timing constraints
6. ✅ Error handling and group skipping
7. ✅ No synchronized posting patterns (STARTER)
8. ✅ Full coverage cycles (ENTERPRISE)

