# AdBot FastAPI Wrapper

HTTP API layer that controls the existing AdBot without modifying it.

## Architecture

```
Frontend (Next.js) → FastAPI → AdBot (Python)
                    ↓
              config.json, stats.json, logs/
```

## Project Structure

```
backend/
├── Adbot/              # Existing AdBot (UNCHANGED)
│   ├── main.py
│   ├── config.json
│   ├── stats.json
│   ├── sessions/
│   ├── logs/
│   └── groups/
└── api/                 # New FastAPI wrapper
    ├── main.py          # FastAPI app
    ├── core/            # Core utilities
    │   ├── process_manager.py
    │   ├── config_loader.py
    │   └── auth.py
    └── routes/          # API routes
        ├── bot.py        # Start/stop/status
        ├── config.py     # Config management
        ├── logs.py       # Log access
        ├── stats.py      # Statistics
        ├── groups.py     # Group management
        └── sessions.py   # Session management
```

## Installation

```bash
cd backend/api
pip install -r requirements.txt
```

## Running the API

### Development

```bash
cd backend/api
python -m backend.api.main
```

Or with uvicorn directly:

```bash
cd backend
uvicorn backend.api.main:app --reload --host 0.0.0.0 --port 8000
```

### Production

Use a process manager like `supervisor`, `systemd`, or `pm2`:

```bash
# With supervisor
supervisorctl start adbot-api

# With systemd
systemctl start adbot-api

# With pm2
pm2 start backend/api/main.py --name adbot-api --interpreter python
```

## Environment Variables

Create `.env` file in `backend/api/`:

```env
# API Configuration
API_PORT=8000
ENV=production

# Authentication
ADBOT_API_KEY=your-secret-api-key-here
JWT_SECRET=your-jwt-secret-here

# Frontend URL (for CORS)
FRONTEND_URL=https://your-frontend.vercel.app
```

## API Endpoints

### Bot Control

- `POST /api/bot/start` - Start AdBot
- `POST /api/bot/stop` - Stop AdBot
- `POST /api/bot/restart` - Restart AdBot
- `GET /api/bot/status` - Get bot status
- `GET /api/bot/health` - Health check (no auth)

### Configuration

- `GET /api/config/` - Get full config
- `GET /api/config/post-links` - Get post links
- `POST /api/config/post-links` - Set post links
- `POST /api/config/post-links/add` - Add post link
- `DELETE /api/config/post-links` - Remove post link
- `GET /api/config/delays` - Get delays
- `POST /api/config/delays/posts` - Set delay between posts
- `POST /api/config/delays/cycles` - Set delay between cycles
- `GET /api/config/accounts` - Get accounts
- `POST /api/config/accounts` - Add account
- `DELETE /api/config/accounts/{api_id}` - Remove account

### Logs

- `GET /api/logs/` - List log files
- `GET /api/logs/latest` - Get latest log (last N lines)
- `GET /api/logs/{filename}` - Get specific log file
- `GET /api/logs/{filename}/download` - Download log file

### Statistics

- `GET /api/stats/` - Get full statistics
- `GET /api/stats/summary` - Get statistics summary

### Groups

- `GET /api/groups/` - Get all groups
- `POST /api/groups/` - Set groups
- `POST /api/groups/add` - Add group
- `DELETE /api/groups/{group}` - Remove group
- `GET /api/groups/backups` - List group backups

### Sessions

- `GET /api/sessions/` - List session files
- `GET /api/sessions/status` - Get sessions status
- `DELETE /api/sessions/{filename}` - Remove session

## Authentication

All endpoints (except `/health` and `/api/bot/health`) require authentication.

### Option 1: API Key

Add header:
```
X-API-Key: your-secret-api-key-here
```

### Option 2: JWT Token

Add header:
```
Authorization: Bearer <jwt-token>
```

## Example Requests

### Start Bot

```bash
curl -X POST http://localhost:8000/api/bot/start \
  -H "X-API-Key: your-secret-api-key-here"
```

### Get Status

```bash
curl http://localhost:8000/api/bot/status \
  -H "X-API-Key: your-secret-api-key-here"
```

### Set Post Links

```bash
curl -X POST http://localhost:8000/api/config/post-links \
  -H "X-API-Key: your-secret-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{"links": ["t.me/channel/123", "t.me/channel/456"]}'
```

### Get Latest Logs

```bash
curl "http://localhost:8000/api/logs/latest?lines=100" \
  -H "X-API-Key: your-secret-api-key-here"
```

## Integration with Frontend

Update your Next.js frontend to call the FastAPI backend:

```typescript
// lib/api.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

export async function startBot() {
  const response = await fetch(`${API_BASE_URL}/api/bot/start`, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
    },
  });
  return response.json();
}

export async function getBotStatus() {
  const response = await fetch(`${API_BASE_URL}/api/bot/status`, {
    headers: {
      'X-API-Key': API_KEY,
    },
  });
  return response.json();
}
```

## Important Notes

1. **No Changes to AdBot**: The existing AdBot code remains completely unchanged
2. **Single Source of Truth**: Both Telegram controller and website control the same AdBot instance
3. **Process Management**: The API manages the AdBot process lifecycle (start/stop/restart)
4. **Config Safety**: All config writes create backups automatically
5. **Security**: API key or JWT required for all operations

## Troubleshooting

### AdBot not found

Ensure `backend/Adbot/main.py` exists. The API looks for it relative to the project root.

### Permission errors

Ensure the API process has read/write permissions to:
- `backend/Adbot/config.json`
- `backend/Adbot/stats.json`
- `backend/Adbot/logs/`
- `backend/Adbot/sessions/`
- `backend/Adbot/groups/`

### Process won't start

Check:
1. Python is in PATH
2. AdBot dependencies are installed (`backend/Adbot/requirements.txt`)
3. AdBot config.json is valid
4. No port conflicts

## Development

The API is designed to be:
- **Non-invasive**: Zero changes to existing AdBot
- **Safe**: Automatic backups, validation, error handling
- **Scalable**: Ready for production deployment
- **Maintainable**: Clean separation of concerns

