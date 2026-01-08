# BACKEND AUDIT REPORT
**Date:** January 5, 2026  
**Auditor:** Senior Backend Engineer  
**Scope:** Complete backend codebase analysis

---

## EXECUTIVE SUMMARY

The backend contains **SIGNIFICANT DUPLICATION** and **LEGACY CODE** that must be cleaned up. There are **THREE SEPARATE ENTRY POINTS** with conflicting API structures, but only **ONE** is actually used by the frontend.

### Critical Findings:
- ✅ **1 ACTIVE entry point** (`backend/main.py`)
- ❌ **2 DUPLICATE entry points** (`backend/api/main.py`, `backend/api_wrapper.py`)
- ❌ **1 LEGACY standalone bot** (`backend/Adbot/main.py` - 5470 lines)
- ❌ **Multiple requirements.txt files** (4 total, conflicting dependencies)
- ✅ **Clean data layer** (JSON-based, well-structured)
- ✅ **Good separation** between bot logic and API layer

---

## PHASE 1: FILE CLASSIFICATION

### 🟢 ACTIVE FILES (Production-Ready)

#### **Entry Point**
- `backend/main.py` - **PRIMARY ENTRY POINT** (FastAPI server)
  - Routes: `/api/bot/*`, `/api/sync/*`, `/api/health/*`
  - Calls bot scheduler on startup
  - Used by frontend

#### **Core Bot Logic** (`backend/bot/`)
- `scheduler.py` - Main scheduler loop (manages all users)
- `engine.py` - Telethon forwarding engine (shared by all users)
- `worker.py` - Execute user cycles
- `data_manager.py` - Read/write `users.json` and `stats.json`
- `session_manager.py` - Session assignment logic
- `api_pairs.py` - API pair assignment (7-session limit per pair)
- `heartbeat_manager.py` - Worker heartbeat tracking
- `log_saver.py` - Log management

#### **API Layer** (`backend/api/`)
- `bot_control.py` - **MAIN API** (start/stop/status/register-user)
- `health.py` - Health check endpoint
- `sync.py` - Dashboard state sync

#### **Data Storage** (`backend/data/`)
- `users.json` - **PRIMARY DATA STORE** (user configs, bot status, sessions)
- `stats.json` - User statistics (messages sent, success/failure rates)
- `groups.json` - Group configurations
- `default_groups.json` - Default group templates
- `*.example.json` - Example files for documentation

#### **Sessions** (`backend/sessions/`)
- `assigned/` - Sessions currently assigned to users
- `unused/` - Available session pool
- `banned/` - Banned/frozen sessions
- `frozen/` - (Same as banned?)

#### **Dependencies**
- `requirements.txt` - **PRIMARY** dependencies (FastAPI, Telethon, PyJWT)

---

### 🔴 DUPLICATE/UNUSED/LEGACY FILES

#### **Duplicate Entry Points** (NEVER CALLED BY FRONTEND)
- `backend/api/main.py` - **DUPLICATE** API wrapper
  - Routes: `/api/bot/*`, `/api/config/*`, `/api/logs/*`, etc.
  - Different structure than active API
  - Contains `ProcessManager` logic
  - **STATUS:** UNUSED - No frontend imports

- `backend/api_wrapper.py` - **DUPLICATE** standalone wrapper
  - Routes: `/api/adbot/*` (start/stop/status/logs/sync)
  - Different structure than active API
  - Contains subprocess management
  - **STATUS:** UNUSED - No frontend imports

#### **Legacy Standalone Bot**
- `backend/Adbot/main.py` - **LEGACY** standalone Telegram bot (5470 lines)
  - Old monolithic bot implementation
  - Has its own config.json, groups.txt, sessions folder
  - Completely separate from new architecture
  - **STATUS:** LEGACY - Not integrated with new system

- `backend/Adbot/others/` - **OLD TEST SCRIPTS**
  - `checker.py` - Session checker
  - `forwarder.py` - Old forwarding script
  - `frozen.py` - Frozen session handler
  - `scrapper.py` - Group scraper
  - `text.py` - Text utilities
  - **STATUS:** TEST/DEV - Not used in production

#### **Duplicate Requirements**
- `backend/requirements_api.txt` - **DUPLICATE** (unused)
- `backend/api/requirements.txt` - **DUPLICATE** (unused)
- `backend/Adbot/requirements.txt` - **LEGACY** (for old bot)

#### **Documentation/Analysis Files**
- `backend/ADBOT_ANALYSIS.md`
- `backend/API_SETUP.md`
- `backend/ARCHITECTURE.md`
- `backend/FIXES_APPLIED.md`
- `backend/IMPLEMENTATION_SUMMARY.md`
- `backend/INTEGRATION.md`
- `backend/README_API.md`
- `backend/README.md`
- `backend/SETUP.md`

