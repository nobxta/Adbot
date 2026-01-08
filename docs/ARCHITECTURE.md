# Backend Architecture

## Overview

This backend is a **Bot Execution Engine** - it ONLY handles Telethon AdBot execution. It does NOT handle payments, emails, or user management (handled by frontend).

## Core Principles

1. **ONE shared AdBot engine** - No code duplication
2. **ONE Python process** - Handles all users
3. **Sessions exclusive per user** - From shared pool
4. **API pairs with 7-session limit** - Spread sessions across pairs
5. **Multi-user scheduler** - Loops through active users
6. **Per-user isolation** - Config, stats, logs per user

## File Structure

```
backend/
├── bot/
│   ├── engine.py            # Shared forwarding logic (NO duplication)
│   ├── scheduler.py         # Loops active users (ONE process)
│   ├── worker.py            # Per-user execution logic
│   ├── session_manager.py   # Session pool & assignment
│   ├── api_pairs.py         # API_ID/API_HASH pool (7-session limit)
│   ├── log_saver.py         # Per-user logging
│   └── data_manager.py      # users.json & stats.json
├── sessions/
│   ├── unused/              # Available sessions pool
│   ├── assigned/            # User-assigned sessions
│   │   └── {user_id}/
│   └── banned/              # Banned sessions
├── data/
│   ├── users.json           # Per-user runtime data
│   ├── stats.json           # Per-user statistics
│   └── default_groups.json  # Default groups
├── logs/
│   └── {user_id}/           # Per-user logs
│       └── YYYY-MM-DD.log
├── api/
│   ├── bot_control.py       # Start/Stop/Status
│   ├── sync.py              # Full dashboard state
│   └── health.py            # Health check
└── main.py                  # FastAPI entry point
```

## Data Schema

### users.json

```json
{
  "users": {
    "user_id": {
      "assigned_sessions": ["a.session", "b.session"],
      "api_pairs": [0, 1],
      "groups": ["-100123", "-100456"],
      "post_type": "link",
      "post_content": "t.me/channel/123",
      "bot_status": "running",
      "messages_sent": 12345,
      "banned_sessions": ["x.session"]
    }
  }
}
```

### stats.json

```json
{
  "users": {
    "user_id": {
      "total_posts": 1000,
      "total_success": 950,
      "total_failures": 50,
      "total_flood_waits": 5,
      "total_messages_sent": 950,
      "active_sessions": 2,
      "banned_sessions": 0,
      "last_activity": "2024-01-01T10:00:00"
    }
  }
}
```

## Execution Flow

### 1. User Starts Bot

```
Frontend → POST /api/bot/start
  → Backend checks sessions
  → Assigns sessions from pool if needed
  → Updates users.json (bot_status: "running")
  → Scheduler picks up active user
```

### 2. Scheduler Loop

```
Scheduler.start()
  → Loop every 300s (delay_between_cycles):
    → Get active users (bot_status == "running")
    → For each active user:
      → Execute user cycle (parallel for all sessions)
      → Update stats.json
```

### 3. User Cycle Execution

```
execute_user_cycle(user_id)
  → Load user data (sessions, groups, post_content)
  → Distribute groups across sessions
  → For each session:
    → Initialize TelegramClient
    → Execute forwarding cycle
    → Forward to assigned groups
    → Update stats
```

### 4. Session Assignment

```
assign_sessions_to_user(user_id, num_sessions)
  → Get unused sessions from sessions/unused/
  → Move to sessions/assigned/{user_id}/
  → Update users.json
  → Assign API pairs (respecting 7-session limit)
```

## API Endpoints

### POST /api/bot/start

Start bot for user
- Assigns sessions if needed
- Sets bot_status: "running"
- Scheduler picks up automatically

### POST /api/bot/stop

Stop bot for user
- Sets bot_status: "stopped"
- Scheduler stops executing cycles

### GET /api/bot/status

Get bot status
- Returns current status, sessions, groups, stats

### GET /api/sync/state

Full dashboard state
- User config, stats, logs
- Used by frontend on dashboard load

### GET /api/health

Health check
- Backend health, scheduler status

## Session Pool Management

### Session Lifecycle

1. **Admin uploads** → `sessions/unused/`
2. **User starts bot** → Assign from unused pool
3. **Session banned** → Move to `sessions/banned/`
4. **Auto-replace** → Assign new session from unused pool

### API Pair Assignment

- One API pair can handle MAX 7 sessions
- Sessions distributed across pairs to avoid limits
- Backend tracks usage per pair
- New sessions assigned to least-used pair

## Multi-User Execution

### ONE Process Architecture

```
FastAPI App (main.py)
  ↓
Scheduler (scheduler.py)
  ↓
For each active user:
  ↓
Worker (worker.py) - executes cycle
  ↓
Engine (engine.py) - shared forwarding logic
```

### User Isolation

- Each user has own config (users.json)
- Each user has own stats (stats.json)
- Each user has own logs (logs/{user_id}/)
- Each user has own sessions (sessions/assigned/{user_id}/)
- No cross-user access

## Restart Behavior

- On server restart: All bots start STOPPED
- Users must manually restart
- Assigned sessions & configs persist (in users.json)
- Stats persist (in stats.json)

## Integration Points

### Frontend → Backend

- Frontend sends JWT or API key
- Backend validates auth
- Backend trusts frontend for payment (no validation)
- Backend enforces limits (sessions, groups, etc.)

### Backend → AdBot

- Backend uses existing AdBot forwarding logic (engine.py)
- No changes to AdBot core (extracted, not duplicated)
- Shared engine used by all users

## Security

- JWT or API key authentication
- User isolation enforced (API layer + data layer)
- Session files secured (exclusive per user)
- No payment logic in backend
- No email logic in backend

