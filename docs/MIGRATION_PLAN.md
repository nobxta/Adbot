# MIGRATION PLAN: Lock Backend Ownership, Remove Frontend JSON Writes

## Executive Summary

**Decision**: Python backend (`backend/main.py` + `backend/bot/*`) exclusively owns `backend/data/users.json`. Frontend must use HTTP API calls, not direct file access.

---

## 1. Files to Modify/Remove

### ❌ TO DELETE

**File**: `backend/lib/storage.ts`
- **Reason**: TypeScript wrapper that writes to users.json directly
- **Action**: DELETE entirely
- **Impact**: Frontend can no longer read/write JSON files

---

### 🔁 TO REPLACE (3 files)

#### File 1: `frontend/app/api/bot/control/route.ts`
- **Current**: Reads/writes `backend/lib/storage.ts` → `users.json`
- **Action**: Replace with HTTP call to Python backend `POST /api/bot/start` or `POST /api/bot/stop`
- **Lines to change**: 3, 39-45

#### File 2: `frontend/app/api/user/advertisement/route.ts`
- **Current**: Reads/writes `backend/lib/storage.ts` → `users.json`
- **Action**: Replace with HTTP call to Python backend `POST /api/bot/update-post`
- **Lines to change**: 3, 28, 95

#### File 3: `frontend/app/api/bot/config/route.ts`
- **Current**: Reads/writes `backend/lib/storage.ts` → `users.json`
- **Action**: Replace with HTTP call to Python backend `GET /api/bot/state`
- **Lines to change**: 3, 19, 83

---

## 2. Python API Contract (MINIMAL)

### Required Endpoints (to be added to `backend/api/bot_control.py`)

#### `POST /api/bot/register-user`
- **Purpose**: Register user in Python backend (called after payment success)
- **Auth**: JWT or API key
- **Body**:
  ```json
  {
    "user_id": "uuid",
    "email": "user@example.com"  // Optional, for logging only
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "message": "User registered",
    "user_id": "uuid"
  }
  ```
- **Implementation**: Calls `update_user_data(user_id, {})` to create user entry with defaults

#### `POST /api/bot/start`
- **Purpose**: Start bot for user
- **Auth**: JWT (user_id from token)
- **Body**: None (user_id from JWT)
- **Response**:
  ```json
  {
    "success": true,
    "status": "running",
    "sessions": 1,
    "message": "Bot started"
  }
  ```
- **Implementation**: Already exists in `backend/api/bot_control.py` (line 48-105)

#### `POST /api/bot/stop`
- **Purpose**: Stop bot for user
- **Auth**: JWT (user_id from token)
- **Body**: None (user_id from JWT)
- **Response**:
  ```json
  {
    "success": true,
    "status": "stopped",
    "message": "Bot stopped"
  }
  ```
- **Implementation**: Already exists in `backend/api/bot_control.py` (line 108-139)

#### `POST /api/bot/update-post`
- **Purpose**: Update post content (link or text)
- **Auth**: JWT (user_id from token)
- **Body**:
  ```json
  {
    "post_type": "link" | "text",
    "post_content": "t.me/channel/123" | "Custom text here"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "message": "Post content updated",
    "post_type": "link",
    "post_content": "t.me/channel/123"
  }
  ```
- **Implementation**: NEW endpoint - Update `post_type` and `post_content` fields

#### `POST /api/bot/update-groups`
- **Purpose**: Update groups list (optional, for future use)
- **Auth**: JWT (user_id from token)
- **Body**:
  ```json
  {
    "groups": ["-1001234567890", "-1009876543210"]
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "message": "Groups updated",
    "groups_count": 2
  }
  ```
- **Implementation**: NEW endpoint - Update `groups` array

#### `GET /api/bot/state`
- **Purpose**: Get user's bot state (status, post content, groups, stats)
- **Auth**: JWT (user_id from token)
- **Body**: None (user_id from JWT)
- **Response**:
  ```json
  {
    "success": true,
    "status": "running" | "stopped",
    "post_type": "link" | "text",
    "post_content": "t.me/channel/123",
    "groups": ["-1001234567890"],
    "sessions": 1,
    "stats": {
      "total_messages_sent": 1234,
      "total_success": 1200,
      "total_failures": 34
    }
  }
  ```
