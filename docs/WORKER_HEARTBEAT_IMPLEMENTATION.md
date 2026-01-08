# Worker Heartbeat Implementation - Source of Truth

## Overview

This document describes the **worker-based status system** that uses heartbeats as the **ONLY reliable source of truth** for adbot runtime status.

## Problem Statement

Previously, the system relied on:
- Supabase `adbots.status` column
- `backend/data/users.json` `bot_status` field
- Scheduler flags

**Problem**: If workers crash, hang, or exit, these sources can show "RUNNING" even when the adbot is actually stopped.

## Solution: Worker Heartbeats

**Core Rule**: The ONLY reliable indicator that an adbot is running is an **active worker heartbeat**.

### Three Layers of Truth

1. **Supabase (INTENT)**
   - What the system wants
   - `adbots.status = RUNNING | STOPPED | EXPIRED`
   - Controlled by frontend

2. **Python JSON (RUNTIME CACHE)**
   - What Python thinks should be happening
   - `backend/data/users.json` → `bot_status = "running" | "stopped"`
   - Volatile, can lie after crash

3. **Worker Heartbeat (REALITY - SOURCE OF TRUTH)**
   - What is actually happening right now
   - `backend/data/heartbeats.json`
   - Comes ONLY from workers
   - **This is what determines displayed status**

## Implementation

### 1. Heartbeat Manager (`backend/bot/heartbeat_manager.py`)

**Functions:**
- `emit_heartbeat(adbot_id, cycle_state, worker_pid)` - Workers call this
- `clear_heartbeat(adbot_id)` - Called when worker stops
- `get_heartbeat(adbot_id)` - Read heartbeat
- `is_heartbeat_fresh(heartbeat, ttl)` - Check if heartbeat is within TTL
- `get_status_from_heartbeat(adbot_id, intent_status)` - Derive status

**Heartbeat Structure:**
```json
{
  "adbot_id": "user-123",
  "timestamp": "2024-01-01T12:00:00",
  "cycle_state": "running" | "idle" | "sleeping",
  "worker_pid": 12345
}
```

**Heartbeat TTL**: 30 seconds (configurable via `HEARTBEAT_TTL` env var)

**Storage**: `backend/data/heartbeats.json`

### 2. Status Derivation Logic

**Status Rules:**

- **RUNNING**:
  - Heartbeat exists
  - `now - heartbeat.timestamp < HEARTBEAT_TTL` (heartbeat is fresh)

- **STOPPED**:
  - No heartbeat
  - OR heartbeat is stale (and intent is not RUNNING)

- **CRASHED**:
  - Supabase intent = RUNNING
  - BUT heartbeat is missing or stale
  - **This means worker died unexpectedly**

### 3. Worker Heartbeat Emission

**Scheduler (`backend/bot/scheduler.py`):**
- Emits heartbeat when cycle starts: `cycle_state = "running"`
- Emits heartbeat when cycle completes: `cycle_state = "sleeping"`
- Emits heartbeat during sleep period (every 2 seconds): `cycle_state = "sleeping"`
- Clears heartbeat when user stops or plan expires

**Worker (`backend/bot/worker.py`):**
- Emits heartbeat at cycle start: `cycle_state = "running"`
- Emits heartbeat at cycle completion: `cycle_state = "idle"`

**Frequency**: Heartbeats are emitted:
- Every cycle start/completion
- Every 2 seconds during sleep (scheduler loop)
- Ensures heartbeat stays fresh even during long sleep periods

### 4. Status Endpoint (`backend/api/bot_control.py`)

**`GET /api/bot/status`**:
- Reads heartbeat (reality)
- Reads `users.json` bot_status (intent)
- Derives status using `get_status_from_heartbeat()`
- Returns REAL status, not intent

**Response:**
```json
{
  "success": true,
  "status": "RUNNING" | "STOPPED" | "CRASHED",
  "intent": "running" | "stopped",
  "is_fresh": true,
  "last_heartbeat": "2024-01-01T12:00:00",
  "cycle_state": "running" | "idle" | "sleeping",
  ...
}
```

**`GET /api/bot/state`**:
- Same as `/status` but includes full state (post_content, groups, stats, etc.)
- Also returns REAL status from heartbeat

### 5. Start/Stop Behavior

**START**:
1. Frontend sends START intent
2. Python updates `users.json`: `bot_status = "running"` (INTENT)
3. Scheduler detects change and starts worker
4. Worker begins emitting heartbeats (REALITY)

**STOP**:
1. Frontend sends STOP intent
2. Python updates `users.json`: `bot_status = "stopped"` (INTENT)
3. Python clears heartbeat immediately
4. Scheduler detects change and stops worker
5. Worker stops emitting heartbeats

**CRASH DETECTION**:
- If worker crashes/hangs:
  - Heartbeat stops automatically (no more emissions)
  - After TTL expires, status becomes CRASHED
  - Frontend can show warning and offer Restart button

## File Changes

### New Files
- `backend/bot/heartbeat_manager.py` - Heartbeat management

### Modified Files
- `backend/bot/scheduler.py` - Emits heartbeats during execution
- `backend/bot/worker.py` - Emits heartbeats at cycle start/end
- `backend/api/bot_control.py` - Status endpoints use heartbeats

### Data Files
- `backend/data/heartbeats.json` - Heartbeat storage (created automatically)

## Frontend Integration

**Current Status**: Frontend still uses Supabase status for display.

**Required Change**: Frontend should:
1. Fetch status ONLY via Python backend: `GET /api/bot/status`
2. Display: RUNNING / STOPPED / CRASHED
3. Show last heartbeat time
4. If status = CRASHED: show warning, offer Restart button

**Supabase `adbots.status`**: Keep for intent only, NOT for display truth.

## Benefits

1. **Workers cannot lie** - If worker is dead, heartbeat stops
2. **Crashes auto-detect** - No supervisor needed
3. **No DB polling** - Heartbeats are file-based, fast
4. **No false "RUNNING" dashboards** - Status reflects reality
5. **Scales naturally** - Each worker manages its own heartbeat

## Testing

**Test Scenarios:**

1. **Normal Operation**:
   - Start adbot → heartbeat appears → status = RUNNING
   - Stop adbot → heartbeat clears → status = STOPPED

2. **Worker Crash**:
   - Start adbot → heartbeat appears
   - Kill worker process → heartbeat stops
   - Wait > TTL → status = CRASHED

3. **Worker Hang**:
   - Start adbot → heartbeat appears
   - Worker hangs (stops emitting) → heartbeat becomes stale
   - After TTL → status = CRASHED

4. **Backend Restart**:
   - Workers stop → heartbeats clear
   - Backend restarts → all bots show STOPPED (correct)
   - User must explicitly restart (prevents stale state)

## Configuration

**Environment Variables:**
- `HEARTBEAT_TTL` - Heartbeat TTL in seconds (default: 30)

**Recommendation**: Set TTL to 2-3x the scheduler loop interval (2 seconds) = 6-10 seconds minimum, 30 seconds is safe.

## Notes

- Heartbeats are written atomically (temp file + rename)
- File locking prevents race conditions
- Heartbeats are per-adbot (user_id)
- No supervisor or background checker needed
- Workers define reality by existing

This is exactly how real job runners (Celery, Sidekiq, Airflow) reason about life and death.

