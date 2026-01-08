# Complete System Flow & Architecture Documentation

## Overview

This document explains the **COMPLETE USER FLOW**, **ADMIN FLOW**, **FILE RESPONSIBILITIES**, **FORWARDING/EXECUTION FLOW**, and **DATA OWNERSHIP** for the HQAdz Telegram Adbot SaaS Platform.

**Architecture Summary:**
- **Frontend (Next.js on Vercel)**: Handles all business logic, auth, payments, database access
- **Backend (Python on VPS)**: Dumb execution engine - only forwards messages, no auth/payments/database
- **Database (Supabase)**: PostgreSQL with all persistent data

---

## 1. USER FLOW (END TO END)

### Step 1: New User Signs Up
1. User visits frontend and enters email/access code
2. **File**: `frontend/app/api/auth/verify-access-code/route.ts`
   - Validates access code against Supabase `users` table
   - Creates JWT token with user_id, role, plan_status
   - Returns token to frontend
3. **Database**: `users` table in Supabase
   - User record already exists (created by admin) OR created on first login
   - Stores: email, access_code, role, license_key

### Step 2: User Buys a Plan
1. User browses products on frontend
2. **File**: `frontend/app/api/admin/products/route.ts` (GET)
   - Fetches active products from Supabase `products` table
3. User selects a product and clicks "Buy"
4. **File**: `frontend/app/api/payment/create/route.ts`
   - Creates order in Supabase `orders` table (status: PENDING)
   - Creates payment record in Supabase `payments` table (status: WAITING)
   - Calls NowPayments API to create payment
   - Returns payment address to user
5. **Database**: 
   - `orders` table: order_id, user_id, product_id, amount, status
   - `payments` table: payment_id, order_id, payment_address, status

### Step 3: Order is Created
- Order is created in Step 2 above
- Order status: `PENDING`
- Payment status: `WAITING`
- User sees payment instructions

### Step 4: Payment is Verified
1. User sends cryptocurrency to payment address
2. NowPayments detects payment and sends webhook
3. **File**: `frontend/app/api/payment/webhook/route.ts`
   - Receives webhook from NowPayments
   - Updates `payments` table: status = `FINISHED`
   - Updates `orders` table: status = `PAID`
   - **Triggers auto-assignment of sessions** (see Step 5)
   - **Creates adbot record** (see Step 6)

### Step 5: Sessions are Assigned
1. **File**: `frontend/app/api/payment/webhook/route.ts` calls `autoAssignSessions()`
2. **File**: `frontend/lib/stock.ts` → `autoAssignSessions()`
   - Queries Supabase `sessions` table for `status = 'UNUSED'`
   - Updates `sessions` table: 
     - `status = 'ASSIGNED'`
     - `assigned_to_adbot_id = adbot_id`
     - `assigned_to_user_id = user_id`
   - Returns assigned session IDs
3. **Database**: `sessions` table
   - Stores: api_id, api_hash, session_file_path, phone_number, status
   - Session files physically stored in `backend/sessions/` directory

### Step 6: Adbot is Created
1. **File**: `frontend/app/api/payment/webhook/route.ts` calls `createAdbot()`
2. **File**: `frontend/lib/queries.ts` → `createAdbot()`
   - Inserts record into Supabase `adbots` table
   - Sets: user_id, order_id, product_id, status = `STOPPED`
   - Sets: validity_start, validity_end (based on product validity_days)
   - Sets: sessions_assigned (JSONB array of session IDs)
   - Sets: post_link = '', groups = [] (empty - user will configure)
3. **Database**: `adbots` table
   - Stores all adbot configuration and runtime state
   - Links to: user, order, product, sessions

### Step 7: User Configures Message / Groups
1. User navigates to dashboard
2. **File**: `frontend/app/api/user/advertisement/route.ts` (POST)
   - Updates Supabase `adbots` table:
     - `post_link` = user's Telegram post link
     - `groups` = JSONB array of group IDs
3. **File**: `frontend/app/api/bot/config/route.ts` (POST)
   - Also updates adbot config in Supabase
   - May sync with Python backend (if adbot is running)

