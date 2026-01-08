# Python Backend API

This is a **minimal HTTP wrapper** for the Telethon adbot engine.

## Purpose

This backend is a **DUMB EXECUTION ENGINE** that only:
- ✅ Starts adbots
- ✅ Stops adbots  
- ✅ Returns status
- ✅ Returns logs

## What it does NOT do

- ❌ NO database logic
- ❌ NO authentication
- ❌ NO payment processing
- ❌ NO user management
- ❌ NO business logic

All of that is handled by the Next.js frontend.

## Setup

1. Install dependencies:
```bash
pip install -r requirements_api.txt
```

2. Run the server:
```bash
python api_wrapper.py
```

The server will start on `http://localhost:8000`

## API Endpoints

### Health Check
```
GET /health
```

### Start Adbot
```
POST /api/adbot/start
Content-Type: application/json

{
  "adbot_id": "uuid",
  "user_id": "uuid",
  "post_link": "https://t.me/...",
  "target_groups": ["group1", "group2"],
  "posting_interval_minutes": 60,
  "sessions": [
    {
      "phone_number": "+1234567890",
      "api_id": "12345",
      "api_hash": "abc123",
      "session_file_path": "/path/to/session.session"
    }
  ]
}
```

### Stop Adbot
```
POST /api/adbot/stop
Content-Type: application/json

{
  "adbot_id": "uuid"
}
```

### Get Status
```
GET /api/adbot/status/{adbot_id}
```

### Get Logs
```
GET /api/adbot/logs/{adbot_id}?lines=100
```

### Sync Config
```
POST /api/adbot/sync
Content-Type: application/json

{
  "adbot_id": "uuid",
  ...config
}
```

## Directory Structure

```
backend/
├── api_wrapper.py          # HTTP API wrapper
├── requirements_api.txt    # API dependencies
├── Adbot/                  # Original Telethon logic
│   └── main.py
├── sessions/               # Telegram session files
├── logs/                   # Adbot logs
└── data/                   # Adbot configs
```

## Production Deployment

For production on a VPS:

1. Use a process manager like `systemd` or `supervisor`
2. Set up proper logging
3. Configure CORS to only allow your frontend domain
4. Use environment variables for configuration
5. Set up monitoring and alerts

Example systemd service:

```ini
[Unit]
Description=HQAdz Python Backend
After=network.target

[Service]
Type=simple
User=hqadz
WorkingDirectory=/path/to/backend
ExecStart=/usr/bin/python3 api_wrapper.py
Restart=always

[Install]
WantedBy=multi-user.target
```


