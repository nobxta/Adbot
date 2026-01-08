# Backend Restart Required

## Issue
The admin groups API endpoints are returning 404 errors because the backend server needs to be restarted to load the new routes.

## Solution

### Option 1: Restart the Backend Server

1. **Stop the current server** (Ctrl+C in the terminal where it's running)

2. **Start it again**:
   ```bash
   cd backend
   python main.py
   ```

   Or if using uvicorn directly:
   ```bash
   cd backend
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

### Option 2: If Using a Process Manager

- Restart the service using your process manager (systemd, PM2, etc.)

## Verification

After restarting, you should see in the startup logs:
```
✓ Loaded environment variables from ...
✓ JWT_SECRET loaded successfully ...
✓ CORS configured to allow origins: ...
```

And the routes should be available:
- `GET /api/admin/groups/list?plan_type=STARTER` ✅
- `GET /api/admin/groups/list?plan_type=ENTERPRISE` ✅
- `POST /api/admin/groups/update` ✅
- `POST /api/admin/groups/validate` ✅

## Note

The router is already registered in `main.py`:
```python
from api.admin_groups import router as admin_groups_router
app.include_router(admin_groups_router, prefix="/api/admin/groups", tags=["Admin - Groups"])
```

The 404 errors are happening because the server was started before this router was added, so it needs a restart to load the new routes.