### Step 8: User Starts the Adbot
1. User clicks "Start" button on dashboard
2. **File**: `frontend/app/api/adbots/[id]/start/route.ts`
   - Verifies user owns adbot (or is admin)
   - Checks adbot not expired
   - Fetches assigned sessions from Supabase `sessions` table
   - Calls Python backend to start adbot
3. **File**: `frontend/lib/python-backend.ts` → `startAdbot()`
   - Sends HTTP POST to `http://PYTHON_BACKEND_URL/api/adbot/start`
   - Payload: adbot_id, user_id, post_link, target_groups, sessions (with api_id, api_hash, session_file_path)
4. **File**: `backend/api/bot_control.py` → `/api/bot/start`
   - Verifies JWT token (extracts user_id)
   - Reads/writes `backend/data/users.json`:
     - Creates/updates user entry with: bot_status = "running", groups, post_content, assigned_sessions
   - Assigns sessions if not already assigned (from `backend/sessions/` directory)
   - Assigns API pairs (from `backend/data/api_pairs.json`)
   - Returns success
5. **File**: `frontend/app/api/adbots/[id]/start/route.ts`
   - Updates Supabase `adbots` table: `status = 'RUNNING'`
6. **Scheduler**: `backend/bot/scheduler.py`
   - Already running (started on backend startup)
   - Detects user's bot_status = "running" in `users.json`
   - Schedules forwarding cycle

### Step 9: Messages are Forwarded to Groups
1. **File**: `backend/bot/scheduler.py` → `UserScheduler.start()`
   - Fast loop (every 2 seconds) checks all active users
   - For each user with `bot_status = "running"`:
     - Checks `next_run_at` timestamp
     - If time to run, creates task
2. **File**: `backend/bot/worker.py` → `execute_user_cycle()`
   - Reads user config from `backend/data/users.json`:
     - assigned_sessions, groups, post_content, delay_between_posts
   - Distributes groups across sessions
   - Creates TelegramClient for each session
3. **File**: `backend/bot/engine.py` → `execute_forwarding_cycle()`
   - For each session:
     - Parses post_link (extracts channel and message_id)
     - For each assigned group:
       - Calls `forward_to_group()` using Telethon
       - Forwards message from source channel to target group
       - Handles errors (FloodWait, banned, etc.)
       - Logs success/failure
   - Returns stats: success count, failures, errors
4. **File**: `backend/bot/worker.py`
   - Updates stats in `backend/data/stats.json`
   - Handles banned sessions (moves to banned directory, attempts replacement)
5. **File**: `backend/bot/log_saver.py`
   - Writes logs to `backend/logs/{user_id}.log`
   - Each log entry: timestamp, session, group, success/failure, error

### Step 10: Logs are Generated
1. **During forwarding** (Step 9):
   - `backend/bot/log_saver.py` writes to `backend/logs/{user_id}.log`
2. **User views logs**:
   - **File**: `frontend/app/api/adbots/[id]/logs/route.ts`
   - Reads log file from `backend/logs/{user_id}.log`
   - Returns last N lines to frontend
3. **Alternative**: `backend/api/sync.py` → `/api/sync/state`
   - Returns full dashboard state including logs (last 100 lines)

### Step 11: User Stops the Adbot
1. User clicks "Stop" button
2. **File**: `frontend/app/api/adbots/[id]/stop/route.ts`
   - Calls Python backend to stop
3. **File**: `frontend/lib/python-backend.ts` → `stopAdbot()`
   - Sends HTTP POST to `http://PYTHON_BACKEND_URL/api/adbot/stop`
4. **File**: `backend/api/bot_control.py` → `/api/bot/stop`
   - Updates `backend/data/users.json`: `bot_status = "stopped"`
   - Scheduler detects change and stops executing cycles for this user
5. **File**: `frontend/app/api/adbots/[id]/stop/route.ts`
   - Updates Supabase `adbots` table: `status = 'STOPPED'`

### Step 12: Plan Expires
1. **Cron job or scheduled check** (not yet implemented, but logic exists):
   - Checks `adbots.validity_end` in Supabase
   - If `validity_end < NOW()`:
     - Updates `adbots.status = 'EXPIRED'`
     - Updates `backend/data/users.json`: `bot_status = "stopped"` (if running)
     - Scheduler auto-stops bot (checks plan_status in JWT and users.json)
