# LOCAL DEVELOPMENT & TESTING GUIDE

This guide provides complete, step-by-step instructions for setting up and testing the HQAdz application locally. It assumes you have never seen this codebase before.

---

## ⚠️ CRITICAL WARNING - READ THIS FIRST

**There are TWO backend entry points in this repo. ONLY ONE starts the scheduler.**

**✅ USE THIS (REQUIRED):**
```bash
cd backend
python main.py
```

**❌ DO NOT USE:**
- `python -m backend.api.main`
- `backend/api/start.sh`
- `backend/api/start.bat`

These start the API but **NOT the scheduler**. Bots will appear "running" but will **never execute**.

**Why This Matters:**
- The scheduler is required for bots to actually run cycles
- Without it, bot status shows "running" but nothing happens (silent failure)
- Always use `backend/main.py` for local development

---

## TABLE OF CONTENTS

1. [Part 1 - Environment Variables](#part-1---environment-variables)
2. [Part 2 - Filesystem Requirements](#part-2---filesystem-requirements)
3. [Part 3 - Authentication & Supabase Requirements](#part-3---authentication--supabase-requirements)
4. [Part 4 - Session & API Pair Requirements](#part-4---session--api-pair-requirements)
5. [Part 5 - Startup Commands](#part-5---startup-commands)
6. [Part 6 - First Test Flow (Smoke Test)](#part-6---first-test-flow-smoke-test)
7. [Part 7 - Common Failures & Fixes](#part-7---common-failures--fixes)

---

## PART 1 - ENVIRONMENT VARIABLES

### Frontend Environment Variables

**Location:** `frontend/.env.local` (create this file)

**Required Variables:**

```env
# Supabase Configuration (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Backend API Configuration (REQUIRED - must match backend JWT_SECRET)
JWT_SECRET=your-secret-key-change-this
# OR use:
# SUPABASE_JWT_SECRET=your-secret-key-change-this

# Backend API URL (OPTIONAL - has default)
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8000

# Application URLs (REQUIRED)
NEXT_PUBLIC_BASE_URL=http://localhost:3000
IPN_CALLBACK_URL=http://localhost:3000/api/payment/webhook

# Payment Configuration (OPTIONAL for testing)
NOWPAYMENTS_API_KEY=your-nowpayments-api-key-here
NOWPAYMENTS_API_URL=https://api.nowpayments.io/v1
```

**Variable Details:**

| Variable | Required | Description | Notes |
|----------|----------|-------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Yes | Supabase project URL | Get from Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Yes | Supabase anonymous/public key | Safe to expose in client-side code |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Yes | Supabase service role key | ⚠️ SERVER-SIDE ONLY - Never expose in client |
| `JWT_SECRET` | ✅ Yes | JWT secret for backend auth | **MUST MATCH backend JWT_SECRET** |
| `NEXT_PUBLIC_BACKEND_API_URL` | ❌ No | Backend API URL | Default: `http://localhost:8000` |
| `NEXT_PUBLIC_BASE_URL` | ✅ Yes | Frontend base URL | Local: `http://localhost:3000` |
| `IPN_CALLBACK_URL` | ✅ Yes* | Payment webhook URL | *Required if using payments |
| `NOWPAYMENTS_API_KEY` | ❌ No* | NowPayments API key | *Required for payment functionality |
| `NOWPAYMENTS_API_URL` | ❌ No | NowPayments API endpoint | Default: `https://api.nowpayments.io/v1` |

**Safe Dummy Values for Local Testing:**

```env
# Minimal working configuration for local testing
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy-service
JWT_SECRET=local-dev-secret-key-12345
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8000
NEXT_PUBLIC_BASE_URL=http://localhost:3000
IPN_CALLBACK_URL=http://localhost:3000/api/payment/webhook
```

**⚠️ IMPORTANT:** `JWT_SECRET` **MUST MATCH** between frontend and backend. If they don't match, authentication will fail.

### Backend Environment Variables

**Location:** `backend/api/.env` (create this file)

**Required Variables:**

```env
# API Configuration (OPTIONAL - has defaults)
API_PORT=8000
ENV=development

# Authentication (REQUIRED - must match frontend JWT_SECRET)
JWT_SECRET=your-secret-key-change-this

# Frontend URL for CORS (OPTIONAL - has default)
# Note: backend/main.py uses FRONTEND_URLS (plural, comma-separated)
#       backend/api/main.py uses FRONTEND_URL (singular)
# If using backend/main.py (recommended), use:
FRONTEND_URLS=http://localhost:3000
# If using backend/api/main.py, use:
# FRONTEND_URL=http://localhost:3000

# API Key Authentication (OPTIONAL - has default, deprecated in favor of JWT)
ADBOT_API_KEY=your-secret-api-key-change-in-production
```

**Variable Details:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | ✅ Yes | `"your-jwt-secret"` | **MUST MATCH frontend JWT_SECRET** |
| `API_PORT` | ❌ No | `8000` | Backend API server port |
| `ENV` | ❌ No | `"development"` | Environment mode (`development` or `production`) |
| `FRONTEND_URLS` | ❌ No | `"http://localhost:3000"` | Frontend URLs for CORS (comma-separated, for `backend/main.py`) |
| `FRONTEND_URL` | ❌ No | `"http://localhost:3000"` | Frontend URL for CORS (for `backend/api/main.py` - not recommended) |
| `DELAY_BETWEEN_CYCLES` | ❌ No | `"300"` | Seconds between bot cycles (default: 300 = 5 minutes) |
| `ADBOT_API_KEY` | ❌ No | `"your-secret-api-key-change-in-production"` | Legacy API key auth (deprecated) |

**Safe Dummy Values for Local Testing:**

```env
# Minimal working configuration (for backend/main.py)
JWT_SECRET=local-dev-secret-key-12345
API_PORT=8000
ENV=development
FRONTEND_URLS=http://localhost:3000
DELAY_BETWEEN_CYCLES=300
```

**⚠️ CRITICAL:** `JWT_SECRET` in backend **MUST MATCH** `JWT_SECRET` in frontend `.env.local`. They are the same value!

---

## PART 2 - FILESYSTEM REQUIREMENTS

### Required Files

#### 1. `backend/Adbot/config.json` (REQUIRED)

**Path:** `backend/Adbot/config.json`

**Status:** Must exist before backend can start

**Expected Structure:**

```json
{
  "post_link": [
    "t.me/HqAdzz/6"
  ],
  "delay_between_posts": 5,
  "delay_between_cycles": 300,
  "default_chatlist_link": "https://t.me/addlist/...",
  "accounts": [
    {
      "api_id": "24881145",
      "api_hash": "d625c51e93f6b7367c1ff263cb5f7c89"
    }
  ],
  "controller_bot_token": "6546099428:AAGJqeKsg0DLHKTKIZsVZwVZVNSqbOZjO48",
  "controller_authorized_user_ids": [5495140274],
  "log_group_id": -1002213570018,
  "log_group_link": "https://t.me/owladslogs"
}
```

**Auto-created?** No - Must be created manually

**Minimal Example for Testing:**

```json
{
  "post_link": ["t.me/example/1"],
  "delay_between_posts": 5,
  "delay_between_cycles": 300,
  "default_chatlist_link": "https://t.me/addlist/example",
  "accounts": [
    {
      "api_id": "12345678",
      "api_hash": "abcdef1234567890abcdef1234567890"
    }
  ],
  "controller_bot_token": "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz",
  "controller_authorized_user_ids": [123456789],
  "log_group_id": -1001234567890,
  "log_group_link": "https://t.me/example"
}
```

#### 2. `backend/data/users.json` (AUTO-CREATED)

**Path:** `backend/data/users.json`

**Status:** Auto-created if missing, but directory must exist

**Expected Structure:**

```json
{
  "users": {
    "user-id-here": {
      "assigned_sessions": ["session1.session"],
      "api_pairs": [0],
      "groups": ["-1001234567890"],
      "post_type": "link",
      "post_content": "t.me/example/1",
      "bot_status": "stopped",
      "delay_between_posts": 5,
      "delay_between_cycles": 300
    }
  }
}
```

**Auto-created?** Yes - Created automatically with empty structure if missing

**Initial Content:** If file doesn't exist, it will be created as:

```json
{
  "users": {}
}
```

#### 3. `backend/data/stats.json` (AUTO-CREATED)

**Path:** `backend/data/stats.json`

**Status:** Auto-created if missing

**Expected Structure:**

```json
{
  "users": {
    "user-id-here": {
      "total_posts": 0,
      "total_success": 0,
      "total_failures": 0,
      "total_flood_waits": 0,
      "total_messages_sent": 0,
      "last_activity": null
    }
  }
}
```

**Auto-created?** Yes - Created automatically if missing

**Initial Content:** Empty object `{}` if missing

#### 4. `backend/data/api_pairs.json` (OPTIONAL)

**Path:** `backend/data/api_pairs.json`

**Status:** Optional - Uses defaults from `config.json` if missing

**Expected Structure:**

```json
{
  "pairs": [
    {
      "api_id": "24881145",
      "api_hash": "d625c51e93f6b7367c1ff263cb5f7c89"
    },
    {
      "api_id": "25170767",
      "api_hash": "d512fd74809a4ca3cd59078eef73afcd"
    }
  ]
}
```

**Auto-created?** No - Uses defaults from `backend/Adbot/config.json` if missing

**Behavior:** If file doesn't exist, system loads API pairs from `backend/Adbot/config.json` → `accounts` array

### Required Directories

#### 1. `backend/data/` (REQUIRED)

**Path:** `backend/data/`

**Status:** Auto-created if missing

**Contents:**
- `users.json` (auto-created)
- `stats.json` (auto-created)
- `api_pairs.json` (optional)
- `groups.json` (optional, for legacy support)
- `default_groups.json` (optional)

#### 2. `backend/sessions/unused/` (REQUIRED for testing)

**Path:** `backend/sessions/unused/`

**Status:** Auto-created if missing, but **you must place session files here manually**

**Purpose:** Pool of available session files

**Contents:**
- `.session` files (Telegram session files)
- `.session-journal` files (optional, auto-created by Telethon)

**Example:**
```
backend/sessions/unused/
  ├── +1234567890.session
  ├── +1234567890.session-journal
  ├── +9876543210.session
  └── +9876543210.session-journal
```

**Auto-created?** Yes - Directory is auto-created, but **you must manually add session files**

#### 3. `backend/sessions/assigned/` (AUTO-CREATED)

**Path:** `backend/sessions/assigned/`

**Status:** Auto-created when sessions are assigned to users

**Purpose:** Stores session files assigned to specific users

**Structure:**
```
backend/sessions/assigned/
  └── {user-id}/
      ├── session1.session
      ├── session1.session-journal
      ├── session2.session
      └── session2.session-journal
```

**Auto-created?** Yes - Created automatically when sessions are assigned

#### 4. `backend/sessions/banned/` (AUTO-CREATED)

**Path:** `backend/sessions/banned/`

**Status:** Auto-created if missing

**Purpose:** Stores banned/frozen session files

**Auto-created?** Yes

#### 5. `backend/Adbot/logs/` (AUTO-CREATED)

**Path:** `backend/Adbot/logs/`

**Status:** Auto-created if missing

**Purpose:** Stores daily log files from AdBot

**Auto-created?** Yes

#### 6. `backend/Adbot/groups/` (OPTIONAL)

**Path:** `backend/Adbot/groups/`

**Status:** Optional - For backup/historical group lists

**Auto-created?** No - Only created if groups are backed up

### File Creation Summary

| File/Directory | Path | Auto-Created? | Must Exist Before Startup? |
|----------------|------|---------------|---------------------------|
| `backend/Adbot/config.json` | `backend/Adbot/config.json` | ❌ No | ✅ Yes |
| `backend/data/users.json` | `backend/data/users.json` | ✅ Yes | ❌ No |
| `backend/data/stats.json` | `backend/data/stats.json` | ✅ Yes | ❌ No |
| `backend/data/api_pairs.json` | `backend/data/api_pairs.json` | ❌ No | ❌ No (uses defaults) |
| `backend/data/` | `backend/data/` | ✅ Yes | ❌ No |
| `backend/sessions/unused/` | `backend/sessions/unused/` | ✅ Yes | ❌ No (but empty = no sessions) |
| `backend/sessions/assigned/` | `backend/sessions/assigned/` | ✅ Yes | ❌ No |
| `backend/sessions/banned/` | `backend/sessions/banned/` | ✅ Yes | ❌ No |

---

## PART 3 - AUTHENTICATION & SUPABASE REQUIREMENTS

### Authentication Overview

The system uses a two-tier authentication system:

1. **Access Code Authentication (Frontend → Supabase)**
   - User enters access code on `/access` page
   - Frontend queries Supabase `users` table
   - Returns user data if code matches
   - Creates simple token for frontend session

2. **JWT Authentication (Frontend → Backend API)**
   - Frontend generates JWT with user info
   - Backend validates JWT on every API call
   - JWT includes `user_id`, `plan_status`, `plan_limits`
   - Used for all backend API endpoints

### Supabase Dependency

**Supabase is MANDATORY** - the frontend cannot run without it.

**Why Required:**
- Access code authentication queries Supabase `users` table
- User data (email, role, plan_status) stored in Supabase
- Payment records stored in Supabase
- Bot statistics stored in Supabase

**What Happens Without Supabase:**
- Frontend shows errors: "Supabase admin client not configured"
- Access code login fails with 500 error
- Cannot authenticate any users
- Dashboard cannot load user data

**Setup Requirements:**
1. Supabase project must exist
2. Database schema must be executed (`frontend/supabase/schema.sql`)
3. Three environment variables must be set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

**Default Access Codes (from schema.sql):**
- Admin: `ADMIN123` (email: admin@hqadz.com, plan_status: active)
- User: `USER123` (email: user@example.com, plan_status: inactive)

**Note:** These are default codes for testing. Change them in production!

### JWT Secret Matching

**CRITICAL:** `JWT_SECRET` must match exactly between frontend and backend.

**Frontend:** `frontend/.env.local`
```env
JWT_SECRET=local-dev-secret-key-12345
```

**Backend:** `backend/api/.env`
```env
JWT_SECRET=local-dev-secret-key-12345
```

**What Happens if Mismatched:**
- All backend API calls return `401 Unauthorized`
- Error: "Invalid token" or "Authentication failed"
- User cannot:
  - Register in backend
  - Start/stop bot
  - Update configuration
  - View bot state

**How to Verify:**
1. Check both `.env` files have `JWT_SECRET` set
2. Ensure values are identical (case-sensitive, no extra spaces)
3. Restart both frontend and backend after changes
4. Clear browser localStorage and cookies
5. Log in again

### Plan Status Enforcement

**Plan Status Values:**
- `"active"`: Bot can run
- `"inactive"`: Bot cannot start (403 error)
- `"expired"`: Bot cannot start (403 error)
- `null`/`undefined`: Allowed (backward compatibility)

**Enforcement Points:**
1. **At Bot Start:** Backend checks JWT `plan_status` before allowing start
2. **During Runtime:** Scheduler checks stored `plan_status` and auto-stops expired/inactive plans
3. **On Backend Restart:** All bots reset to "stopped" (users must restart manually)

**How to Update Plan Status:**
1. Go to Supabase Dashboard → Table Editor → `users` table
2. Find user record
3. Update `plan_status` column
4. User must log out and log back in (to get new JWT)
5. User can then start bot

---

## PART 4 - SESSION & API PAIR REQUIREMENTS

### Session Files

#### Where to Place Sessions

**Location:** `backend/sessions/unused/`

**Format:** `.session` files (Telethon session files)

**Naming:** Typically phone numbers (e.g., `+1234567890.session`), but any name works

**Required Files:**
- `.session` file (required)
- `.session-journal` file (optional, auto-created by Telethon)

#### Minimum Setup for Testing

**Minimum Working Setup:**
- **1 API pair** (from `config.json` → `accounts` array)
- **1 session file** in `backend/sessions/unused/`

**Example:**
```
backend/sessions/unused/
  └── test_session.session
```

**What Happens if Missing:**

- **No sessions in `unused/`:** Bot cannot start - will return error "No available sessions"
- **No API pairs:** System uses defaults from `config.json` → `accounts` array
- **Sessions assigned but file missing:** Bot will fail when trying to use that session

#### API ID / API Hash Requirements

**Location:** `backend/Adbot/config.json` → `accounts` array

**Format:**
```json
{
  "accounts": [
    {
      "api_id": "12345678",
      "api_hash": "abcdef1234567890abcdef1234567890"
    }
  ]
}
```

**Where to Get:**
1. Go to https://my.telegram.org/auth
2. Log in with your phone number
3. Go to "API development tools"
4. Create a new application (if needed)
5. Copy `api_id` and `api_hash`

**Minimal Working Setup:**
- **1 API pair** in `config.json` → `accounts` array
- This pair will be used for all sessions

#### API Pair Limits

**Hard Limit:** **7 sessions per API pair**

**Behavior:**
- System automatically distributes sessions across pairs
- If you need 10 sessions and have 2 pairs:
  - Pair 1: 7 sessions (max)
  - Pair 2: 3 sessions
- If all pairs are at capacity, new sessions cannot be assigned

**Example:**
- **5 API pairs** = Maximum **35 sessions** (5 × 7)
- **1 API pair** = Maximum **7 sessions**

#### Session Assignment Flow

1. **User starts bot for first time:**
   - System checks `users.json` for user's `assigned_sessions`
   - If empty, assigns sessions from `unused/` pool
   - Moves session files from `unused/` → `assigned/{user-id}/`
   - Assigns API pairs based on availability (7 per pair limit)

2. **Sessions remain assigned:**
   - Once assigned, sessions stay with the user
   - On server restart, assigned sessions persist (stored in `users.json`)
   - User doesn't need to re-assign sessions

3. **Session banning:**
   - If session is banned/frozen, moved to `banned/` directory
   - System can automatically replace with new session from `unused/` pool
   - Replacement happens on next bot start

---

## PART 5 - STARTUP COMMANDS

### Prerequisites

**Python:**
- Python 3.7+ required
- Check: `python --version` or `python3 --version`

**Node.js:**
- Node.js 18+ recommended
- Check: `node --version`
- npm included with Node.js

### Backend Setup & Startup

#### 1. Install Backend Dependencies

```bash
# Navigate to backend/api directory
cd backend/api

# Install Python dependencies for FastAPI wrapper
pip install -r requirements.txt

# Also install AdBot dependencies (required for bot execution)
cd ../Adbot
pip install -r requirements.txt

# Return to project root
cd ../..
```

**Note:** Both `backend/api/requirements.txt` and `backend/Adbot/requirements.txt` must be installed. The API wrapper depends on AdBot's dependencies (Telethon, etc.).

**Expected Output:**
- Packages install successfully
- No errors about missing packages

#### 2. Create Backend Environment File

```bash
# Create .env file in backend/api/
cd backend/api
# Windows (PowerShell):
New-Item -Path .env -ItemType File
# Linux/Mac:
touch .env
```

**Edit `backend/api/.env`:**
```env
JWT_SECRET=local-dev-secret-key-12345
API_PORT=8000
ENV=development
FRONTEND_URLS=http://localhost:3000
DELAY_BETWEEN_CYCLES=300
```

**Note:** If using `backend/main.py` (recommended), use `FRONTEND_URLS` (plural, comma-separated). If using `backend/api/main.py` (not recommended), use `FRONTEND_URL` (singular).

#### 3. Verify Backend Config File Exists

```bash
# Check that config.json exists
ls backend/Adbot/config.json
# Should show: backend/Adbot/config.json exists
```

**If missing:** Create `backend/Adbot/config.json` (see Part 2)

#### 4. Start Backend Server

**⚠️ CRITICAL: There are TWO backend entry points. ONLY ONE starts the scheduler.**

**✅ USE THIS (REQUIRED - Starts scheduler):**

```bash
# From project root
cd backend
python main.py
```

**OR using uvicorn directly:**

```bash
# From project root
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**❌ DO NOT USE THESE (No scheduler - bots won't execute):**

```bash
# WRONG - Does NOT start scheduler
python -m backend.api.main

# WRONG - Does NOT start scheduler
backend\api\start.bat

# WRONG - Does NOT start scheduler
bash backend/api/start.sh
```

**Why This Matters:**
- `backend/main.py` starts the scheduler automatically (required for bot execution)
- `backend/api/main.py` is a wrapper API only - no scheduler
- If you use the wrong entry point:
  - ✅ Backend starts successfully
  - ✅ Frontend can connect
  - ✅ You can start bots (status = "running")
  - ❌ **Scheduler never starts**
  - ❌ **Bots never execute cycles** (silent failure)
  - ❌ **No error messages** - just nothing happens

**Note:** The scheduler starts automatically when using `backend/main.py`. It runs in the background and checks for active users every 2 seconds.

**Expected Output (using `backend/main.py`):**
```
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Backend restart - reset X bot(s) to stopped state  # (if bots were running)
```

**⚠️ VERIFICATION:** After starting, check that scheduler started:
- Look for scheduler activity in logs (no explicit message, but it's running)
- Try starting a bot - if scheduler is running, cycles will execute
- If using wrong entry point, bot status will be "running" but nothing happens

**Important:** On backend startup, all bots are automatically reset to "stopped" state. Users must manually restart their bots after a backend restart.

**Success Indicators:**
- ✅ "AdBot found at ..."
- ✅ "Uvicorn running on http://0.0.0.0:8000"
- ✅ No error messages about missing files

**Port:** Default is `8000` (configurable via `API_PORT` env var)

#### 5. Verify Backend Health

**In a new terminal:**
```bash
# Health check (no auth required)
curl http://localhost:8000/health

# Expected response:
# {"status":"healthy","bot_running":false,"bot_pid":null}
```

### Frontend Setup & Startup

#### 1. Install Frontend Dependencies

```bash
# Navigate to frontend directory
cd frontend

# Install Node.js dependencies
npm install
```

**Expected Output:**
- Packages install successfully
- `node_modules/` directory created
- No critical errors

#### 2. Create Frontend Environment File

```bash
# Create .env.local file in frontend/
# Windows (PowerShell):
New-Item -Path .env.local -ItemType File
# Linux/Mac:
touch .env.local
```

**Edit `frontend/.env.local`:**
```env
# Supabase (REQUIRED - cannot be skipped, frontend depends on it)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT Secret (MUST MATCH backend - critical for authentication)
JWT_SECRET=local-dev-secret-key-12345
# OR use:
# SUPABASE_JWT_SECRET=local-dev-secret-key-12345

# Backend API URL (optional - has default)
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8000

# Application URLs (required)
NEXT_PUBLIC_BASE_URL=http://localhost:3000
IPN_CALLBACK_URL=http://localhost:3000/api/payment/webhook

# Payment Configuration (optional for testing)
NOWPAYMENTS_API_KEY=your-nowpayments-api-key-here
NOWPAYMENTS_API_URL=https://api.nowpayments.io/v1

# Email Configuration (optional - only if using email features)
SMTP_HOST=mail.spacemail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_FROM=your-email@example.com
SMTP_FROM_NAME=HQAdz
```

**⚠️ CRITICAL:** 
- `JWT_SECRET` must match the value in `backend/api/.env` exactly
- Supabase is REQUIRED - the frontend cannot run without it (access code authentication depends on Supabase)

#### 3. Set Up Supabase Database (REQUIRED - Cannot Skip)

**Supabase is MANDATORY** - the frontend authentication system depends on it.

**Setup Steps:**

1. **Create Supabase account:** https://supabase.com
2. **Create new project:**
   - Choose a name (e.g., "HQAdz")
   - Set a strong database password (save it securely!)
   - Choose a region closest to you
   - Wait 1-2 minutes for project creation

3. **Run SQL schema:**
   - Go to Supabase Dashboard → SQL Editor
   - Click "New query"
   - Open `frontend/supabase/schema.sql` from this project
   - Copy the entire contents
   - Paste into SQL Editor
   - Click "Run" (or press Ctrl+Enter)
   - You should see "Success. No rows returned"

4. **Get credentials:**
   - Go to Settings → API
   - **Project URL:** Copy the URL under "Project URL" → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key:** Copy from "Project API keys" → "anon public" → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key:** Copy from "Project API keys" → "service_role" → `SUPABASE_SERVICE_ROLE_KEY`
     - ⚠️ **NEVER expose this key in client-side code!**

5. **Verify setup:**
   - Go to Table Editor in Supabase dashboard
   - You should see tables: `users`, `payments`, `bots`, `access_codes`
   - The `users` table should have 2 default entries (from schema.sql):
     - Admin: `ADMIN123` (email: admin@hqadz.com)
     - User: `USER123` (email: user@example.com)

**See `frontend/SUPABASE_SETUP.md` for detailed instructions**

**⚠️ CRITICAL:** Without Supabase, the frontend cannot authenticate users. Access code login will fail.

#### 4. Start Frontend Development Server

```bash
# From frontend directory
npm run dev
```

**Expected Output:**
```
▲ Next.js 16.1.1
- Local:        http://localhost:3000
- ready started server on 0.0.0.0:3000, url: http://localhost:3000
```

**Success Indicators:**
- ✅ "ready started server on 0.0.0.0:3000"
- ✅ No critical errors
- ✅ Can open http://localhost:3000 in browser

**Port:** Default is `3000` (Next.js default)

### Startup Order

**Recommended Order:**
1. **Start Backend First** (allows frontend to connect immediately)
2. **Start Frontend Second** (connects to backend on startup)

**Why This Order:**
- Backend may take a moment to initialize
- Frontend will immediately attempt to connect to backend
- Starting backend first prevents connection errors

**Both can run simultaneously** in separate terminals.

---

## PART 6 - FIRST TEST FLOW (SMOKE TEST)

### Prerequisites Checklist

Before starting the test flow, verify:

- ✅ Backend `.env` file exists with `JWT_SECRET` set
- ✅ Frontend `.env.local` file exists with matching `JWT_SECRET`
- ✅ `backend/Adbot/config.json` exists
- ✅ Supabase database is set up (tables created)
- ✅ Backend server is running on port 8000
- ✅ Frontend server is running on port 3000
- ✅ At least 1 session file in `backend/sessions/unused/` (for bot testing)

### Test Flow Steps

#### Step 1: Verify Backend Health

**Action:** Check backend is running

```bash
curl http://localhost:8000/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "bot_running": false,
  "bot_pid": null
}
```

**Files Changed:** None

**Logs:** Backend terminal shows health check request

---

#### Step 2: Verify Frontend is Accessible

**Action:** Open browser to http://localhost:3000

**Expected Result:**
- Page loads without errors
- No console errors (check browser DevTools)
- Frontend is responsive

**Files Changed:** None

**Logs:** Frontend terminal shows page requests

---

#### Step 3: Access the Access Page

**Action:** Navigate to http://localhost:3000/access

**Expected Result:**
- Access code entry page loads
- Input field is visible
- Can type access code

**Files Changed:** None

**Logs:** Frontend terminal shows `/access` route request

---

#### Step 4: Login with Default Access Code

**Action:** Enter default access code from Supabase schema

**Default Codes (from `schema.sql`):**
- Admin: `ADMIN123`
- User: `USER123`

**Enter:** `USER123` (or `ADMIN123`)

**Expected Result:**
- Login succeeds
- Redirected to dashboard (or appropriate page)
- Session cookie is set

**Files Changed:**
- Supabase `users` table: `last_login` timestamp updated

**Logs:**
- Frontend: Login API call succeeds
- Supabase: User lookup query

---

#### Step 5: Verify Dashboard Loads

**Action:** After login, dashboard should load

**Expected Result:**
- Dashboard page renders
- User information displays
- No errors in browser console

**Files Changed:** None (unless dashboard calls backend APIs)

**Logs:**
- Frontend: Dashboard page load
- Backend: Possibly `/api/bot/state` or similar endpoint calls

---

#### Step 6: Register User in Backend (First Time)

**Action:** Dashboard should automatically call backend registration endpoint

**Endpoint:** `POST /api/bot/register-user`

**Expected Result:**
- User entry created in `backend/data/users.json`
- Response indicates success

**Files Changed:**
- `backend/data/users.json`: New user entry added

**Structure Added:**
```json
{
  "users": {
    "user-uuid-here": {
      "assigned_sessions": [],
      "api_pairs": [],
      "groups": [],
      "post_type": "link",
      "post_content": "",
      "bot_status": "stopped",
      "delay_between_posts": 5,
      "delay_between_cycles": 300
    }
  }
}
```

**Logs:**
- Backend: "Registering user ..."
- Backend: User data saved

---

#### Step 7: Set Post Content (Optional)

**Action:** Use dashboard to set post content (if UI provides this)

**Endpoint:** `POST /api/bot/update-post`

**Expected Result:**
- Post content saved to user data

**Files Changed:**
- `backend/data/users.json`: User's `post_content` and `post_type` updated

**Logs:**
- Backend: Post content updated

---

#### Step 8: Set Groups (Optional)

**Action:** Use dashboard to add groups (if UI provides this)

**Endpoint:** `POST /api/bot/update-groups`

**Expected Result:**
- Groups saved to user data

**Files Changed:**
- `backend/data/users.json`: User's `groups` array updated

**Logs:**
- Backend: Groups updated

---

#### Step 9: Start Bot

**Action:** Click "Start Bot" button in dashboard (if available)

**Endpoint:** `POST /api/bot/start`

**Prerequisites:**
- At least 1 session file in `backend/sessions/unused/`
- User's plan status is "active" (in Supabase `users` table)
- Post content is set (via `/api/bot/update-post`)
- Groups are set (via `/api/bot/update-groups`)

**What Happens:**
1. Frontend calls `backendApi.startBot(userId)`
2. Frontend generates JWT with `plan_status` from Supabase
3. Backend validates JWT and extracts `user_id` and `plan_status`
4. Backend checks plan status:
   - If `"expired"` → Returns `403: "Your plan has expired"`
   - If `"inactive"` → Returns `403: "Your plan is inactive"`
   - If `"active"` or `None` → Continues
5. Backend checks for available sessions in `sessions/unused/`
6. If no sessions available → Returns `409: "No sessions available"`
7. Assigns sessions from `unused/` pool (moves files to `assigned/{user-id}/`)
8. Assigns API pairs (respecting 7-session limit per pair)
9. Updates `users.json`: `bot_status: "running"`
10. Scheduler automatically picks up the user (checks every 2 seconds)

**Expected Result:**
- Bot status changes to "running"
- Sessions assigned from `unused/` pool
- Sessions moved to `assigned/{user-id}/`
- API pairs assigned (based on availability)
- Scheduler starts executing cycles for this user

**Files Changed:**
- `backend/data/users.json`: 
  - `bot_status`: `"running"`
  - `assigned_sessions`: Array of session filenames
  - `api_pairs`: Array of pair indices
- `backend/sessions/unused/`: Session files removed (moved)
- `backend/sessions/assigned/{user-id}/`: Session files added

**Logs:**
- Backend: "Starting bot for user ..."
- Backend: "Assigned sessions: [...]"
- Backend: "Bot started successfully"
- Scheduler: Starts checking this user every 2 seconds

**Files Changed:**
- `backend/data/users.json`: 
  - `bot_status`: `"running"`
  - `assigned_sessions`: Array of session filenames
  - `api_pairs`: Array of pair indices
- `backend/sessions/unused/`: Session files removed (moved)
- `backend/sessions/assigned/{user-id}/`: Session files added

**Logs:**
- Backend: "Starting bot for user ..."
- Backend: "Assigned sessions: [...]"
- Backend: "Bot started successfully"

---

#### Step 10: Verify Bot Status

**Action:** Check bot status via API or dashboard

**Endpoint:** `GET /api/sync/state` (full state) or `GET /api/bot/state` (if exists)

**Expected Result:**
- `bot_status`: `"running"`
- `assigned_sessions`: Array with session filenames
- `api_pairs`: Array of pair indices
- `is_active`: `true` (if scheduler is executing a cycle)
- `stats`: Statistics object
- `logs`: Recent log lines

**Files Changed:** None

**Logs:** 
- Status check request
- Scheduler may show activity if cycle is running

**Note:** The scheduler runs in the background. It checks for active users every 2 seconds and executes cycles based on `delay_between_cycles` (default: 300 seconds = 5 minutes).

---

#### Step 11: Stop Bot (Cleanup)

**Action:** Click "Stop Bot" button (if available)

**Endpoint:** `POST /api/bot/stop`

**Expected Result:**
- Bot status changes to "stopped"
- Sessions remain assigned (not moved back to unused)
- Bot process stops

**Files Changed:**
- `backend/data/users.json`: `bot_status`: `"stopped"`

**Logs:**
- Backend: "Stopping bot for user ..."
- Backend: "Bot stopped successfully"

---

### Verification Checklist

After completing the test flow, verify:

- ✅ Backend health endpoint responds
- ✅ Frontend loads without errors
- ✅ Can login with access code
- ✅ Dashboard loads and displays user info
- ✅ User entry exists in `backend/data/users.json`
- ✅ Can start bot (if sessions available)
- ✅ Sessions are assigned and moved to `assigned/` directory
- ✅ Bot status updates correctly
- ✅ Can stop bot
- ✅ No critical errors in backend or frontend logs

### What Success Looks Like

**Backend Terminal:**
```
🚀 FastAPI AdBot API starting...
✅ AdBot found at ...
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     127.0.0.1:12345 - "GET /health HTTP/1.1" 200 OK
INFO:     127.0.0.1:12345 - "POST /api/bot/register-user HTTP/1.1" 200 OK
INFO:     127.0.0.1:12345 - "POST /api/bot/start HTTP/1.1" 200 OK
```

**Frontend Terminal:**
```
▲ Next.js 16.1.1
- Local:        http://localhost:3000
ready started server on 0.0.0.0:3000
✓ Compiled /access in 123ms
✓ Compiled /dashboard in 456ms
```

**Browser Console (DevTools):**
- No red errors
- API calls succeed (200 status codes)
- Authentication works

---

## PART 7 - COMMON FAILURES & FIXES

### 1. Backend Won't Start

**Symptom:**
```
FileNotFoundError: Config file not found at /path/to/backend/Adbot/config.json
```

**Root Cause:** `backend/Adbot/config.json` file is missing

**Fix:**
1. Create `backend/Adbot/config.json` file
2. Copy structure from Part 2
3. Fill in your API credentials
4. Restart backend

---

### 2. Backend Starts but Frontend Can't Connect

**Symptom:**
- Frontend shows "Failed to fetch" or "Network error"
- Browser console shows CORS errors

**Root Cause:** CORS configuration or backend not running

**Fix:**
1. Verify backend is running: `curl http://localhost:8000/health`
2. Check `FRONTEND_URL` in `backend/api/.env` matches frontend URL
3. Verify `NEXT_PUBLIC_BACKEND_API_URL` in `frontend/.env.local` is `http://localhost:8000`
4. Restart backend after changing `.env`

---

### 3. Authentication Fails (401 Unauthorized)

**Symptom:**
- API calls return `401 Unauthorized`
- "Invalid token" errors in backend logs

**Root Cause:** `JWT_SECRET` mismatch between frontend and backend

**Fix:**
1. Check `JWT_SECRET` in `frontend/.env.local`
2. Check `JWT_SECRET` in `backend/api/.env`
3. **Ensure they are EXACTLY the same value**
4. Restart both frontend and backend
5. Clear browser cookies/localStorage and try again

**Example:**
```env
# frontend/.env.local
JWT_SECRET=local-dev-secret-key-12345

# backend/api/.env
JWT_SECRET=local-dev-secret-key-12345
```

---

### 4. Frontend Can't Connect to Supabase

**Symptom:**
- Frontend shows "Supabase connection failed"
- Login page shows errors
- Browser console shows Supabase errors

**Root Cause:** Missing or invalid Supabase credentials

**Fix:**
1. Verify `.env.local` has all Supabase variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
2. Check credentials in Supabase Dashboard → Settings → API
3. Verify database schema is created (run `schema.sql`)
4. Restart frontend server

---

### 5. Bot Won't Start - "No available sessions"

**Symptom:**
- `POST /api/bot/start` returns error
- Backend log: "No available sessions"

**Root Cause:** No session files in `backend/sessions/unused/`

**Fix:**
1. Check `backend/sessions/unused/` directory exists
2. Place at least 1 `.session` file in `backend/sessions/unused/`
3. Verify file has `.session` extension
4. Try starting bot again

**Note:** For testing without real sessions, you can create a dummy `.session` file, but bot will fail when trying to use it. Real Telegram session files are required for actual bot operation.

---

### 6. Bot Starts but Does Nothing

**Symptom:**
- Bot status is "running"
- No activity in logs
- No posts being sent

**Root Cause:** Missing post content, groups, or invalid session

**Fix:**
1. Verify post content is set (check `users.json` → `post_content`)
2. Verify groups are set (check `users.json` → `groups` array)
3. Check session files are valid Telegram sessions
4. Check `backend/Adbot/logs/` for error messages
5. Verify API pairs in `config.json` are valid

---

### 7. users.json Malformed

**Symptom:**
- Backend shows "users.json corruption detected"
- Backend enters "read-only mode"
- Cannot update user data

**Root Cause:** JSON syntax error in `users.json`

**Fix:**
1. Stop backend
2. Check `backend/data/users.json` for syntax errors
3. Validate JSON format (use JSON validator)
4. Fix syntax errors
5. If file is corrupted beyond repair:
   - Backup current file
   - Create new file: `{"users": {}}`
   - Restart backend
6. Users will need to re-register

---

### 8. Port Already in Use

**Symptom:**
```
ERROR:    [Errno 48] Address already in use
```

**Root Cause:** Port 8000 (backend) or 3000 (frontend) is already in use

**Fix:**

**For Backend:**
```bash
# Find process using port 8000
# Windows:
netstat -ano | findstr :8000
# Linux/Mac:
lsof -i :8000

# Kill process or change API_PORT in .env
```

**For Frontend:**
```bash
# Find process using port 3000
# Windows:
netstat -ano | findstr :3000
# Linux/Mac:
lsof -i :3000

# Kill process or set PORT env var
PORT=3001 npm run dev
```

---

### 9. Python Dependencies Missing

**Symptom:**
```
ModuleNotFoundError: No module named 'fastapi'
```

**Root Cause:** Python packages not installed

**Fix:**
```bash
# Install backend API dependencies
cd backend/api
pip install -r requirements.txt

# Install AdBot dependencies
cd ../Adbot
pip install -r requirements.txt
```

---

### 10. Node.js Dependencies Missing

**Symptom:**
```
Error: Cannot find module 'next'
```

**Root Cause:** npm packages not installed

**Fix:**
```bash
cd frontend
npm install
```

---

### 11. Session Assignment Fails

**Symptom:**
- Bot start fails with session assignment error
- Sessions not moved to `assigned/` directory

**Root Cause:** File permissions or directory doesn't exist

**Fix:**
1. Verify `backend/sessions/` directory exists
2. Verify `backend/sessions/unused/` directory exists
3. Check file permissions (read/write access)
4. Ensure session files are not locked by another process
5. Try manually creating directories:
   ```bash
   mkdir -p backend/sessions/unused
   mkdir -p backend/sessions/assigned
   mkdir -p backend/sessions/banned
   ```

---

### 12. Backend Runs but Frontend Shows 500 Errors

**Symptom:**
- Frontend loads but API calls return 500
- Backend logs show Python tracebacks

**Root Cause:** Backend code errors or missing files

**Fix:**
1. Check backend terminal for error tracebacks
2. Verify all required files exist (see Part 2)
3. Check Python version: `python --version` (needs 3.7+)
4. Verify dependencies are installed correctly
5. Check file paths are correct (especially `config.json`)

---

### 13. JWT Token Expired

**Symptom:**
- Login works initially
- After some time, API calls return 401
- "Token expired" errors

**Root Cause:** JWT tokens expire (default: 24 hours)

**Fix:**
1. **Normal behavior** - Tokens expire for security
2. User should log out and log back in
3. Or refresh the page to get a new token
4. For testing, you can increase token expiration in `frontend/lib/backend-jwt.ts` (not recommended for production)

---

### 14. Plan Status Blocks Bot Start

**Symptom:**
- `POST /api/bot/start` returns 403
- Error: "Your plan has expired" or "Your plan is inactive"

**Root Cause:** User's plan status in Supabase is not "active"

**Fix:**
1. Go to Supabase Dashboard → Table Editor → `users` table
2. Find user's record (by email or access code)
3. Update `plan_status` column to `'active'`
4. Save changes
5. User must log out and log back in (to get new JWT with updated plan_status)
6. Try starting bot again

**SQL (Alternative):**
```sql
UPDATE users SET plan_status = 'active' WHERE id = 'user-uuid-here';
```

**Note:** The plan status is embedded in the JWT when the user logs in. If you change it in Supabase, the user must log out and log back in to get a new JWT with the updated status.

---

### 15. Scheduler Not Running (CRITICAL)

**Symptom:**
- Bot status is "running" but nothing happens
- No logs being generated
- No posts being sent
- No error messages

**Root Cause:** **You used the wrong backend entry point**

**Most Common Cause:**
- Used `python -m backend.api.main` instead of `python main.py`
- Used `backend/api/start.sh` or `backend/api/start.bat`
- These start the API wrapper but **DO NOT start the scheduler**

**Fix:**
1. **STOP the backend**
2. **Use the CORRECT entry point:**
   ```bash
   cd backend
   python main.py
   ```
3. Verify scheduler is running:
   - Bot should execute cycles after starting
   - Check logs for activity
4. If still not working:
   - Check `DELAY_BETWEEN_CYCLES` env var is set (default: 300)
   - Verify you're in the `backend/` directory when running
   - Check backend logs for errors

**Note:** Scheduler **ONLY** starts when using `backend/main.py`. It does NOT start with `backend/api/main.py`.

---

### 16. Bot Auto-Stops After Starting

**Symptom:**
- Bot starts successfully
- After a few seconds, bot status changes back to "stopped"
- Backend logs show: "Auto-stopped bot for user ... - plan status: expired/inactive"

**Root Cause:** Scheduler checks plan status during runtime and auto-stops expired/inactive plans

**Fix:**
1. Check user's `plan_status` in Supabase
2. Update to `'active'` if expired/inactive
3. User must log out and log back in
4. Start bot again

**Note:** This is intentional behavior - the scheduler enforces plan status during runtime, not just at startup.

---

### Quick Diagnostic Commands

**Check Backend Health:**
```bash
curl http://localhost:8000/health
```

**Check Backend Root:**
```bash
curl http://localhost:8000/
```

**Check Frontend:**
```bash
curl http://localhost:3000
```

**Verify Files Exist:**
```bash
# Backend config
ls backend/Adbot/config.json

# Backend env
ls backend/api/.env

# Frontend env
ls frontend/.env.local

# Data files
ls backend/data/users.json
ls backend/data/stats.json

# Sessions
ls backend/sessions/unused/
```

**Check Logs:**
```bash
# Backend logs (if AdBot ran)
ls backend/Adbot/logs/

# View latest log
tail -f backend/Adbot/logs/adbot_$(date +%Y%m%d).log
```

---

## SUMMARY CHECKLIST

Use this checklist when setting up the project for the first time:

### Environment Setup
- [ ] Frontend `.env.local` created with all required variables
- [ ] Backend `.env` created with `JWT_SECRET` set
- [ ] `JWT_SECRET` matches between frontend and backend (EXACT match, case-sensitive)
- [ ] Supabase project created
- [ ] Supabase schema executed (`frontend/supabase/schema.sql`)
- [ ] Supabase credentials configured in frontend `.env.local`:
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Default access codes exist in Supabase (`ADMIN123`, `USER123`)

### Files & Directories
- [ ] `backend/Adbot/config.json` exists and is valid JSON
- [ ] `backend/Adbot/config.json` has at least 1 API pair in `accounts` array
- [ ] `backend/data/` directory exists (auto-created, but verify)
- [ ] `backend/sessions/unused/` directory exists
- [ ] At least 1 session file in `backend/sessions/unused/` (for testing)
- [ ] Session file has `.session` extension

### Dependencies
- [ ] Python 3.7+ installed
- [ ] Node.js 18+ installed
- [ ] Backend Python dependencies installed (`backend/api/requirements.txt`)
- [ ] AdBot Python dependencies installed (`backend/Adbot/requirements.txt`)
- [ ] Frontend npm dependencies installed (`frontend/package.json`)

### Services
- [ ] Backend server starts using **CORRECT entry point**: `cd backend && python main.py`
- [ ] Backend shows: "INFO: Uvicorn running on http://0.0.0.0:8000"
- [ ] Backend scheduler starts (no explicit message, but verify by starting a bot)
- [ ] Frontend server starts without errors (port 3000)
- [ ] Backend health endpoint responds: `curl http://localhost:8000/health`
- [ ] Frontend loads in browser: http://localhost:3000
- [ ] No Supabase connection errors in frontend console
- [ ] **VERIFIED:** Using `backend/main.py` (NOT `backend/api/main.py`)

### Testing
- [ ] Can access `/access` page
- [ ] Can login with access code (`USER123` or `ADMIN123`)
- [ ] Login redirects to dashboard
- [ ] Dashboard loads without errors
- [ ] User registered in backend (`users.json` updated)
- [ ] Can set post content (via dashboard or API)
- [ ] Can set groups (via dashboard or API)
- [ ] Can start bot (if sessions available)
- [ ] Bot status updates to "running"
- [ ] Sessions assigned and moved to `assigned/{user-id}/`
- [ ] Scheduler picks up active user (check backend logs)
- [ ] Can stop bot
- [ ] Bot status updates to "stopped"

---

## ADDITIONAL RESOURCES

- **Supabase Setup:** See `frontend/SUPABASE_SETUP.md`
- **Payment Setup:** See `frontend/PAYMENT_SETUP.md`
- **Environment Variables:** See `frontend/ENV_SETUP.md`
- **Backend API:** See `backend/api/README.md`
- **AdBot Documentation:** See `backend/Adbot/README.md`
- **Architecture:** See `backend/ARCHITECTURE.md`

---

**END OF GUIDE**

This guide should enable a new developer to set up and test the system locally without additional help. If you encounter issues not covered here, check the logs, verify all prerequisites are met, and ensure environment variables are correctly configured.