**STATUS:** Keep these for reference, but consolidate into ONE README

#### **Misc Files**
- `backend/python_example.py` - Example script (DELETE)
- `backend/lib/groups.ts` - TypeScript file in Python backend (MOVE to frontend)

---

## PHASE 2: DATABASE & CONFIG VERIFICATION

### Data Storage Architecture

#### **Primary Storage: JSON Files**
Location: `backend/data/`

**users.json** - Main user configuration store
```json
{
  "users": {
    "user_id_123": {
      "assigned_sessions": ["session1.session", "session2.session"],
      "api_pairs": [{"api_id": "...", "api_hash": "..."}],
      "groups": ["-1001234567890", "@groupname"],
      "post_type": "link",
      "post_content": "https://t.me/channel/123",
      "bot_status": "running" | "stopped",
      "delay_between_posts": 5,
      "delay_between_cycles": 300,
      "plan_status": "active" | "expired" | "inactive",
      "execution_mode": "starter" | "enterprise",
      "total_cycle_minutes": 60
    }
  }
}
```

**stats.json** - User statistics
```json
{
  "users": {
    "user_id_123": {
      "total_posts": 100,
      "total_success": 95,
      "total_failures": 5,
      "total_flood_waits": 2,
      "total_messages_sent": 95,
      "last_activity": "2026-01-05T12:34:56"
    }
  }
}
```

#### **Files That READ Data:**
- `bot/data_manager.py` - Main data accessor (load_users, load_stats)
- `api/bot_control.py` - API endpoints read user data
- `api/sync.py` - Dashboard sync reads user data
- `api/health.py` - Health check reads active users
- `bot/scheduler.py` - Scheduler reads active users
- `bot/worker.py` - Worker reads user config

#### **Files That WRITE Data:**
- `bot/data_manager.py` - Main data writer (save_users, save_stats)
- `api/bot_control.py` - Updates user config (start/stop/register/update-post/update-groups)
- `bot/worker.py` - Updates stats after cycles

#### **Session Files:**
Telethon session files stored in:
- `backend/sessions/assigned/` - Active sessions
- `backend/sessions/unused/` - Available pool
- `backend/sessions/banned/` - Banned sessions
- `backend/sessions/frozen/` - Frozen sessions (duplicate of banned?)

Accessed by:
- `bot/session_manager.py` - Session assignment/movement

#### **Secondary Storage: Supabase/PostgreSQL**
Used by: Frontend Next.js
Tables:
- `users` - User accounts, authentication, plan info
- `adbots` - Adbot records (for dashboard display)
- `orders` - Payment orders
- `products` - Plan products

**NOT DIRECTLY ACCESSED BY PYTHON BACKEND**

---

## PHASE 3: FRONTEND CONNECTION CHECK

### Frontend → Backend API Flow

#### **Frontend Files That Call Python Backend:**