2. **File**: `backend/bot/scheduler.py`
   - Already checks `plan_status` in `users.json` during each cycle
   - If `plan_status = "expired"` or `"inactive"`, auto-stops bot

---

## 2. ADMIN FLOW

### How Admin Views Users
1. Admin navigates to admin panel
2. **File**: `frontend/app/api/admin/users/route.ts` (GET)
   - Queries Supabase `users` table
   - Returns all users with filters (role, status)
3. **File**: `frontend/app/admin/page.tsx`
   - Displays user list with details

### How Admin Views Adbots
1. **File**: `frontend/app/api/admin/adbots/route.ts` (GET)
   - Queries Supabase `adbots` table
   - Joins with `users`, `orders`, `products` tables
   - Returns all adbots with full details
2. **File**: `frontend/app/admin/page.tsx`
   - Displays adbot list with status, user, sessions, etc.

### How Admin Uploads Sessions
1. Admin navigates to stock management page
2. **File**: `frontend/app/api/admin/stock/upload/route.ts` (POST)
   - Receives: phone_number, api_id, api_hash, session_file_path
   - Calls `uploadSession()` from `frontend/lib/stock.ts`
3. **File**: `frontend/lib/stock.ts` → `uploadSession()`
   - Calls `createSession()` from `frontend/lib/queries.ts`
4. **File**: `frontend/lib/queries.ts` → `createSession()`
   - Inserts into Supabase `sessions` table:
     - api_id, api_hash, session_file_path, phone_number
     - status = 'UNUSED'
   - **Note**: Session file must already exist in `backend/sessions/` directory
   - Admin must upload file to VPS manually (or via separate file upload endpoint)

### How Admin Replaces Banned Sessions
1. Admin views banned sessions
2. **File**: `frontend/app/api/admin/stock/overview/route.ts` (GET)
   - Queries Supabase `sessions` table: `status = 'BANNED'`
3. Admin selects banned session and assigns replacement
4. **File**: `frontend/lib/queries.ts` → `markSessionAsBanned()` and `assignSessionToAdbot()`
   - Updates old session: `status = 'BANNED'`
   - Updates new session: `status = 'ASSIGNED'`, `assigned_to_adbot_id = adbot_id`
   - Updates `adbots.sessions_assigned` JSONB array
5. **File**: `backend/api/bot_control.py` → `/api/bot/config` (POST)
   - Admin can also update `backend/data/users.json` directly via sync endpoint

### How Admin Force-Stops an Adbot
1. Admin views adbot list
2. **File**: `frontend/app/api/adbots/[id]/stop/route.ts`
   - Admin has permission (checked via `hasRole(user.role, ['ADMIN'])`)
   - Calls Python backend to stop (same as user stop flow)
   - Updates Supabase `adbots.status = 'STOPPED'`
   - Updates `backend/data/users.json`: `bot_status = "stopped"`

---

## 3. FILE RESPONSIBILITY MAP

### Frontend API Routes (`frontend/app/api/*`)

#### Authentication
- **`frontend/app/api/auth/verify-access-code/route.ts`**
  - Verifies access code, creates JWT token
  - Returns user data and token

- **`frontend/app/api/auth/refresh/route.ts`**
  - Refreshes JWT token

- **`frontend/app/api/auth/me/route.ts`**
  - Returns current user from JWT token

#### Payment
- **`frontend/app/api/payment/create/route.ts`**
  - Creates order and payment in Supabase
  - Calls NowPayments API
  - Returns payment address

- **`frontend/app/api/payment/webhook/route.ts`**
  - Receives webhook from NowPayments
  - Updates payment status
  - Auto-assigns sessions
  - Creates adbot record

- **`frontend/app/api/payment/status/route.ts`**
  - Checks payment status from NowPayments

#### User Operations
- **`frontend/app/api/user/adbots/route.ts`**
  - Lists user's adbots from Supabase

- **`frontend/app/api/user/orders/route.ts`**
  - Lists user's orders from Supabase

- **`frontend/app/api/user/notifications/route.ts`**
  - Lists user's notifications from Supabase

- **`frontend/app/api/user/stats/route.ts`**
  - Returns user statistics

- **`frontend/app/api/user/advertisement/route.ts`**
  - GET: Returns adbot advertisement config
  - POST: Updates adbot post_link and groups in Supabase

