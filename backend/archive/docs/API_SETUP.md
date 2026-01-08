# FastAPI AdBot Wrapper - Quick Setup

## ✅ What Was Built

A complete FastAPI HTTP API wrapper that controls your existing AdBot **without modifying any AdBot code**.

## 📁 Structure Created

```
backend/
├── Adbot/              # Your existing AdBot (UNCHANGED)
│   └── (all your files)
│
└── api/                # NEW: FastAPI wrapper
    ├── main.py         # FastAPI application
    ├── core/           # Core utilities
    │   ├── process_manager.py    # Start/stop AdBot process
    │   ├── config_loader.py      # Read/write config.json
    │   └── auth.py               # API authentication
    ├── routes/         # API endpoints
    │   ├── bot.py      # /api/bot/* (start, stop, status)
    │   ├── config.py   # /api/config/* (post links, delays, accounts)
    │   ├── logs.py     # /api/logs/* (read logs)
    │   ├── stats.py    # /api/stats/* (statistics)
    │   ├── groups.py   # /api/groups/* (manage groups)
    │   └── sessions.py # /api/sessions/* (session management)
    ├── requirements.txt
    ├── README.md
    └── start.sh / start.bat
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd backend/api
pip install -r requirements.txt
```

### 2. Set Environment Variables

Create `backend/api/.env`:

```env
API_PORT=8000
ADBOT_API_KEY=your-secret-key-here
FRONTEND_URL=http://localhost:3000
```

### 3. Start the API

```bash
# Linux/Mac
cd backend
python -m backend.api.main

# Or use the start script
bash backend/api/start.sh

# Windows
backend\api\start.bat
```

### 4. Test the API

```bash
# Health check (no auth)
curl http://localhost:8000/health

# Get bot status (requires auth)
curl http://localhost:8000/api/bot/status \
  -H "X-API-Key: your-secret-key-here"
```

## 🔌 API Endpoints

### Bot Control
- `POST /api/bot/start` - Start AdBot
- `POST /api/bot/stop` - Stop AdBot  
- `POST /api/bot/restart` - Restart AdBot
- `GET /api/bot/status` - Get status

### Configuration
- `GET /api/config/post-links` - Get post links
- `POST /api/config/post-links` - Set post links
- `POST /api/config/delays/posts` - Set delay between posts
- `POST /api/config/delays/cycles` - Set delay between cycles

### Logs & Stats
- `GET /api/logs/latest` - Get latest logs
- `GET /api/stats/summary` - Get statistics summary

### Groups & Sessions
- `GET /api/groups/` - List groups
- `POST /api/groups/add` - Add group
- `GET /api/sessions/` - List sessions

## 🔗 Frontend Integration

Update your Next.js frontend to call the FastAPI backend:

```typescript
// frontend/lib/adbot-api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

export async function startBot() {
  const res = await fetch(`${API_URL}/api/bot/start`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY },
  });
  return res.json();
}

export async function getBotStatus() {
  const res = await fetch(`${API_URL}/api/bot/status`, {
    headers: { 'X-API-Key': API_KEY },
  });
  return res.json();
}

export async function setPostLinks(links: string[]) {
  const res = await fetch(`${API_URL}/api/config/post-links`, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ links }),
  });
  return res.json();
}
```

## ✅ Key Features

1. **Zero Changes to AdBot** - Your existing code is untouched
2. **Process Management** - Start/stop/restart AdBot via API
3. **Config Management** - Update config.json safely with backups
4. **Log Access** - Read logs via API
5. **Statistics** - Get stats from stats.json
6. **Authentication** - API key or JWT support
7. **CORS** - Configured for your frontend

## 🔒 Security

- All endpoints require authentication (except `/health`)
- API key or JWT token in headers
- File path validation prevents directory traversal
- Automatic config backups before writes

## 📝 Next Steps

1. **Install dependencies**: `pip install -r backend/api/requirements.txt`
2. **Set API key**: Update `backend/api/.env`
3. **Start API**: Run `python -m backend.api.main`
4. **Update frontend**: Point API calls to FastAPI backend
5. **Test**: Verify bot control works from website

## 🎯 Architecture

```
Frontend (Next.js) 
    ↓ HTTP API
FastAPI Wrapper
    ↓ Process Control / File Access
AdBot (Python) ← UNCHANGED
```

Both Telegram bot and website control the same AdBot instance!

## 📚 Documentation

- `backend/api/README.md` - Full API documentation
- `backend/INTEGRATION.md` - Integration details
- `backend/api/requirements.txt` - Dependencies

## ⚠️ Important Notes

1. **AdBot code is unchanged** - All your existing logic preserved
2. **Telegram bot still works** - Controller bot unchanged
3. **Single source of truth** - Same config.json, stats.json
4. **Process safety** - FastAPI manages process lifecycle
5. **Production ready** - Use supervisor/systemd for deployment

