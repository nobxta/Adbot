# Telegram AdBot

## 1. Overview

**Telegram AdBot** is an automated message forwarding system that distributes content from Telegram channels to multiple groups simultaneously. The system uses multiple Telegram accounts (sessions) to forward posts in parallel, providing scalability and redundancy.

### What It Does

AdBot automatically forwards messages from specified source channels/posts to a list of target Telegram groups. It handles the repetitive task of posting the same content across dozens or hundreds of groups, saving time and ensuring consistent distribution.

### Problem It Solves

- **Manual Posting**: Eliminates the need to manually forward messages to multiple groups one by one
- **Time Efficiency**: Automates repetitive posting tasks, allowing you to focus on content creation
- **Scale**: Handles posting to large numbers of groups simultaneously without manual intervention
- **Reliability**: Multi-account support ensures posting continues even if some accounts face rate limits or restrictions

### Type of AdBot

This is a **Telegram group advertising bot** that:
- Uses Telegram session files (`.session`) for authentication
- Supports multiple accounts working in parallel
- Distributes groups evenly across available accounts
- Monitors account health (active, frozen, banned) and automatically skips problematic accounts
- Provides a Telegram bot interface for remote control and monitoring

---

## 2. What a User Can Do

### Add Sessions

Sessions are Telegram account authentication files that AdBot uses to post messages. Each session represents one Telegram account.

**Method 1: Upload ZIP via Controller Bot**
1. Create a ZIP file containing `.session` files
2. Send the ZIP file to the controller bot (Telegram bot that manages AdBot)
3. The bot automatically extracts files to the `sessions/` folder
4. Session registry is automatically updated

**Method 2: Manual File Placement**
1. Copy `.session` files directly to the `sessions/` folder
2. Send `/refresh_sessions` command to the controller bot
3. Registry is synced and sessions become available

**Note**: Session files are created by authenticating Telegram accounts using Telethon. AdBot only uses existing `.session` files - it does not create them.

### Add Group Lists / Chat Lists

Groups are the target Telegram groups where AdBot will forward messages.

**Method 1: Use Default Groups File**
- Edit `groups.txt` file directly
- Add one group ID per line (format: `-1001234567890` or `t.me/channelname`)
- Save the file - system will use new groups on next start/cycle

**Method 2: Add via Controller Bot**
1. Send `/start` to controller bot
2. Click "📁 Group" button
3. Choose "📋 Use Default Groups" to use `groups.txt`
4. Or choose "➕ Add Custom Chatlist" to add a Telegram chatlist link
5. Bot processes the chatlist and adds all groups automatically

**Method 3: Upload Groups File**
1. Create a text file with group IDs (one per line)
2. Send the file to the controller bot
3. Bot saves it as a backup in `groups/` folder and uses it for posting

### Assign Sessions to Groups

**Automatic Assignment**: AdBot automatically distributes groups evenly across all ACTIVE sessions. The system:
- Detects all available session files in `sessions/` folder
- Checks each session's health status (active, frozen, banned)
- Distributes groups evenly across healthy (ACTIVE) sessions only
- Automatically skips frozen or banned sessions

**Manual Control**: 
- Use `/sessions` command to view all sessions and their status
- Use `/remove_session <filename>` to remove a problematic session
- New group distribution happens automatically when you start the bot

**Note**: Currently, there is no manual session-to-group assignment feature. Distribution is automatic and evenly balanced.

### Start / Stop Advertising

**Via Controller Bot (Recommended)**:
1. Send `/start` to the controller bot
2. Click "▶️ Run" button to start/resume posting
3. Click "⏸️ Stop" button to stop/pause posting
4. Check status using "📊 Status" button

**Via Command Line** (if running directly):
- Start: Run `python main.py` (system starts in STOPPED state by default)
- Stop: Send stop command via bot, or press Ctrl+C for graceful shutdown

**Posting Cycle**:
- System forwards messages in cycles
- Between cycles: waits `delay_between_cycles` seconds (default: 300 seconds)
- Between posts: waits `delay_between_posts` seconds (default: 5 seconds)
- Each session posts to its assigned groups sequentially

### View Logs

**Method 1: Via Controller Bot**
1. Send `/logs` command
2. Choose log type:
   - All logs (complete log file)
   - Error logs only (filtered errors)
   - Posting logs only (filtered posting activity)
3. Bot sends the log file