#### Adbot Control
- **`frontend/app/api/adbots/[id]/start/route.ts`**
  - Starts adbot: calls Python backend, updates Supabase

- **`frontend/app/api/adbots/[id]/stop/route.ts`**
  - Stops adbot: calls Python backend, updates Supabase

- **`frontend/app/api/adbots/[id]/logs/route.ts`**
  - Returns adbot logs from Python backend

#### Admin Operations
- **`frontend/app/api/admin/dashboard/route.ts`**
  - Returns admin dashboard metrics

- **`frontend/app/api/admin/users/route.ts`**
  - GET: Lists all users
  - POST: Creates user

- **`frontend/app/api/admin/users/[id]/suspend/route.ts`**
  - Suspends user

- **`frontend/app/api/admin/users/[id]/reset-code/route.ts`**
  - Resets user access code

- **`frontend/app/api/admin/adbots/route.ts`**
  - Lists all adbots

- **`frontend/app/api/admin/adbots/[id]/extend/route.ts`**
  - Extends adbot validity

- **`frontend/app/api/admin/products/route.ts`**
  - GET: Lists products
  - POST: Creates product

- **`frontend/app/api/admin/stock/upload/route.ts`**
  - Uploads session to stock (creates record in Supabase)

- **`frontend/app/api/admin/stock/overview/route.ts`**
  - Returns stock overview (unused, assigned, banned counts)

- **`frontend/app/api/admin/stats/route.ts`**
  - Returns admin statistics

#### Bot Config (Legacy/Alternative)
- **`frontend/app/api/bot/config/route.ts`**
  - GET/POST: Manages bot configuration
  - May sync with Python backend

- **`frontend/app/api/bot/control/route.ts`**
  - Start/stop bot control

- **`frontend/app/api/bot/validate-post/route.ts`**
  - Validates Telegram post link

### Frontend Libraries (`frontend/lib/*`)

- **`frontend/lib/auth.ts`**
  - JWT token creation/verification
  - `requireAuth()`, `requireRole()`, `hasRole()` helpers

- **`frontend/lib/supabase.ts`**
  - Supabase client initialization
  - Service role key for server-side operations

- **`frontend/lib/queries.ts`**
  - All Supabase database queries
  - Functions: `createUser()`, `getUserById()`, `createAdbot()`, `createSession()`, etc.

- **`frontend/lib/python-backend.ts`**
  - HTTP client for Python backend
  - Functions: `startAdbot()`, `stopAdbot()`, `getAdbotStatus()`, `getAdbotLogs()`

- **`frontend/lib/stock.ts`**
  - Stock management utilities
  - `uploadSession()`, `autoAssignSessions()`, `checkLowStock()`

- **`frontend/lib/email.ts`**
  - Email sending (Nodemailer)
  - `sendPaymentSuccessEmail()`, `sendOrderConfirmationEmail()`

- **`frontend/lib/backend-api.ts`**
  - Alternative backend API client (legacy?)

- **`frontend/lib/db.ts`**
  - Database helper functions (legacy?)

### Frontend Pages (`frontend/app/*`)

- **`frontend/app/admin/page.tsx`**
  - Admin dashboard UI

- **`frontend/app/dashboard/page.tsx`**
  - User dashboard UI

- **`frontend/app/dashboard/history/page.tsx`**
  - Order history UI

- **`frontend/app/dashboard/notifications/page.tsx`**
  - Notifications UI

- **`frontend/app/dashboard/profile/page.tsx`**
  - User profile UI

- **`frontend/app/dashboard/settings/page.tsx`**
  - Settings UI

- **`frontend/app/checkout/page.tsx`**
  - Checkout/payment page

### Backend Main (`backend/main.py`)

- **Entry point** for Python backend
- Starts FastAPI server
- Registers routers: `bot_router`, `sync_router`, `health_router`
- On startup: Resets all bots to STOPPED state (safety measure)
- Starts scheduler on startup

### Backend API (`backend/api/*`)

- **`backend/api/bot_control.py`**
  - `/api/bot/start`: Starts bot, updates `users.json`
  - `/api/bot/stop`: Stops bot, updates `users.json`
  - `/api/bot/config`: Updates bot config in `users.json`
  - `/api/bot/status`: Returns bot status from `users.json` and `stats.json`
  - **Auth**: Verifies JWT token, extracts user_id