- **Implementation**: Already exists partially in `backend/api/bot_control.py` (line 142-165), extend to include post_content

---

## 3. Data Flow Comparison

### BEFORE (Current - BROKEN)

```
Payment Webhook
  → Supabase (user created)
  → ❌ users.json NOT updated

User clicks "Start Bot"
  → Next.js /api/bot/control
  → TypeScript: backend/lib/storage.ts
  → Writes users.json with WRONG schema:
    {
      "botStatus": "active",  // ❌ Wrong field name
      "postLink": "...",      // ❌ Wrong field name
      "customText": "..."     // ❌ Wrong field name
    }
  
Python Backend
  → Reads users.json
  → Expects: bot_status, post_content, post_type
  → ❌ Schema mismatch → Bot cannot run
```

### AFTER (Target - FIXED)

```
Payment Webhook
  → Supabase (user created)
  → ✅ Calls Python: POST /api/bot/register-user
  → Python: Creates user entry in users.json with correct schema

User clicks "Start Bot"
  → Next.js /api/bot/control
  → ✅ HTTP: POST http://backend:8000/api/bot/start
  → Headers: Authorization: Bearer <JWT>
  → Python: Updates users.json with bot_status: "running"
  → Python: Assigns sessions if needed
  → ✅ Scheduler picks up user and runs bot

User edits advertisement
  → Next.js /api/user/advertisement
  → ✅ HTTP: POST http://backend:8000/api/bot/update-post
  → Body: { "post_type": "link", "post_content": "t.me/..." }
  → Python: Updates users.json with post_content field
  → ✅ Worker reads correct field and forwards messages
```

---

## 4. Python Backend Schema (users.json)

**Python owns and writes ONLY**:

```json
{
  "users": {
    "user_id": {
      "assigned_sessions": ["session1.session"],
      "api_pairs": [0, 1],
      "groups": ["-1001234567890"],
      "post_type": "link",
      "post_content": "t.me/channel/123",
      "bot_status": "running" | "stopped",
      "delay_between_posts": 5,
      "delay_between_cycles": 300,
      "banned_sessions": []
    }
  }
}
```

**NOT stored in users.json** (stays in Supabase):
- Payment data
- Email addresses
- Plan details
- License keys
- Access codes
- User registration info

---

## 5. Frontend Changes Required

### Environment Variable
Add to `frontend/.env.local`:
```env
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8000
# Or in production: NEXT_PUBLIC_BACKEND_API_URL=https://api.yourdomain.com
```

### HTTP Client Helper
Create `frontend/lib/backend-api.ts`:
```typescript
const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';

async function fetchBackend(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('accessToken');
  // Note: Currently frontend uses base64 token, Python expects JWT
  // This needs to be fixed (frontend should use proper JWT from Supabase)
  
  const response = await fetch(`${BACKEND_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,  // Will need proper JWT
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Backend request failed');
  }
  
  return response.json();
}

