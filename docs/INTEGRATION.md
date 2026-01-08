# AdBot Integration Guide

This document explains how the FastAPI wrapper integrates with the existing AdBot.

## Architecture Overview

```
┌─────────────────┐
│  Next.js        │
│  Frontend       │
└────────┬────────┘
         │ HTTP API
         │
┌────────▼────────┐
│  FastAPI        │
│  API Wrapper    │
└────────┬────────┘
         │
         │ Process Control
         │ Config Read/Write
         │
┌────────▼────────┐
│  AdBot          │
│  (main.py)      │
└─────────────────┘
```

## Integration Points

### 1. Process Management

The FastAPI wrapper controls the AdBot process lifecycle:

- **Start**: Spawns `python backend/Adbot/main.py` as a subprocess
- **Stop**: Sends SIGTERM, then SIGKILL if needed
- **Status**: Monitors process via PID file and psutil

**No changes needed in AdBot** - it runs exactly as before.

### 2. Configuration Management

The wrapper reads/writes `backend/Adbot/config.json`:

- **Read**: Loads config for API responses
- **Write**: Updates config with automatic backups
- **Validation**: Ensures JSON is valid before writing

**AdBot continues to read config.json as before** - no changes needed.

### 3. Statistics

The wrapper reads `backend/Adbot/stats.json`:

- **Read-only**: Never modifies stats.json
- **AdBot writes stats**: AdBot continues to update stats.json
- **API exposes stats**: Website can view stats via API

**No changes needed in AdBot** - stats.json remains the source of truth.

### 4. Logs

The wrapper provides read-only access to `backend/Adbot/logs/`:

- **List logs**: Shows available log files
- **Read logs**: Returns log content
- **Download logs**: Allows log file downloads

**AdBot continues to write logs as before** - no changes needed.

### 5. Groups

The wrapper manages `backend/Adbot/groups.txt`:

- **Read**: Lists groups from groups.txt
- **Write**: Updates groups.txt (with backup)
- **Add/Remove**: Modifies groups.txt

**AdBot reads groups.txt on startup** - no changes needed.

### 6. Sessions

The wrapper provides read-only access to `backend/Adbot/sessions/`:

- **List sessions**: Shows available .session files
- **Remove session**: Deletes session files (for cleanup)
- **Status**: Reads session status from stats.json

**AdBot manages sessions as before** - no changes needed.

## Dual Control System

Both the Telegram controller bot and the website can control the same AdBot:

```
Telegram Bot ──┐
               ├──> AdBot (single instance)
Website API ───┘
```

### How It Works

1. **Telegram Bot**: Continues to work exactly as before
2. **Website API**: Provides HTTP endpoints that mirror Telegram commands
3. **Shared State**: Both read/write the same config.json and stats.json
4. **Process Control**: Only one process manager (FastAPI) controls the AdBot process

### Conflict Prevention

- **Config writes**: FastAPI creates backups before writing
- **Process control**: FastAPI is the single source of truth for start/stop
- **Read operations**: Both can read simultaneously (no conflicts)

## File Access Patterns

### AdBot Writes, API Reads

- `stats.json` - AdBot writes, API reads
- `logs/*.log` - AdBot writes, API reads
- `sessions/*.session` - AdBot creates, API can list/remove

### API Writes, AdBot Reads

- `config.json` - API can write, AdBot reads on startup/restart
- `groups.txt` - API can write, AdBot reads on startup

### Shared Writes (with locks)

- `config.json` - Both can write (FastAPI uses file locks)
- Process state - FastAPI manages, AdBot respects

## No Breaking Changes

✅ **AdBot code unchanged** - All existing functionality preserved
✅ **Telegram bot unchanged** - Controller bot works as before
✅ **Config format unchanged** - Same JSON structure
✅ **File structure unchanged** - Same directories and files
✅ **Dependencies unchanged** - AdBot requirements.txt unchanged

## Testing the Integration

1. **Start AdBot via Telegram**: Use `/start` command in Telegram bot
2. **Check status via API**: `GET /api/bot/status`
3. **Stop via API**: `POST /api/bot/stop`
4. **Start via API**: `POST /api/bot/start`
5. **Verify in Telegram**: Check bot status via Telegram

Both should show the same state because they control the same process.

## Deployment

### Development

1. Run AdBot Telegram controller (as before)
2. Run FastAPI wrapper: `python -m backend.api.main`
3. Frontend connects to FastAPI

### Production

1. Deploy AdBot to VPS (as before)
2. Deploy FastAPI to same VPS
3. Use process manager (supervisor/systemd) for both
4. Frontend (Vercel) connects to FastAPI via HTTPS

## Security Considerations

1. **API Authentication**: All endpoints require API key or JWT
2. **File Permissions**: Ensure API has read/write access to AdBot files
3. **Process Isolation**: AdBot runs in separate process
4. **CORS**: Configured for frontend domain only
5. **Input Validation**: All API inputs are validated

## Troubleshooting

### AdBot won't start via API

- Check AdBot dependencies are installed
- Verify config.json is valid
- Check file permissions
- Review process manager logs

### Config changes not reflected

- AdBot reads config on startup
- Restart AdBot after config changes
- Check config.json backup files

### Process conflicts

- Only FastAPI should manage process lifecycle
- Telegram bot should not start/stop directly
- Use API endpoints for process control