- **`backend/api/sync.py`**
  - `/api/sync/state`: Returns full dashboard state (config, stats, logs)
  - **Auth**: Verifies JWT token

- **`backend/api/health.py`**
  - `/api/health`: Health check endpoint

- **`backend/api/core/auth.py`**
  - JWT verification utilities

- **`backend/api/core/config_loader.py`**
  - Configuration loading

- **`backend/api/core/process_manager.py`**
  - Process management (if needed)

### Backend Bot Engine (`backend/bot/*`)

- **`backend/bot/engine.py`**
  - **Core forwarding logic**
  - `parse_post_link()`: Extracts channel and message_id from Telegram link
  - `forward_to_group()`: Forwards message using Telethon
  - `execute_forwarding_cycle()`: Executes one cycle for a session
  - Handles errors: FloodWait, banned, write forbidden

- **`backend/bot/worker.py`**
  - `execute_user_cycle()`: Executes cycle for all user's sessions
  - `execute_session_cycle()`: Executes cycle for single session
  - Distributes groups across sessions
  - Updates stats in `stats.json`
  - Handles banned session replacement

- **`backend/bot/scheduler.py`**
  - `UserScheduler`: Main scheduler loop
  - Fast loop (every 2 seconds) checks active users
  - Schedules cycles based on `next_run_at` timestamps
  - Per-user concurrency limits (semaphore)
  - Auto-stops bots with expired plans

- **`backend/bot/data_manager.py`**
  - Reads/writes `backend/data/users.json`
  - Reads/writes `backend/data/stats.json`
  - File locking for thread safety
  - Functions: `load_users()`, `save_users()`, `get_user_data()`, `update_user_data()`

- **`backend/bot/session_manager.py`**
  - Manages session files in `backend/sessions/` directory
  - Functions: `get_session_path()`, `ban_session()`, `replace_banned_session()`
  - Reads session filenames from `users.json`

- **`backend/bot/api_pairs.py`**
  - Manages API pairs (api_id, api_hash)
  - Reads from `backend/data/api_pairs.json`
  - Assigns API pairs to sessions (respects 7-session limit per pair)

- **`backend/bot/log_saver.py`**
  - Writes logs to `backend/logs/{user_id}.log`
  - Functions: `get_user_logger()`, `get_user_logs()`

### Backend Data Files (`backend/data/*.json`)

- **`backend/data/users.json`**
  - **Runtime state** for all users
  - Structure: `{"users": {user_id: {bot_status, groups, post_content, assigned_sessions, ...}}}`
  - **Owned by**: Python backend (read/write)
  - **Synced from**: Supabase `adbots` table when user starts bot

- **`backend/data/stats.json`**
  - **Statistics** for all users
  - Structure: `{"users": {user_id: {total_posts, total_success, total_failures, ...}}}`
  - **Owned by**: Python backend (read/write)

- **`backend/data/api_pairs.json`**
  - **API credentials** (api_id, api_hash pairs)
  - Structure: `[{"api_id": "...", "api_hash": "..."}, ...]`
  - **Owned by**: Admin (manual file edit or via API)

- **`backend/data/groups.json`** (if exists)
  - Group configurations (legacy?)

- **`backend/data/default_groups.json`**
  - Default groups (if any)

### Backend Logs (`backend/logs/*`)

- **`backend/logs/{user_id}.log`**
  - **Per-user log file**
  - Written by `backend/bot/log_saver.py`
  - Contains: timestamp, session, group, success/failure, errors
  - **Owned by**: Python backend (write-only during execution)

- **`backend/Adbot/logs/*`** (if exists)
  - Legacy log files from old Adbot implementation

### Backend Sessions (`backend/sessions/*`)

- **`backend/sessions/*.session`**
  - **Telethon session files**
  - Physical files required for Telegram authentication
  - **Owned by**: Admin (uploads manually or via file upload)
  - **Referenced by**: Supabase `sessions` table (`session_file_path` column)

---

## 4. FORWARDING / ADBOT EXECUTION FLOW

### Where Forwarding Logic Lives