export const backendApi = {
  registerUser: (userId: string, email?: string) =>
    fetchBackend('/api/bot/register-user', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, email }),
    }),
  
  startBot: () =>
    fetchBackend('/api/bot/start', { method: 'POST' }),
  
  stopBot: () =>
    fetchBackend('/api/bot/stop', { method: 'POST' }),
  
  updatePost: (postType: 'link' | 'text', postContent: string) =>
    fetchBackend('/api/bot/update-post', {
      method: 'POST',
      body: JSON.stringify({ post_type: postType, post_content: postContent }),
    }),
  
  updateGroups: (groups: string[]) =>
    fetchBackend('/api/bot/update-groups', {
      method: 'POST',
      body: JSON.stringify({ groups }),
    }),
  
  getState: () =>
    fetchBackend('/api/bot/state'),
};
```

---

## 6. Implementation Checklist

### Phase 1: Python Backend Endpoints
- [ ] Add `POST /api/bot/register-user` to `backend/api/bot_control.py`
- [ ] Add `POST /api/bot/update-post` to `backend/api/bot_control.py`
- [ ] Add `POST /api/bot/update-groups` to `backend/api/bot_control.py` (optional)
- [ ] Extend `GET /api/bot/status` to include `post_content`, `groups` → Rename to `GET /api/bot/state`
- [ ] Test all endpoints with JWT authentication

### Phase 2: Frontend Migration
- [ ] Create `frontend/lib/backend-api.ts` helper
- [ ] Update `frontend/app/api/bot/control/route.ts` → Call Python backend
- [ ] Update `frontend/app/api/user/advertisement/route.ts` → Call Python backend
- [ ] Update `frontend/app/api/bot/config/route.ts` → Call Python backend
- [ ] Delete `backend/lib/storage.ts`

### Phase 3: Payment Webhook Integration
- [ ] Update `frontend/app/api/payment/webhook/route.ts`
- [ ] After activating plan in Supabase, call `POST /api/bot/register-user`
- [ ] Test payment → user registration flow

### Phase 4: Testing
- [ ] Test: Payment → User registered in Python backend
- [ ] Test: Start bot → Sessions assigned → Bot runs
- [ ] Test: Update post → Worker uses new post content
- [ ] Test: Stop bot → Bot stops gracefully
- [ ] Test: Concurrent requests → No race conditions
- [ ] Test: Backend restart → Users must restart (expected behavior)

---

## 7. Critical Notes

### Authentication Gap
**Problem**: Frontend currently uses base64 token, Python expects JWT.

**Current Frontend Token** (`frontend/app/api/auth/verify-access-code/route.ts`):
```typescript
const token = Buffer.from(`${user.id}:${user.role}:${Date.now()}`).toString('base64');
```

**Python Backend Expects** (`backend/api/bot_control.py`):
```python
payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
```

**Solution Options**:
1. Frontend generates proper JWT using `jsonwebtoken` library
2. Python backend accepts base64 tokens temporarily (NOT RECOMMENDED)
3. Frontend calls Next.js API routes, which generate JWT and proxy to Python (RECOMMENDED)

**Recommendation**: Keep Next.js API routes as proxy layer. Frontend → Next.js API → Python Backend. Next.js generates JWT from Supabase user.

### CORS Configuration
Ensure `backend/main.py` has CORS configured for frontend origin:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://your-frontend.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 8. Confirmation: Bots Can Start After This Change

### ✅ YES - Bots can start because:

1. **Schema Match**: Python backend writes and reads the same schema
   - `bot_status: "running"` (not `botStatus`)
   - `post_content: "t.me/..."` (not `postLink`)
   - `post_type: "link"` (not `advertisementType`)

2. **Session Assignment**: Python backend handles session assignment in `/api/bot/start`
   - Assigns sessions from unused pool
   - Assigns API pairs
   - Updates users.json atomically

3. **Scheduler Integration**: Scheduler reads `bot_status == "running"` and executes cycles
   - Worker reads `post_content` field
   - Worker reads `groups` array
   - Worker reads `assigned_sessions`
   - All fields match expected schema

4. **No Race Conditions**: Python uses file locking (`_users_lock`)
   - TypeScript writes removed → No concurrent writes
   - Python is sole owner of users.json

---

## 9. Files Summary

### Files to DELETE
- `backend/lib/storage.ts` ❌

### Files to MODIFY
- `frontend/app/api/bot/control/route.ts` 🔁
- `frontend/app/api/user/advertisement/route.ts` 🔁
- `frontend/app/api/bot/config/route.ts` 🔁
- `frontend/app/api/payment/webhook/route.ts` 🔁 (add register-user call)

### Files to CREATE
- `frontend/lib/backend-api.ts` ✨

### Files to EXTEND
- `backend/api/bot_control.py` ✨ (add register-user, update-post, update-groups, extend status to state)

---

## 10. Next Steps

1. Review this plan
2. Implement Python endpoints (Phase 1)
3. Migrate frontend (Phase 2)
4. Integrate payment webhook (Phase 3)
5. Test thoroughly (Phase 4)
6. Delete `backend/lib/storage.ts`
7. Verify bots can start and run correctly

---

**END OF MIGRATION PLAN**

