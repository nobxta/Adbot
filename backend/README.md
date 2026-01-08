# HQAdz Python Backend

**Production-grade Telegram AdBot execution engine**

This backend manages multi-user Telegram advertising bots with session pooling, scheduler-based execution, and real-time health monitoring.

---

## 📋 Table of Contents

1. [What This Backend Does](#what-this-backend-does)
2. [Architecture Overview](#architecture-overview)
3. [Project Structure](#project-structure)
4. [Setup Instructions](#setup-instructions)
5. [API Documentation](#api-documentation)
6. [Data Flow](#data-flow)
7. [Frontend Integration](#frontend-integration)
8. [Session Management](#session-management)
9. [Troubleshooting](#troubleshooting)
10. [Production Deployment](#production-deployment)

---

## 🎯 What This Backend Does

The HQAdz Python backend is a **multi-user Telegram bot execution engine** that:

- ✅ **Manages Telegram sessions** from a shared pool (assigned/unused/banned)
- ✅ **Schedules bot cycles** for multiple users simultaneously
- ✅ **Forwards messages** to target Telegram groups/channels
- ✅ **Tracks statistics** (messages sent, success/failure rates)
- ✅ **Monitors worker health** with heartbeat system
- ✅ **Enforces plan limits** (session count, execution modes)
- ✅ **Provides HTTP API** for frontend control (Next.js)

### Key Features:
- 🔄 **Asynchronous Scheduler** - One Python process handles all users
- 🛡️ **Session Pooling** - Shared Telegram sessions across users
- 📊 **Real-Time Monitoring** - Worker heartbeats, health checks
- 🔐 **JWT Authentication** - Secure API access with plan enforcement
- 📁 **JSON Storage** - Fast, file-based data persistence
- ⚡ **Fast Cycle Times** - 1-2 second scheduler tick rate

---

## 🏗️ Architecture Overview

```
┌─────────────────┐
│  Next.js        │
│  Frontend       │
│  (Port 3000)    │
└────────┬────────┘
         │ HTTP/REST
         │ JWT Auth
         ▼
┌─────────────────────────────────────────┐
│  Python Backend (FastAPI)               │
│  Port 8000                              │
│                                         │
│  ┌────────────┐    ┌────────────────┐  │
│  │ API Layer  │───▶│ Bot Scheduler  │  │
│  │ (HTTP)     │    │ (Async Loop)   │  │
│  └────────────┘    └───────┬────────┘  │
│                            │            │
│                            ▼            │
│                    ┌───────────────┐    │
│                    │ Worker Pool   │    │
│                    │ (Telethon)    │    │
│                    └───────┬───────┘    │
│                            │            │
│                            ▼            │
│                    ┌───────────────┐    │
│                    │ Session Pool  │    │
│                    │ (Assigned/    │    │
│                    │  Unused/Banned)│   │
│                    └───────────────┘    │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ Data Storage    │
│ - users.json    │
│ - stats.json    │
│ - sessions/     │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ Telegram API    │
│ (Telethon)      │
└─────────────────┘
```

---

## 📁 Project Structure

```
backend/
│
├── main.py                    # 🚀 ENTRY POINT (FastAPI server)
├── requirements.txt           # Python dependencies
├── .env.example              # Environment template
├── README.md                 # This file
├── AUDIT_REPORT.md           # Complete audit findings
│
├── api/                      # HTTP API endpoints
│   ├── __init__.py
│   ├── bot_control.py        # Bot control (start/stop/status)
│   ├── sync.py               # Dashboard sync endpoint
│   └── health.py             # Health check endpoint
│
├── bot/                      # Bot execution engine
│   ├── __init__.py
│   ├── scheduler.py          # Main scheduler (async loop)
│   ├── worker.py             # User cycle executor
│   ├── engine.py             # Telethon forwarding logic
│   ├── session_manager.py    # Session assignment/pooling
│   ├── api_pairs.py          # API pair management (7-session limit)
│   ├── heartbeat_manager.py  # Worker heartbeat tracking
│   ├── log_saver.py          # Log file management
│   └── data_manager.py       # JSON file operations
│
├── storage/                  # Data persistence layer
│   └── data_manager.py       # (Backup copy, use bot/data_manager.py)
│
├── data/                     # Runtime data (JSON files)
│   ├── users.json            # ⭐ PRIMARY: User configs & bot status
│   ├── stats.json            # User statistics
│   ├── groups.json           # Group configurations
│   └── *.example.json        # Example/template files
│
├── sessions/                 # Telegram session files (.session)
│   ├── assigned/             # Active sessions (assigned to users)
│   ├── unused/               # Available session pool
│   ├── banned/               # Banned/frozen sessions
│   └── frozen/               # (Same as banned)
│
├── logs/                     # User log files (generated at runtime)
│   └── (user logs here)
│
└── archive/                  # Legacy code (DO NOT USE)
    ├── Adbot/                # Old standalone bot
    ├── api_wrapper.py        # Old API wrapper
    ├── api_main_old.py       # Old duplicate entry point
    └── docs/                 # Old documentation
```

---

## 🚀 Setup Instructions

### Prerequisites

- **Python 3.9+**
- **pip** (Python package manager)
- **Telegram API credentials** (api_id, api_hash)
- **Telegram session files** (.session files)

### Step 1: Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

**Dependencies:**
- `fastapi` - Web framework
- `uvicorn` - ASGI server
- `telethon` - Telegram client library
- `PyJWT` - JWT authentication

### Step 2: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env file
nano .env
```

**CRITICAL:** Change `JWT_SECRET` to a strong random string:

```env
JWT_SECRET=use-a-strong-random-32-character-string-here
```

### Step 3: Prepare Data Files

Ensure these files exist with correct structure:

**data/users.json:**
```json
{
  "users": {}
}
```

**data/stats.json:**
```json
{
  "users": {}
}
```

### Step 4: Add Telegram Sessions

Place your `.session` files in `sessions/unused/`:

```bash
# Example
backend/sessions/unused/
  ├── session1.session
  ├── session2.session
  └── session3.session
```

### Step 5: Start Backend

```bash
cd backend
python main.py
```

**Expected output:**
```
INFO: Started server process [PID]
INFO: Waiting for application startup.
INFO: Backend restart - reset X bot(s) to stopped state
INFO: Application startup complete.
INFO: Uvicorn running on http://0.0.0.0:8000
```

### Step 6: Verify Backend

```bash
# Health check
curl http://localhost:8000/api/health

# Expected response:
{
  "status": "healthy",
  "scheduler_running": true,
  "active_users": 0,
  "read_only_mode": false
}
```

---

## 🔌 API Documentation

### Base URL

```
http://localhost:8000
```

### Authentication

All endpoints (except health) require JWT authentication:

```http
Authorization: Bearer <jwt_token>
```

**JWT Payload:**
```json
{
  "user_id": "user_123",
  "plan_status": "active",
  "plan_limits": {
    "max_sessions": 1,
    "plan_type": "STARTER"
  }
}
```

### Endpoints

#### 1. **Register User**

```http
POST /api/bot/register-user
```

**Body:**
```json
{
  "email": "user@example.com",
  "plan_status": "active",
  "plan_limits": {"max_sessions": 1}
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered",
  "user_id": "user_123",
  "status": "new"
}
```

---

#### 2. **Start Bot**

```http
POST /api/bot/start
```

**Body (optional):**
```json
{
  "execution_mode": "enterprise",
  "total_cycle_minutes": 60
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bot started",
  "status": "running",
  "sessions": 1,
  "execution_mode": "enterprise"
}
```

**Errors:**
- `403` - Plan expired/inactive
- `409` - No sessions available
- `503` - Read-only mode

---

#### 3. **Stop Bot**

```http
POST /api/bot/stop
```

**Response:**
```json
{
  "success": true,
  "message": "Bot stopped",
  "status": "stopped"
}
```

---

#### 4. **Update Post Content**

```http
POST /api/bot/update-post
```

**Body:**
```json
{
  "post_type": "link",
  "post_content": "https://t.me/channel/123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Post content updated",
  "post_type": "link",
  "post_content": "https://t.me/channel/123"
}
```

---

#### 5. **Update Groups**

```http
POST /api/bot/update-groups
```

**Body:**
```json
{
  "groups": [
    "-1001234567890",
    "@groupname",
    "-1009876543210#123"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Groups updated",
  "groups_count": 3
}
```

---

#### 6. **Get Bot Status**

```http
GET /api/bot/status
```

**Response:**
```json
{
  "success": true,
  "status": "RUNNING",
  "intent": "running",
  "is_active": true,
  "is_fresh": true,
  "last_heartbeat": "2026-01-05T12:34:56",
  "cycle_state": "running",
  "sessions": 1,
  "groups": 10,
  "messages_sent": 50,
  "total_success": 48,
  "total_failures": 2
}
```

**Status Values:**
- `RUNNING` - Bot is actively running (fresh heartbeat)
- `STOPPED` - Bot is stopped
- `CRASHED` - Bot marked running but no heartbeat

---

#### 7. **Get Bot State (Full Dashboard)**

```http
GET /api/bot/state
```

**Response:**
```json
{
  "success": true,
  "status": "RUNNING",
  "is_idle": false,
  "last_error_reason": null,
  "post_type": "link",
  "post_content": "https://t.me/channel/123",
  "groups": ["-1001234567890"],
  "sessions": 1,
  "stats": {
    "total_messages_sent": 50,
    "total_success": 48,
    "total_failures": 2,
    "total_flood_waits": 1
  }
}
```

---

#### 8. **Health Check**

```http
GET /api/health
```

**No authentication required**

**Response:**
```json
{
  "status": "healthy",
  "scheduler_running": true,
  "active_users": 3,
  "read_only_mode": false
}
```

---

#### 9. **Bot Health Metrics**

```http
GET /api/bot/health
```

**No authentication required**

**Response:**
```json
{
  "success": true,
  "health": {
    "active_sessions": 5,
    "banned_sessions": 2,
    "last_cycle_time": "2026-01-05T12:34:56",
    "last_error": null
  }
}
```

---

## 🔄 Data Flow

### 1. User Starts Bot

```
Frontend (Next.js)
  │
  ├─▶ POST /api/bot/control (Next.js API route)
  │     │
  │     ├─▶ backendApi.startBot(userId)
  │     │     │
  │     │     └─▶ POST http://localhost:8000/api/bot/start
  │     │           │ (with JWT: user_id, plan_status, plan_limits)
  │     │           │
  │     │           └─▶ Python Backend: bot_control.py
  │     │                 │
  │     │                 ├─▶ Validate plan status (active?)
  │     │                 ├─▶ Assign sessions from pool
  │     │                 ├─▶ Assign API pairs
  │     │                 └─▶ Update users.json: bot_status = "running"
  │     │
  │     └─▶ Update Supabase: status = "active"
  │
  └─▶ Scheduler detects new active user
        │
        └─▶ Start executing cycles
```

### 2. Bot Execution Cycle

```
Scheduler (scheduler.py)
  │ Fast loop: 1-2 second tick
  │
  ├─▶ Load active users from users.json
  │
  ├─▶ For each user:
  │     │
  │     ├─▶ Check plan expiration (auto-stop if expired)
  │     ├─▶ Check next_run_at timestamp
  │     │
  │     └─▶ If time to run:
  │           │
  │           └─▶ Worker (worker.py)
  │                 │
  │                 ├─▶ Load user config (post_link, groups)
  │                 ├─▶ Distribute groups by execution mode:
  │                 │     - STARTER: all sessions → all groups
  │                 │     - ENTERPRISE: partition groups across sessions
  │                 │
  │                 ├─▶ For each session:
  │                 │     │
  │                 │     └─▶ Engine (engine.py)
  │                 │           │
  │                 │           ├─▶ Connect to Telegram (Telethon)
  │                 │           ├─▶ Parse post link
  │                 │           ├─▶ Forward to assigned groups
  │                 │           ├─▶ Handle errors (FloodWait, Banned, etc.)
  │                 │           └─▶ Return cycle stats
  │                 │
  │                 └─▶ Update stats.json
  │
  └─▶ Schedule next run (delay_between_cycles)
```

### 3. Frontend Fetches Status

```
Frontend
  │
  ├─▶ GET /api/bot/status
  │     │
  │     └─▶ Python Backend
  │           │
  │           ├─▶ Load users.json (intent: "running")
  │           ├─▶ Check heartbeat (REAL status)
  │           │     - Fresh heartbeat (<30s) → RUNNING
  │           │     - Stale heartbeat → CRASHED
  │           │     - No heartbeat + stopped → STOPPED
  │           │
  │           └─▶ Return status + stats
  │
  └─▶ Display on dashboard
```

---

## 🌐 Frontend Integration

### Frontend Configuration

**`frontend/.env.local`:**
```env
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8000
```

### Frontend API Client

**`frontend/lib/backend-api.ts`:**
```typescript
const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';

export const backendApi = {
  startBot: async (userId: string) =>
    fetchBackend('/api/bot/start', { method: 'POST' }, userId),
  
  stopBot: async (userId: string) =>
    fetchBackend('/api/bot/stop', { method: 'POST' }, userId),
  
  getState: async (userId: string) =>
    fetchBackend('/api/bot/state', { method: 'GET' }, userId),
};
```

### API Routes (Next.js)

**`frontend/app/api/bot/control/route.ts`:**
```typescript
import { backendApi } from '@/lib/backend-api';

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const { action } = await request.json();

  if (action === 'active') {
    const response = await backendApi.startBot(userId);
    // Update Supabase for analytics
    await updateBotByUserId(userId, { status: 'active' });
    return NextResponse.json(response);
  } else {
    const response = await backendApi.stopBot(userId);
    await updateBotByUserId(userId, { status: 'inactive' });
    return NextResponse.json(response);
  }
}
```

---

## 📂 Session Management

### Session Pool Structure

```
sessions/
├── assigned/          # Active sessions (in use by users)
│   ├── session1.session
│   └── session2.session
│
├── unused/            # Available pool (ready to assign)
│   ├── session3.session
│   └── session4.session
│
├── banned/            # Banned sessions (do not assign)
│   └── session5.session
│
└── frozen/            # Frozen sessions (same as banned)
    └── session6.session
```

### Session Assignment Process

1. **User starts bot** → Backend checks `unused/` folder
2. **Select N sessions** (N = plan limit, e.g., 1 for STARTER, 3 for ENTERPRISE)
3. **Move sessions** from `unused/` to `assigned/`
4. **Assign API pairs** (max 7 sessions per API pair)
5. **Update users.json** with assigned sessions and API pairs

### Session Lifecycle

```
┌──────────┐
│  unused/ │
└────┬─────┘
     │ User starts bot
     ▼
┌──────────┐
│assigned/ │
└────┬─────┘
     │ Session banned (FloodWait, UserBannedError)
     ▼
┌──────────┐
│ banned/  │
└──────────┘
```

### Adding New Sessions

1. Place `.session` files in `sessions/unused/`
2. Backend automatically detects them on next assignment

---

## 🐛 Troubleshooting

### Issue: Backend Won't Start

**Symptom:** Server fails to start with error

**Fixes:**
1. Check Python version: `python --version` (must be 3.9+)
2. Reinstall dependencies: `pip install -r requirements.txt --force-reinstall`
3. Check port 8000 is free: `netstat -an | findstr 8000`
4. Check `data/users.json` syntax (must be valid JSON)

---

### Issue: Bot Status Shows "CRASHED"

**Symptom:** Frontend shows bot is running but status is "CRASHED"

**Meaning:** Bot is marked `running` in database but no heartbeat detected

**Fixes:**
1. Check scheduler is running: `GET /api/health` → `scheduler_running: true`
2. Check logs for errors: `backend/logs/`
3. Verify sessions exist: `ls -la backend/sessions/assigned/`
4. Restart backend: `python main.py`

---

### Issue: No Sessions Available

**Symptom:** Error: "No sessions available. Please contact support."

**Meaning:** `sessions/unused/` folder is empty

**Fixes:**
1. Add `.session` files to `sessions/unused/`
2. Check sessions weren't all moved to `banned/`
3. Move sessions back from `banned/` to `unused/` if needed

---

### Issue: JWT Authentication Fails

**Symptom:** `401 Unauthorized` errors

**Fixes:**
1. Verify `JWT_SECRET` in `.env` matches frontend
2. Check JWT expiration (refresh token)
3. Verify `user_id` is in JWT payload

---

### Issue: Read-Only Mode

**Symptom:** Error: "Backend is in read-only mode due to data corruption"

**Meaning:** `users.json` or `stats.json` has invalid JSON syntax

**Fixes:**
1. Check file syntax: `python -m json.tool backend/data/users.json`
2. Restore from backup: `backend/data/users.json.tmp`
3. Fix JSON manually
4. Restart backend

---

### Issue: Sessions Not Forwarding

**Symptom:** Bot running but no messages forwarded

**Checks:**
1. Verify `post_content` is set: `GET /api/bot/state`
2. Verify `groups` list is not empty: `GET /api/bot/state`
3. Check logs for FloodWait errors: `backend/logs/`
4. Verify post link format: `https://t.me/channel/123`

---

## 🚀 Production Deployment

### Environment Variables

```env
# Production .env
API_PORT=8000
JWT_SECRET=<strong-64-char-random-string>
FRONTEND_URLS=https://yourdomain.com,https://www.yourdomain.com
DELAY_BETWEEN_CYCLES=300
ENV=production
LOG_LEVEL=INFO
```

### Running with Uvicorn

```bash
# Production mode (no reload)
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
```

### Running as Service (Linux)

**`/etc/systemd/system/hqadz-backend.service`:**
```ini
[Unit]
Description=HQAdz Python Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/hqadz/backend
Environment="PATH=/var/www/hqadz/venv/bin"
ExecStart=/var/www/hqadz/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

**Enable service:**
```bash
sudo systemctl enable hqadz-backend
sudo systemctl start hqadz-backend
sudo systemctl status hqadz-backend
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Monitoring

1. **Health Check Endpoint:** `GET /api/health`
2. **Uptime Monitor:** Ping `/api/health` every 60 seconds
3. **Log Monitoring:** Monitor `backend/logs/` for errors
4. **Heartbeat Alerts:** Alert if `scheduler_running: false`

---

## 📚 Additional Documentation

- **AUDIT_REPORT.md** - Complete backend audit findings
- **ARCHITECTURE.md** - System architecture (if exists)
- **INTEGRATION.md** - Integration guide (if exists)
- **archive/docs/** - Legacy documentation (for reference only)

---

## 🤝 Support

For issues or questions:
1. Check **Troubleshooting** section above
2. Review **AUDIT_REPORT.md** for system internals
3. Check logs in `backend/logs/`
4. Contact system administrator

---

## ✅ System Health Checklist

Before deploying to production, verify:

- [ ] `.env` file created with strong `JWT_SECRET`
- [ ] `data/users.json` and `data/stats.json` exist
- [ ] Session files in `sessions/unused/`
- [ ] Backend starts without errors
- [ ] Health check returns `{"status": "healthy"}`
- [ ] Frontend can connect to backend
- [ ] JWT authentication works
- [ ] Bot can start/stop via API
- [ ] Messages forward to Telegram
- [ ] Logs are being written
- [ ] Scheduler is running

---

**Last Updated:** January 5, 2026  
**Version:** 1.0.0  
**Status:** Production-Ready ✅