**Primary Location**: `backend/bot/engine.py`
- `forward_to_group()`: Core forwarding function using Telethon
- `execute_forwarding_cycle()`: Executes one cycle for a session

**Orchestration**: `backend/bot/worker.py`
- `execute_user_cycle()`: Coordinates all sessions for a user
- `execute_session_cycle()`: Handles single session execution

**Scheduling**: `backend/bot/scheduler.py`
- `UserScheduler.start()`: Main loop that triggers cycles

### How Config Reaches Python

1. **User starts adbot**:
   - Frontend: `frontend/app/api/adbots/[id]/start/route.ts`
   - Calls: `frontend/lib/python-backend.ts` → `startAdbot()`
   - HTTP POST to: `http://PYTHON_BACKEND_URL/api/bot/start`

2. **Python receives config**:
   - `backend/api/bot_control.py` → `/api/bot/start`
   - Extracts from request body: post_link, target_groups, sessions
   - **Writes to**: `backend/data/users.json`
   - Structure: `{user_id: {bot_status: "running", groups: [...], post_content: "...", assigned_sessions: [...]}}`

3. **Alternative sync endpoint**:
   - `backend/api/bot_control.py` → `/api/bot/config` (POST)
   - Updates `users.json` without starting bot

### How Python Loops Messages

1. **Scheduler Loop** (`backend/bot/scheduler.py`):
   - Fast loop (every 2 seconds)
   - Checks all users in `users.json` with `bot_status = "running"`
   - For each user, checks `next_run_at` timestamp
   - If time to run, creates async task

2. **User Cycle** (`backend/bot/worker.py`):
   - Reads user config from `users.json`
   - Distributes groups across sessions (evenly)
   - Creates TelegramClient for each session
   - Executes forwarding cycle for each session (concurrently, with semaphore limit)

3. **Forwarding Cycle** (`backend/bot/engine.py`):
   - Parses `post_link` (extracts channel username and message_id)
   - For each assigned group:
     - Calls `client.forward_messages()` (Telethon)
     - Handles errors (FloodWait, banned, etc.)
     - Logs result
   - Returns stats: success count, failures, errors

4. **Delay Between Cycles**:
   - After cycle completes, sets `next_run_at = now + delay_between_cycles` (default 300 seconds)
   - Scheduler respects this timestamp

### How Failures are Handled

1. **FloodWait Errors**:
   - `backend/bot/engine.py` catches `FloodWaitError`
   - Logs warning with wait time
   - Returns failure in stats
   - Cycle continues with next group

2. **Banned Account Errors**:
   - `backend/bot/engine.py` detects "ACCOUNT_BANNED" or "banned" in error
   - Returns `banned_sessions` list in stats
   - `backend/bot/worker.py` handles:
     - Moves session file to banned directory
     - Removes from `users.json` assigned_sessions
     - Attempts replacement from unused sessions
     - Updates `users.json` with replacement

3. **Write Forbidden Errors**:
   - Logged as warning
   - Cycle continues with next group

4. **Other Errors**:
   - Logged with error message
   - Stats updated with failure count
   - Cycle continues

5. **Plan Expiration**:
   - `backend/bot/scheduler.py` checks `plan_status` in `users.json`
   - If `plan_status = "expired"` or `"inactive"`:
     - Auto-stops bot: `bot_status = "stopped"`
     - Cancels active task
     - Removes from scheduler

### How Logs Return to Frontend

1. **During Execution**:
   - `backend/bot/log_saver.py` writes to `backend/logs/{user_id}.log`
   - Each log entry: timestamp, session, group, success/failure, error

2. **User Requests Logs**:
   - Frontend: `frontend/app/api/adbots/[id]/logs/route.ts`
   - Calls: `frontend/lib/python-backend.ts` → `getAdbotLogs()`
   - HTTP GET to: `http://PYTHON_BACKEND_URL/api/adbot/logs/{adbot_id}`

3. **Python Returns Logs**:
   - `backend/api_wrapper.py` → `/api/adbot/logs/{adbot_id}` (if using old wrapper)
   - OR: `backend/api/sync.py` → `/api/sync/state` (returns full state including logs)
   - Reads from `backend/logs/{user_id}.log`
   - Returns last N lines