**Method 2: Direct File Access**
- Open `logs/adbot_YYYYMMDD.log` (current day's log file)
- Logs are plain text, UTF-8 encoded
- Contains timestamps, log levels, and detailed messages

**Method 3: Telegram Log Group** (if configured)
- System sends batched logs to a configured Telegram log group
- Real-time updates on posting status
- Formatted messages with posting results

### View Reports

**Via Controller Bot**:
1. Send `/stats` command
2. Bot displays comprehensive statistics:
   - **Uptime**: How long the bot has been running
   - **Total Posts**: Number of posts attempted
   - **Success/Failure Counts**: Success and failure rates
   - **Per-Account Performance**: Individual session statistics (success, failures, response times, errors)
   - **Per-Group Performance**: Individual group statistics (last post time, consecutive failures)
   - **Flood Waits**: Rate limit incidents

**Via File**:
- Open `stats.json` (JSON format)
- Contains all historical statistics in structured format
- Can be parsed by external tools or scripts

**Real-time Monitoring**:
- Statistics are updated in real-time during posting
- Saved to `stats.json` periodically (every 10 posts)

### Replace Banned or Frozen Sessions

**Automatic Detection**:
- System automatically detects banned/frozen sessions during health checks
- Banned/frozen sessions are automatically skipped during posting
- System continues posting with remaining ACTIVE sessions
- Critical alerts are sent to authorized users when accounts are banned

**Manual Removal**:
1. Send `/sessions` command to view all sessions and their status
2. Identify banned/frozen sessions (marked with status: FROZEN or BANNED)
3. Send `/remove_session <filename>` to remove a session
4. Session file is moved to backup (does not delete permanently)

**Adding Replacement**:
1. Obtain a new `.session` file (authenticate a new Telegram account)
2. Add the new session file to `sessions/` folder (see "Add Sessions" above)
3. Send `/refresh_sessions` command to update the registry
4. New session becomes available for automatic group assignment

**Health Status**:
- **ACTIVE**: Session is healthy and can post messages
- **FROZEN**: Account is restricted (read-only, cannot send messages)
- **BANNED**: Account is banned by Telegram
- **DEAD**: Session is not authorized or expired

---

## 3. Core Folder Explanation

### Input → Process → Output Flow

```
CONFIGURATION FILES → main.py → RESULTS & LOGS
     (input)        (process)      (output)
```

### Core Folders

#### `sessions/` - Session Management

**Purpose**: Stores Telegram account authentication files (`.session` files).

**What it contains**:
- `.session` files: One file per Telegram account
- `.session-journal` files: Database journal files (created automatically)

**How it works**:
- **Input**: You add `.session` files to this folder
- **Process**: `main.py` scans this folder on startup, loads all session files, checks their health, and creates client connections
- **Output**: Active sessions are used to post messages to groups

**Session Status**:
- System checks each session's health on startup and periodically during operation
- Only ACTIVE sessions are used for posting
- Frozen/banned sessions are automatically skipped

**Management**:
- Add: Upload ZIP or copy files manually
- Remove: Use `/remove_session` command (moves to backup, doesn't delete)
- Refresh: Use `/refresh_sessions` command to re-scan folder

#### `groups.txt` & `groups/` - Group Lists Management

**Purpose**: Stores target group IDs where AdBot will forward messages.

**`groups.txt` (Primary)**:
- **What it contains**: Active group list (one group ID per line)
- **Format**: 
  - Telegram group ID: `-1001234567890`
  - Or channel username: `t.me/channelname`
- **How it works**:
  - **Input**: You edit this file or add groups via bot
  - **Process**: `main.py` reads this file on startup and loads all group IDs
  - **Output**: Groups are distributed across sessions and posted to during cycles

**`groups/` (Backup/Archive)**:
- **What it contains**: Backup group lists saved with timestamps
- **Format**: `folder_YYYYMMDD_HHMMSS.txt` (one file per backup)
- **How it works**:
  - **Input**: Created automatically when you add a custom chatlist via bot
  - **Process**: System saves snapshot of groups before processing new chatlist
  - **Output**: Archive for recovery or reference

**Group Assignment**:
- Groups from `groups.txt` are automatically distributed evenly across all ACTIVE sessions
- Each session gets approximately equal number of groups
- Distribution happens automatically on startup

#### `logs/` - Logging

**Purpose**: Stores daily log files for debugging and monitoring.

**What it contains**:
- Daily log files: `adbot_YYYYMMDD.log` (one file per day)
- Log levels: INFO, WARNING, ERROR, DEBUG
- Format: Timestamp, log level, message

**How it works**:
- **Input**: System events (posting, errors, status changes)
- **Process**: `main.py` writes all events to daily log files with timestamps
- **Output**: Log files you can read for troubleshooting or monitoring

**Log Content**:
- Posting activity: Success/failure for each post attempt
- Session status: Health checks, bans, freezes
- Errors: Detailed error messages with context
- System events: Start/stop, configuration changes

**Access**:
- View via `/logs` command in controller bot
- Read directly from `logs/` folder
- Sent to Telegram log group (if configured)

#### `stats.json` - Reports & Statistics

**Purpose**: Tracks performance metrics and statistics.

**What it contains** (JSON format):
- **Global Stats**: Total posts, success rate, uptime
- **Per-Account Stats**: Success/failure counts, response times, error types
- **Per-Group Stats**: Last post time, consecutive failures
- **Session History**: Start/stop timestamps

**How it works**:
- **Input**: Real-time events during posting (success, failure, timing)
- **Process**: `main.py` updates statistics in memory and saves to file periodically (every 10 posts)
- **Output**: JSON file with comprehensive statistics

**Statistics Tracked**:
- Posting metrics: Total posts, successes, failures, flood waits
- Account performance: Individual session success rates, average response times
- Group performance: Which groups are posting successfully, which are failing
- Uptime tracking: How long bot has been running

**Access**:
- View via `/stats` command in controller bot (formatted display)
- Read `stats.json` directly (raw JSON for programmatic access)

#### `config.json` - Configuration

**Purpose**: Central configuration file with all bot settings.

**What it contains**:
- Post links: Source messages to forward (`t.me/channel/123`)
- Delays: `delay_between_posts`, `delay_between_cycles`
- API credentials: Telegram API ID and hash for each account
- Controller bot: Bot token and authorized user IDs
- Log group: Telegram group ID for logs

**How it works**:
- **Input**: You edit this file or change settings via bot
- **Process**: `main.py` reads this file on startup and uses settings for operation
- **Output**: Configuration applied to all bot operations

**Key Settings**:
- `post_link`: Source message(s) to forward
- `delay_between_posts`: Seconds between posts to same group
- `delay_between_cycles`: Seconds between complete posting cycles
- `accounts`: API credentials for each Telegram account
- `controller_bot_token`: Bot token for remote control interface

**Management**:
- View via `/config` command in controller bot
- Edit directly in file or via bot interface

#### `group_blacklist.json` - Group Blacklist

**Purpose**: Tracks groups that should be skipped per account.

**What it contains**:
- JSON object mapping account numbers to lists of blacklisted group IDs
- Format: `{"account_num": ["group_id1", "group_id2"]}`

**How it works**:
- **Input**: System automatically adds groups that consistently fail
- **Process**: `main.py` checks blacklist before posting and skips blacklisted groups
- **Output**: Prevents repeated posting attempts to problematic groups

**Automatic Blacklisting**:
- Groups with high consecutive failures are automatically blacklisted
- Blacklist is account-specific (one account's blacklist doesn't affect others)
- Helps avoid wasting time on groups that consistently fail

---

### Complete Flow Example

1. **Setup** (One-time):
   - Add session files to `sessions/` folder
   - Add group IDs to `groups.txt`
   - Configure `config.json` with post links and settings

2. **Start** (Each session):
   - Run `main.py` or start via controller bot
   - System loads sessions, checks health, loads groups
   - Distributes groups evenly across ACTIVE sessions

3. **Posting Cycle** (Continuous):
   - Each session forwards source message to its assigned groups
   - Waits between posts (configurable delay)
   - Logs results to `logs/` folder
   - Updates statistics in `stats.json`

4. **Monitoring** (Ongoing):
   - View logs via `/logs` command
   - Check statistics via `/stats` command
   - Monitor session health via `/sessions` command
   - Receive alerts for banned/frozen accounts

5. **Maintenance** (As needed):
   - Replace banned/frozen sessions
   - Add/remove groups
   - Adjust delays in `config.json`
   - Review logs for errors

---

## Quick Start

1. **Install dependencies**: `pip install -r requirements.txt`
2. **Configure**: Edit `config.json` with your API credentials and bot token
3. **Add sessions**: Place `.session` files in `sessions/` folder
4. **Add groups**: Add group IDs to `groups.txt` (one per line)
5. **Start**: Run `python main.py` or use controller bot
6. **Control**: Use `/start` in controller bot to access control interface

---

## Requirements

- Python 3.7+
- Telegram API credentials (API ID and API Hash)
- Telegram session files (`.session` files from authenticated accounts)
- Controller bot token (for remote management)

See `requirements.txt` for Python package dependencies.

---

## 4. Single-User vs Multi-User Design

### Current Single-User Architecture

AdBot is currently designed as a **single-user system** where all resources are shared globally.

**Resource Sharing**:
- **Sessions**: All `.session` files in `/sessions/` folder are used by one operator
- **Groups**: Single `groups.txt` file contains all target groups
- **Configuration**: One `config.json` controls the entire system
- **Statistics**: Single `stats.json` aggregates all posting activity
- **Logs**: All logs written to `/logs/` folder without user separation
- **Authorization**: Simple Telegram user ID list (`controller_authorized_user_ids`) - all authorized users see all data

**Current Flow**:
```
┌─────────────────────────────────────┐
│   Single User / Operator            │
│  • All sessions in sessions/        │
│  • All groups in groups.txt         │
│  • One config.json                  │
│  • Global stats.json                │
│  • Global logs/                     │
│  • One controller bot               │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│      AdBot Core (main.py)           │
│  • Processes all sessions           │
│  • Posts to all groups              │
│  • Global statistics                │
└─────────────────────────────────────┘
```

**Characteristics**:
- **One Owner**: All resources belong to one operator
- **No Isolation**: All sessions, groups, and data are shared
- **Single Config**: One `config.json` controls everything
- **Global Stats**: Statistics are aggregated globally
- **Simple Authorization**: Controller bot uses simple user ID list in `config.json`

**Limitations**:

1. **No Multi-Tenancy**: Cannot support multiple independent users/operators
2. **No User Isolation**: All authorized Telegram users see all sessions, groups, and statistics
3. **No Per-User Limits**: Cannot limit sessions/groups per user or enforce plan-based restrictions
4. **No Billing Integration**: No way to track usage per user or integrate with payment systems
5. **No User Dashboard**: No per-user statistics, logs, or controls
6. **Scalability Issues**: Adding new users requires manual configuration changes and cannot scale independently
7. **Security Risk**: All authorized users have access to all data (sessions, groups, statistics)
8. **Resource Conflicts**: Multiple users cannot use the system simultaneously with isolated resources

### Folders Assuming Single User

The following folders and files assume only one user exists:

**Global Resource Folders**:
- `/sessions/` - All session files are global, no user separation
- `/logs/` - All logs written globally, no user separation
- `/groups/` - Backup group lists are global

**Global Configuration Files**:
- `config.json` - Single configuration with one `controller_authorized_user_ids` list (all authorized users share everything)
- `groups.txt` - Single group list used by all
- `stats.json` - Single statistics file aggregating all activity
- `group_blacklist.json` - Single blacklist file

**How Current Authorization Works**:
- `config.json` contains `controller_authorized_user_ids` array (e.g., `[5495140274]`)
- All Telegram users in this list can access all functionality
- No user context - all commands operate on global resources
- All authorized users see the same sessions, groups, logs, and statistics

---

## 5. Multi-User SaaS Architecture Proposal

### Design Goal

Support multiple independent users where each user has:
- Isolated sessions (cannot see other users' sessions)
- Isolated groups (cannot see other users' groups)
- Isolated logs (cannot see other users' logs)
- Isolated statistics (cannot see other users' statistics)
- Per-user resource limits (based on subscription plan)
- Secure authentication and authorization

### Proposed Folder Structure

**Option 1: File-Based User Isolation** (Simpler, good for small scale):

```
/adbot/
├── main.py                    # Core engine (user-aware)
├── config.json                # Global config (database URL, API settings)
├── users/                     # Per-user isolation
│   ├── {user_id_1}/
│   │   ├── sessions/          # User 1's sessions only
│   │   ├── groups.txt         # User 1's groups only
│   │   ├── groups/            # User 1's backup group lists
│   │   ├── stats.json         # User 1's statistics only
│   │   ├── logs/              # User 1's logs only
│   │   ├── config.json        # User 1's per-user config (post links, delays)
│   │   └── group_blacklist.json
│   ├── {user_id_2}/
│   │   ├── sessions/
│   │   ├── groups.txt
│   │   ├── groups/
│   │   ├── stats.json
│   │   ├── logs/
│   │   ├── config.json
│   │   └── group_blacklist.json
│   └── ...
├── api/                       # REST API layer
│   ├── auth.py                # Authentication middleware
│   ├── routes/
│   │   ├── bot.py             # Bot control endpoints
│   │   ├── sessions.py        # Session management endpoints
│   │   ├── groups.py          # Group management endpoints
│   │   ├── stats.py           # Statistics endpoints
│   │   └── logs.py            # Log retrieval endpoints
│   └── middleware.py          # User isolation enforcement
└── database/                  # User metadata database
    └── users.db               # SQLite/PostgreSQL (users, plans, limits)
```

**Option 2: Database-Based Storage** (Better for scale, recommended):

```
/adbot/
├── main.py                    # Core engine (user-aware)
├── config.json                # Global config
├── database/
│   ├── users.db               # User metadata, plans, limits
│   ├── sessions.db            # Session registry (user_id, filename, status)
│   ├── groups.db              # Groups table (user_id, group_id, status)
│   ├── stats.db               # Statistics (user_id, metrics, timestamps)
│   └── logs.db                # Logs (user_id, timestamp, level, message)
├── sessions/                  # Physical session files storage
│   ├── {user_id_1}/
│   │   ├── session1.session
│   │   └── session2.session
│   ├── {user_id_2}/
│   │   └── session1.session
│   └── ...
├── api/                       # REST API layer
└── workers/                   # Per-user worker processes
    └── user_{user_id}_worker.py
```

### Key Architectural Changes

#### 1. User Management Layer

**Database Schema**:
```
users:
  - id (PRIMARY KEY)
  - email (UNIQUE)
  - password_hash
  - plan (free, basic, premium)
  - created_at
  - updated_at

user_limits:
  - user_id (FOREIGN KEY)
  - max_sessions (based on plan)
  - max_groups (based on plan)
  - max_posts_per_day (based on plan)
  - current_sessions_count
  - current_groups_count
  - posts_today_count
```

**Authentication**:
- JWT token-based authentication
- API keys for programmatic access
- Session management (refresh tokens)

#### 2. Resource Isolation

**Sessions Isolation**:
- Physical separation: `/sessions/{user_id}/*.session`
- Database registry: `sessions` table with `user_id` column
- API enforces: Users can only access their own sessions
- Core engine: Worker processes load sessions for specific user only

**Groups Isolation**:
- Per-user `groups.txt`: `/users/{user_id}/groups.txt`
- OR database table: `groups` with `user_id` column
- API enforces: Users can only manage their own groups
- Core engine: Worker processes load groups for specific user only

**Logs Isolation**:
- Per-user log files: `/users/{user_id}/logs/adbot_YYYYMMDD.log`
- OR database table: `logs` with `user_id` column
- API enforces: Users can only view their own logs
- Log streaming: Filter by `user_id` before sending to frontend

**Statistics Isolation**:
- Per-user stats: `/users/{user_id}/stats.json`
- OR database table: `statistics` with `user_id` column
- API enforces: Users can only view their own statistics
- Aggregation: All queries filtered by `user_id`

**Configuration Isolation**:
- Per-user config: `/users/{user_id}/config.json` (post links, delays)
- Global config: `/config.json` (system-wide settings, API credentials)

#### 3. Session Assignment Per User

**Current Behavior** (Single-User):
- All sessions in `/sessions/` are distributed to all groups in `groups.txt`

**Proposed Behavior** (Multi-User):
- Each user's sessions are distributed only to that user's groups
- User 1's sessions → User 1's groups only
- User 2's sessions → User 2's groups only
- No cross-user session/group mixing

**Implementation**:
```python
# Pseudo-code for user-aware session distribution
def distribute_groups_for_user(user_id, user_sessions, user_groups):
    # Only distribute user's groups to user's sessions
    return distribute_evenly(user_sessions, user_groups)
```

#### 4. Core Engine Changes

**Current Core** (`main.py`):
- Loads all sessions from `/sessions/`
- Loads all groups from `groups.txt`
- Processes everything globally

**Proposed Core** (User-Aware):
- Accepts `user_id` parameter for all operations
- Loads sessions from `/sessions/{user_id}/` OR database filtered by `user_id`
- Loads groups from `/users/{user_id}/groups.txt` OR database filtered by `user_id`
- Processes only that user's resources
- Worker processes: One worker pool per user (or shared pool with user context)

**Worker Process Example**:
```python
# Pseudo-code for user-aware worker
async def start_adbot_worker_for_user(user_id, controller_app):
    # Load user-specific resources
    user_sessions = load_sessions_for_user(user_id)
    user_groups = load_groups_for_user(user_id)
    user_config = load_config_for_user(user_id)
    
    # Initialize clients for user's sessions only
    clients = await initialize_clients_for_user(user_id, user_sessions, user_config)
    
    # Distribute user's groups to user's sessions
    groups_distribution = distribute_groups(user_sessions, user_groups)
    
    # Start forwarding loop (user context maintained)
    await forwarding_loop(user_id, clients, groups_distribution, user_config, controller_app)
```

#### 5. Resource Limits Enforcement

**Plan-Based Limits**:
- Free plan: 1 session, 10 groups, 100 posts/day
- Basic plan: 5 sessions, 50 groups, 1000 posts/day
- Premium plan: Unlimited sessions, unlimited groups, unlimited posts

**Enforcement Points**:
- Session upload: Check `current_sessions_count < max_sessions`
- Group addition: Check `current_groups_count < max_groups`
- Posting: Check `posts_today_count < max_posts_per_day`
- Worker startup: Validate limits before starting

#### 6. One Core Engine for Many Users

**Architecture Pattern**:

**Option A: Separate Worker Processes** (Process isolation):
- One Python process per active user
- Each process runs `start_adbot_worker_for_user(user_id)`
- Complete isolation (one user's crash doesn't affect others)
- Resource intensive (one process per user)

**Option B: Shared Worker Pool with User Context** (Efficient):
- One worker pool with multiple worker threads/processes
- Each worker task has `user_id` context
- Workers load user-specific resources on task start
- More efficient (fewer processes), requires careful isolation

**Option C: Queue-Based Task System** (Scalable):
- Users submit posting tasks to queue (Redis/RabbitMQ)
- Worker pool processes tasks with `user_id` from queue
- Workers load user resources per task
- Most scalable (can scale workers independently)

**Recommended**: Start with Option B (shared pool with user context), migrate to Option C as scale increases.

### API Layer

**Required Endpoints**:
```
POST   /api/auth/register          # User registration
POST   /api/auth/login             # User login (returns JWT)
GET    /api/auth/me                # Get current user info

POST   /api/bot/start              # Start AdBot for current user
POST   /api/bot/stop               # Stop AdBot for current user
GET    /api/bot/status             # Get bot status for current user

GET    /api/sessions               # List current user's sessions
POST   /api/sessions               # Upload session (ZIP)
DELETE /api/sessions/{session_id}  # Remove session

GET    /api/groups                 # List current user's groups
POST   /api/groups                 # Add group(s)
DELETE /api/groups/{group_id}      # Remove group

GET    /api/stats                  # Get current user's statistics
GET    /api/logs                   # Get current user's logs (filtered)
GET    /api/logs/stream            # Stream current user's logs (SSE/WebSocket)
```

**Authentication Middleware**:
- Extract JWT token from `Authorization` header
- Validate token and extract `user_id`
- Attach `user_id` to request context
- All database/file queries filtered by `user_id`

---

## 6. Next.js Frontend Integration

### Architecture Overview

```
┌─────────────────────────────────────┐
│   Next.js Frontend (Dashboard)      │
│  • User Authentication (NextAuth)   │
│  • Dashboard UI                     │
│  • Real-time Status Updates         │
│  • Statistics Charts                │
│  • Session/Group Management         │
└──────────────┬──────────────────────┘
               │ HTTP/REST API
               ↓
┌─────────────────────────────────────┐
│   API Server (FastAPI/Flask)        │
│  • Authentication Middleware        │
│  • Request Validation               │
│  • User Isolation Enforcement       │
│  • Rate Limiting                    │
└──────────────┬──────────────────────┘
               │ Internal Calls
               ↓
┌─────────────────────────────────────┐
│   AdBot Core (main.py)              │
│  • Start/Stop Controls              │
│  • Session Management               │
│  • Group Management                 │
│  • Statistics Retrieval             │
│  • Log Streaming                    │
└─────────────────────────────────────┘
```

### Required API Actions

#### Bot Control Endpoints

**Start AdBot**:
```
POST /api/bot/start
Headers: Authorization: Bearer {jwt_token}
Response: { "status": "started", "message": "AdBot started successfully" }
```

**Stop AdBot**:
```
POST /api/bot/stop
Headers: Authorization: Bearer {jwt_token}
Response: { "status": "stopped", "message": "AdBot stopped successfully" }
```

**Get Status**:
```
GET /api/bot/status
Headers: Authorization: Bearer {jwt_token}
Response: {
  "status": "running" | "stopped",
  "posting_status": "running" | "stopped",
  "active_sessions": 3,
  "total_groups": 50,
  "current_post_link": "t.me/channel/123"
}
```

**Health Check**:
```
GET /api/bot/health
Headers: Authorization: Bearer {jwt_token}
Response: {
  "healthy": true,
  "active_sessions": 3,
  "frozen_sessions": 1,
  "banned_sessions": 0
}
```

#### Statistics Endpoints

**Get Statistics**:
```
GET /api/stats
Headers: Authorization: Bearer {jwt_token}
Response: {
  "uptime_seconds": 3600,
  "total_posts": 500,
  "total_success": 480,
  "total_failures": 20,
  "success_rate": 0.96,
  "accounts": [...],
  "groups": [...]
}
```

**Get Statistics Summary** (Lightweight):
```
GET /api/stats/summary
Headers: Authorization: Bearer {jwt_token}
Response: {
  "total_posts": 500,
  "success_rate": 0.96,
  "posts_today": 100,
  "active_sessions": 3
}
```

#### Logs Endpoints

**Get Logs** (Paginated):
```
GET /api/logs?page=1&limit=100&level=ERROR
Headers: Authorization: Bearer {jwt_token}
Response: {
  "logs": [...],
  "total": 1000,
  "page": 1,
  "limit": 100
}
```

**Stream Logs** (Server-Sent Events):
```
GET /api/logs/stream
Headers: Authorization: Bearer {jwt_token}
Content-Type: text/event-stream

data: {"timestamp": "...", "level": "INFO", "message": "..."}
data: {"timestamp": "...", "level": "ERROR", "message": "..."}
```

#### Session Management Endpoints

**List Sessions**:
```
GET /api/sessions
Headers: Authorization: Bearer {jwt_token}
Response: {
  "sessions": [
    {
      "id": "session_123",
      "filename": "account1.session",
      "status": "ACTIVE",
      "username": "@account1",
      "phone": "+1234567890"
    }
  ]
}
```

**Upload Session** (ZIP):
```
POST /api/sessions
Headers: Authorization: Bearer {jwt_token}
Content-Type: multipart/form-data
Body: file (ZIP containing .session files)

Response: {
  "uploaded": 2,
  "sessions": [...]
}
```

**Remove Session**:
```
DELETE /api/sessions/{session_id}
Headers: Authorization: Bearer {jwt_token}
Response: { "status": "removed" }
```

#### Group Management Endpoints

**List Groups**:
```
GET /api/groups
Headers: Authorization: Bearer {jwt_token}
Response: {
  "groups": [
    {"id": "group_1", "group_id": "-1001234567890", "status": "ACTIVE"},
    ...
  ],
  "total": 50
}
```

**Add Groups** (Bulk):
```
POST /api/groups
Headers: Authorization: Bearer {jwt_token}
Body: {
  "groups": ["-1001234567890", "-1009876543210", ...]
}

Response: {
  "added": 10,
  "duplicates": 2,
  "total": 50
}
```

**Add Chatlist**:
```
POST /api/groups/chatlist
Headers: Authorization: Bearer {jwt_token}
Body: {
  "chatlist_link": "https://t.me/addlist/..."
}

Response: {
  "added": 25,
  "failed": 2,
  "total": 75
}
```

**Remove Group**:
```
DELETE /api/groups/{group_id}
Headers: Authorization: Bearer {jwt_token}
Response: { "status": "removed" }
```

### Dashboard Implementation

#### Authentication & User Isolation

**Backend (API Server)**:
- All endpoints require JWT token in `Authorization` header
- Middleware extracts `user_id` from JWT token
- All database/file queries filtered by `user_id`
- User cannot access other users' resources (enforced at API layer)

**Frontend (Next.js)**:
- NextAuth.js for authentication
- JWT stored in HTTP-only cookie or session storage
- All API calls include `Authorization: Bearer {token}` header
- Frontend routes protected (redirect to login if not authenticated)

**Example Middleware** (FastAPI):
```python
@app.middleware("http")
async def authenticate_request(request: Request, call_next):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    
    user = verify_jwt_token(token)
    if not user:
        return JSONResponse({"error": "Invalid token"}, status_code=401)
    
    request.state.user_id = user["id"]  # Attach user_id to request
    response = await call_next(request)
    return response
```

#### Dashboard Pages

**Dashboard Home** (`/dashboard`):
- Real-time status (running/stopped)
- Quick stats (total posts, success rate, active sessions)
- Start/Stop button
- Recent activity feed

**Sessions Page** (`/dashboard/sessions`):
- List of all user's sessions with status
- Upload session button (ZIP file)
- Remove session action
- Session health indicators

**Groups Page** (`/dashboard/groups`):
- List of all user's groups
- Add groups (bulk input or chatlist link)
- Remove group action
- Group status (active, blacklisted)

**Statistics Page** (`/dashboard/stats`):
- Charts (posts over time, success rate, etc.)
- Per-account performance
- Per-group performance
- Export statistics (JSON/CSV)

**Logs Page** (`/dashboard/logs`):
- Real-time log stream (Server-Sent Events)
- Log filtering (level, date range)
- Download logs button
- Search logs

**Settings Page** (`/dashboard/settings`):
- Post links management
- Delay settings (between posts, between cycles)
- Account limits (based on plan)
- Subscription management

#### Real-time Updates

**Polling** (Simple):
- Frontend polls `/api/bot/status` every 5 seconds
- Updates UI when status changes

**WebSocket/SSE** (Recommended):
- WebSocket connection: `ws://api.example.com/ws?token={jwt}`
- Server pushes updates: status changes, new logs, statistics updates
- Frontend receives real-time updates without polling

**Server-Sent Events** (For Logs):
- SSE endpoint: `/api/logs/stream`
- Frontend subscribes to log stream
- Server pushes new log entries as they occur

### Where Authentication & User Isolation Happen

**1. API Layer** (Primary Enforcement):
- Authentication middleware validates JWT token
- Extracts `user_id` from token
- Attaches `user_id` to request context
- All endpoints filter resources by `user_id`

**2. Core Engine** (`main.py`):
- Accepts `user_id` parameter for all operations
- Loads user-specific resources (sessions, groups, config)
- Worker processes maintain user context
- Statistics/logs tagged with `user_id`

**3. Database Layer**:
- All tables include `user_id` column (foreign key to `users`)
- All queries filtered by `user_id`
- Database-level constraints prevent cross-user access

**4. File System** (If using file-based isolation):
- All user files in `/users/{user_id}/` directories
- File paths constructed with `user_id`
- OS-level permissions (optional additional security)

**Security Principle**: **Defense in Depth** - User isolation enforced at multiple layers (API, Core Engine, Database, File System).

---

## 7. Recommended Improvements

### Folder Structure Improvements

**Current Issues**:
- Global resources mixed with user-specific data
- No clear separation between system files and user data
- Hard to scale to multiple users

**Recommendations**:

1. **Separate System and User Data**:
   ```
   /adbot/
   ├── system/              # System-wide files
   │   ├── config.json      # Global config (API keys, system settings)
   │   └── requirements.txt
   ├── users/               # User-specific data
   │   └── {user_id}/       # Per-user folders
   └── api/                 # API layer
   ```

2. **Use Database for Metadata** (instead of JSON files):
   - Sessions registry → `sessions` database table
   - Statistics → `statistics` database table
   - User metadata → `users` database table
   - Faster queries, better scalability, concurrent access support

3. **Session Files Organization**:
   - Store in `/sessions/{user_id}/` instead of flat `/sessions/`
   - Database table tracks which user owns which session
   - Prevents accidental access to other users' sessions

4. **Log Rotation and Archival**:
   - Current: Logs accumulate in `/logs/` indefinitely
   - Recommended: Rotate logs daily, archive old logs to `/logs/archive/{YYYY-MM}/`
   - Delete logs older than 90 days (configurable)

### Scalability Fixes

**Current Limitations**:
- Single-process architecture
- Global file locks on `stats.json` and `config.json`
- No horizontal scaling capability

**Recommendations**:

1. **Database for Shared State**:
   - Replace file-based `stats.json` with database
   - Replace file-based `group_blacklist.json` with database
   - Use database transactions for atomic updates
   - Enables multiple worker processes without file conflicts

2. **Worker Process Isolation**:
   - Separate worker processes per user (or per user group)
   - Prevents one user's issues from affecting others
   - Allows independent scaling per user

3. **Queue-Based Task System**:
   - Use Redis/RabbitMQ for posting task queue
   - Workers pull tasks from queue
   - Enables horizontal scaling (add more workers as needed)
   - Better resource utilization

4. **Caching Layer**:
   - Cache frequently accessed data (user config, session status)
   - Use Redis for distributed caching
   - Reduces database load

5. **Load Balancing** (For API):
   - Multiple API server instances behind load balancer
   - Stateless API design (JWT tokens, no server-side sessions)
   - Horizontal scaling capability

### Security Concerns

**Current Vulnerabilities**:

1. **No User Isolation**: All authorized users see all data
2. **File-Based Authorization**: Simple user ID list in `config.json`
3. **No Rate Limiting**: API endpoints can be abused
4. **Session File Security**: Session files contain sensitive authentication data
5. **No Encryption**: Session files stored in plain text

**Recommendations**:

1. **Implement Proper Authentication**:
   - Replace simple user ID list with JWT-based authentication
   - Password hashing (bcrypt, Argon2)
   - Token refresh mechanism
   - Session management

2. **User Isolation Enforcement**:
   - API middleware enforces user isolation (all queries filtered by `user_id`)
   - Core engine accepts `user_id` parameter
   - Database queries always include `user_id` filter
   - File paths constructed with `user_id`

3. **Session File Security**:
   - Encrypt session files at rest (AES-256)
   - Secure file permissions (600 - owner read/write only)
   - Store encryption keys in secure key management system (AWS KMS, HashiCorp Vault)

4. **API Security**:
   - Rate limiting per user (prevent abuse)
   - Input validation (sanitize all inputs)
   - CORS configuration (restrict to frontend domain)
   - API key rotation mechanism

5. **Secrets Management**:
   - Move API credentials from `config.json` to environment variables
   - Use secret management service (AWS Secrets Manager, etc.)
   - Never commit secrets to version control

6. **Audit Logging**:
   - Log all user actions (who did what, when)
   - Track API access patterns
   - Monitor for suspicious activity

### Performance Optimizations

**Current Bottlenecks**:

1. **File I/O**: Reading/writing JSON files for statistics
2. **Synchronous Operations**: Blocking I/O operations
3. **Global Locks**: File locks on shared resources
4. **Memory Usage**: Loading all sessions/groups into memory

**Recommendations**:

1. **Database Instead of Files**:
   - Statistics → Database (faster queries, indexing)
   - Configuration → Database (easier updates, versioning)
   - Logs → Database or log aggregation service (Elasticsearch)

2. **Async Operations**:
   - Use async I/O for all file/database operations
   - Async worker processes (already using asyncio)
   - Non-blocking API endpoints

3. **Batch Operations**:
   - Batch statistics updates (update every N posts, not every post)
   - Batch log writes (buffer logs, write in batches)
   - Reduce I/O operations

4. **Connection Pooling**:
   - Database connection pooling (SQLAlchemy, asyncpg)
   - Telegram client connection reuse
   - Reduce connection overhead

5. **Caching**:
   - Cache session status (check every N minutes, not every request)
   - Cache user configuration (refresh on update)
   - Cache statistics (update in background, serve cached data)

6. **Background Tasks**:
   - Health checks in background (don't block posting)
   - Statistics aggregation in background
   - Log archival in background

7. **Resource Limits**:
   - Limit concurrent posting tasks per user
   - Rate limit API calls per user
   - Memory limits per worker process

### Additional Recommendations

1. **Monitoring & Alerting**:
   - Health check endpoints (`/api/health`)
   - Metrics collection (Prometheus)
   - Alerting for system issues (banned accounts, high error rates)

2. **Backup & Recovery**:
   - Automated backups of database
   - Session file backups (encrypted)
   - Disaster recovery plan

3. **Documentation**:
   - API documentation (OpenAPI/Swagger)
   - Deployment guide
   - Troubleshooting guide

4. **Testing**:
   - Unit tests for core functions
   - Integration tests for API endpoints
   - End-to-end tests for posting workflow

5. **Migration Path**:
   - Phased migration from single-user to multi-user
   - Backward compatibility during transition
   - Data migration scripts for existing users