1. **`frontend/lib/backend-api.ts`** - **PRIMARY CONNECTOR**
   - URL: `NEXT_PUBLIC_BACKEND_API_URL` (http://localhost:8000)
   - Methods:
     - `registerUser(userId, email)` → `POST /api/bot/register-user`
     - `startBot(userId)` → `POST /api/bot/start`
     - `stopBot(userId)` → `POST /api/bot/stop`
     - `updatePost(userId, postType, postContent)` → `POST /api/bot/update-post`
     - `updateGroups(userId, groups)` → `POST /api/bot/update-groups`
     - `getState(userId)` → `GET /api/bot/state`

2. **`frontend/lib/python-backend.ts`** - **UNUSED CONNECTOR**
   - URL: `PYTHON_BACKEND_URL` (http://localhost:8000)
   - Methods:
     - `startAdbot(config)` → `POST /api/adbot/start` ❌ NOT IMPLEMENTED
     - `stopAdbot(adbotId)` → `POST /api/adbot/stop` ❌ NOT IMPLEMENTED
     - `getAdbotStatus(adbotId)` → `GET /api/adbot/status/{id}` ❌ NOT IMPLEMENTED
     - `getAdbotLogs(adbotId)` → `GET /api/adbot/logs/{id}` ❌ NOT IMPLEMENTED
   - **STATUS:** UNUSED - These endpoints don't exist in active backend

3. **`frontend/app/api/bot/control/route.ts`**
   - Calls: `backendApi.startBot(userId)` ✅
   - Calls: `backendApi.stopBot(userId)` ✅

4. **`frontend/app/api/admin/system/health/route.ts`**
   - Calls: `${PYTHON_BACKEND_URL}/api/health` ✅
   - Calls: `${PYTHON_BACKEND_URL}/api/bot/health` ✅

#### **Python Backend Endpoints (ACTIVE):**

| Endpoint | Method | Called By Frontend | Status |
|----------|--------|-------------------|--------|
| `/api/bot/start` | POST | ✅ Yes (`backend-api.ts`) | **ACTIVE** |
| `/api/bot/stop` | POST | ✅ Yes (`backend-api.ts`) | **ACTIVE** |
| `/api/bot/register-user` | POST | ✅ Yes (`backend-api.ts`) | **ACTIVE** |
| `/api/bot/update-post` | POST | ✅ Yes (`backend-api.ts`) | **ACTIVE** |
| `/api/bot/update-groups` | POST | ✅ Yes (`backend-api.ts`) | **ACTIVE** |
| `/api/bot/state` | GET | ✅ Yes (`backend-api.ts`) | **ACTIVE** |
| `/api/bot/status` | GET | ✅ Yes (`backend-api.ts`) | **ACTIVE** |
| `/api/bot/health` | GET | ✅ Yes (health check) | **ACTIVE** |
| `/api/health` | GET | ✅ Yes (health check) | **ACTIVE** |
| `/api/sync/state` | GET | ⚠️ Maybe (not examined) | **ACTIVE** |

#### **Python Backend Endpoints (UNUSED):**

| Endpoint | File | Status |
|----------|------|--------|
| `/api/adbot/start` | `api_wrapper.py` | ❌ UNUSED |
| `/api/adbot/stop` | `api_wrapper.py` | ❌ UNUSED |
| `/api/adbot/status/{id}` | `api_wrapper.py` | ❌ UNUSED |
| `/api/adbot/logs/{id}` | `api_wrapper.py` | ❌ UNUSED |
| `/api/adbot/sync` | `api_wrapper.py` | ❌ UNUSED |
| `/api/config/*` | `api/routes/config.py` | ❌ UNUSED |
| `/api/logs/*` | `api/routes/logs.py` | ❌ UNUSED |
| `/api/stats/*` | `api/routes/stats.py` | ❌ UNUSED |
| `/api/groups/*` | `api/routes/groups.py` | ❌ UNUSED |
| `/api/sessions/*` | `api/routes/sessions.py` | ❌ UNUSED |

---

## PHASE 4: CLEAN STRUCTURE PROPOSAL

### Current Structure (Messy):
```
backend/
├── main.py ✅ ACTIVE
├── api_wrapper.py ❌ DUPLICATE
├── python_example.py ❌ DELETE
├── api/
│   ├── main.py ❌ DUPLICATE
│   ├── bot_control.py ✅ ACTIVE
│   ├── health.py ✅ ACTIVE
│   ├── sync.py ✅ ACTIVE
│   ├── core/ ⚠️ EXAMINE
│   └── routes/ ❌ UNUSED
├── bot/ ✅ ACTIVE
├── Adbot/ ❌ LEGACY
├── data/ ✅ ACTIVE
├── sessions/ ✅ ACTIVE
├── lib/ ❌ WRONG LOCATION
├── requirements.txt ✅ ACTIVE
├── requirements_api.txt ❌ DUPLICATE
└── [9 markdown docs] ⚠️ CONSOLIDATE
```

### Proposed Clean Structure:
```
backend/
├── main.py                    # Entry point (FastAPI app)
├── requirements.txt           # Dependencies
├── .env.example              # Environment template
├── README.md                 # COMPREHENSIVE DOCUMENTATION
│
├── api/                      # HTTP API layer
│   ├── __init__.py
│   ├── bot.py                # Bot control endpoints (start/stop/status)
│   ├── sync.py               # Dashboard sync
│   ├── health.py             # Health check
│   └── auth.py               # JWT verification middleware
│
├── bot/                      # Bot execution engine
│   ├── __init__.py
│   ├── scheduler.py          # Main scheduler loop
│   ├── worker.py             # Cycle executor
│   ├── engine.py             # Telethon forwarding logic
│   ├── session_manager.py    # Session assignment
│   ├── api_pairs.py          # API pair management
│   ├── heartbeat_manager.py  # Worker heartbeat
│   └── log_saver.py          # Log management
│
├── storage/                  # Data persistence layer
│   ├── __init__.py
│   ├── data_manager.py       # JSON file operations
│   └── models.py             # Data schemas/types
│
├── data/                     # Runtime data (JSON files)
│   ├── users.json
│   ├── stats.json
│   ├── groups.json
│   └── *.example.json
│
├── sessions/                 # Telethon session files
│   ├── assigned/
│   ├── unused/
│   ├── banned/
│   └── frozen/
│
├── logs/                     # Application logs
│   └── (user logs generated at runtime)
│
├── scripts/                  # Utility scripts (if needed)
│   └── (one-off maintenance scripts)
│
└── archive/                  # LEGACY CODE (for reference)
    ├── Adbot/                # Old standalone bot
    ├── api_wrapper.py        # Old API wrapper
    └── api/
        ├── main.py           # Old API entry point
        └── routes/           # Old unused routes
```

---

## PHASE 5: ENV CLEANUP

### Current State:
- ❌ NO `.env` file found in backend
- ✅ `env.example` exists at project root
- ⚠️ Environment variables hardcoded with defaults in code

### Environment Variables Used:

**From `backend/main.py`:**
- `FRONTEND_URLS` - CORS origins (default: "http://localhost:3000")
- `DELAY_BETWEEN_CYCLES` - Cycle delay in seconds (default: "300")
- `API_PORT` - Server port (default: "8000")

**From `api/bot_control.py`:**
- `JWT_SECRET` - JWT signing key (default: "your-secret-key") ⚠️ INSECURE

**From frontend `lib/backend-api.ts`:**
- `NEXT_PUBLIC_BACKEND_API_URL` - Backend URL (default: "http://localhost:8000")

**From frontend `app/api/admin/system/health/route.ts`:**
- `PYTHON_BACKEND_URL` - Backend URL (default: "http://localhost:8000")

### Required `.env` File:
```env
# Python Backend Configuration
API_PORT=8000
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
FRONTEND_URLS=http://localhost:3000,https://yourdomain.com

# Bot Configuration
DELAY_BETWEEN_CYCLES=300
DELAY_BETWEEN_POSTS=5

# Logging
LOG_LEVEL=INFO
```

---

## PHASE 6: CRITICAL ISSUES FOUND

### 🔴 Security Issues:
1. **Default JWT Secret** - `JWT_SECRET` defaults to "your-secret-key" (CRITICAL)
2. **No environment validation** - Missing required env vars don't cause startup failure
3. **CORS allows all origins** in `api_wrapper.py` (but file is unused)

### 🔴 Duplication Issues:
1. **3 entry points** - Only 1 used, others are dead code
2. **4 requirements files** - Conflicting dependencies
3. **2 session folders** - `backend/sessions/` and `backend/Adbot/sessions/`
4. **Multiple README files** - 9 markdown docs, confusing structure

### 🔴 Legacy Code Issues:
1. **Adbot folder** - 5470-line monolithic bot (unused)
2. **api/routes/** - 8 unused route files
3. **TypeScript in Python backend** - `lib/groups.ts` in wrong place

### 🔴 Unused Core Files:
1. **`api/core/auth.py`** - Only used by duplicate `api/main.py` and unused routes
2. **`api/core/config_loader.py`** - Loads `Adbot/config.json` (legacy), unused
3. **`api/core/process_manager.py`** - Controls `Adbot/main.py` process (legacy), unused
4. **STATUS:** All `api/core/` files are UNUSED (tied to duplicate API wrapper)

### 🟡 Potential Issues:
1. **Windows file locking** - `data_manager.py` uses Unix fcntl (no-op on Windows)
2. **Session folder structure** - `banned/` and `frozen/` appear to be duplicates

---

## RECOMMENDATIONS

### Immediate Actions (Critical):
1. **DELETE** `api_wrapper.py`, `api/main.py` (duplicate entry points)
2. **MOVE** `backend/Adbot/` to `backend/archive/Adbot/` (legacy code)
3. **DELETE** `requirements_api.txt`, `api/requirements.txt`, `Adbot/requirements.txt`
4. **CREATE** `.env` file with secure JWT_SECRET
5. **CONSOLIDATE** 9 markdown docs into ONE README.md

### Structural Refactoring:
1. **Rename** `bot/data_manager.py` → `storage/data_manager.py`
2. **Move** `api/core/auth.py` → `api/auth.py` (flatten structure)
3. **Delete** `lib/groups.ts` (move to frontend if needed)
4. **Delete** `python_example.py`
5. **Clean up** `api/routes/` (8 unused files)

### Documentation:
1. Create comprehensive `README.md` with:
   - System architecture diagram
   - API endpoint documentation
   - Data flow explanation
   - Setup instructions
   - Troubleshooting guide

---

## NEXT STEPS

1. ✅ Complete this audit report
2. ⏳ Examine `api/core/` folder contents
3. ⏳ Create comprehensive README.md
4. ⏳ Refactor file structure
5. ⏳ Remove duplicate/legacy code
6. ⏳ Create `.env` and `.env.example`
7. ⏳ Test backend startup
8. ⏳ Verify frontend integration still works

---

**END OF AUDIT REPORT**