4. **Alternative**: Direct file read
   - Frontend could read log file directly (if accessible)
   - Currently not implemented

---

## 5. DATA OWNERSHIP

### Users
- **Owner**: Frontend (Supabase)
- **Storage**: Supabase `users` table
- **Fields**: id, email, role, access_code, license_key, created_at, etc.
- **Backend Access**: Read-only (via JWT token user_id)

### Plans / Products
- **Owner**: Frontend (Supabase)
- **Storage**: Supabase `products` table
- **Fields**: id, name, type, sessions_count, posting_interval_seconds, price, validity_days, etc.
- **Backend Access**: None (backend doesn't know about products)

### Orders
- **Owner**: Frontend (Supabase)
- **Storage**: Supabase `orders` table
- **Fields**: id, user_id, product_id, amount, status, created_at, etc.
- **Backend Access**: None

### Payments
- **Owner**: Frontend (Supabase)
- **Storage**: Supabase `payments` table
- **Fields**: id, order_id, payment_id, amount, status, payment_address, etc.
- **Backend Access**: None

### Sessions
- **Owner**: Frontend (Supabase) + Admin (Physical Files)
- **Storage**: 
  - **Metadata**: Supabase `sessions` table
  - **Physical Files**: `backend/sessions/*.session` directory
- **Fields**: id, api_id, api_hash, session_file_path, phone_number, status, assigned_to_adbot_id
- **Backend Access**: 
  - Reads session file paths from `users.json` (assigned_sessions)
  - Reads physical session files from `backend/sessions/` directory
  - Does NOT write to Supabase (frontend owns that)

### Adbot Runtime State
- **Owner**: Python Backend (JSON files)
- **Storage**: `backend/data/users.json`
- **Fields**: bot_status, groups, post_content, assigned_sessions, api_pairs, delay_between_posts, etc.
- **Frontend Access**: 
  - Reads via `/api/sync/state` endpoint
  - Writes via `/api/bot/start`, `/api/bot/stop`, `/api/bot/config` endpoints

### Adbot Persistent State
- **Owner**: Frontend (Supabase)
- **Storage**: Supabase `adbots` table
- **Fields**: id, user_id, order_id, product_id, status, validity_start, validity_end, sessions_assigned (JSONB), post_link, groups (JSONB)
- **Backend Access**: None (backend doesn't read Supabase)

### Logs
- **Owner**: Python Backend
- **Storage**: `backend/logs/{user_id}.log` (text files)
- **Content**: Timestamp, session, group, success/failure, errors
- **Frontend Access**: Reads via `/api/adbot/logs/{id}` or `/api/sync/state`

### Statistics
- **Owner**: Python Backend
- **Storage**: `backend/data/stats.json`
- **Fields**: total_posts, total_success, total_failures, total_flood_waits, total_messages_sent, last_activity
- **Frontend Access**: Reads via `/api/sync/state` endpoint

### API Pairs
- **Owner**: Admin (Manual or API)
- **Storage**: `backend/data/api_pairs.json`
- **Fields**: Array of {api_id, api_hash}
- **Backend Access**: Reads during session assignment
- **Frontend Access**: None (admin-only, manual file edit)

---

## Summary

**Key Separation of Concerns:**

1. **Frontend (Next.js)**: 
   - Owns all business logic, auth, payments, database
   - Creates orders, assigns sessions, creates adbots
   - Sends config to Python when user starts bot

2. **Backend (Python)**:
   - Dumb execution engine
   - Only forwards messages, no auth/payments/database
   - Reads config from JSON files, writes logs and stats
   - Scheduler loops and executes forwarding cycles

3. **Database (Supabase)**:
   - All persistent data: users, orders, payments, adbots, sessions
   - Frontend reads/writes, backend never touches

4. **File System (VPS)**:
   - Session files: `backend/sessions/*.session`
   - Runtime state: `backend/data/users.json`, `backend/data/stats.json`
   - Logs: `backend/logs/{user_id}.log`

**Data Flow:**
- Frontend → Supabase: All persistent data
- Frontend → Python: Config when starting bot (HTTP POST)
- Python → JSON files: Runtime state and stats
- Python → Log files: Execution logs
- Frontend ← Python: Status, stats, logs (HTTP GET)


