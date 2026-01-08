# JWT_SECRET Configuration Issue

## Problem
The Python backend is returning 401 Unauthorized because the `JWT_SECRET` used to validate tokens doesn't match the `JWT_SECRET` used by the frontend to create tokens.

## Solution

**Both frontend and backend MUST use the SAME JWT_SECRET value.**

### Step 1: Check Current JWT_SECRET

1. **Frontend** - Check `.env.local` or `.env` in the `frontend/` folder:
   ```
   JWT_SECRET=your-super-secret-jwt-key-change-in-production
   ```

2. **Backend** - Check `.env` in the `backend/` folder:
   ```
   JWT_SECRET=your-super-secret-jwt-key-change-in-production
   ```

### Step 2: Make Them Match

**Option A: Use the same value in both files**

1. Copy the `JWT_SECRET` from your frontend `.env.local` file
2. Paste it into your backend `.env` file
3. Restart both frontend and backend servers

**Option B: Generate a new shared secret**

1. Generate a new secret:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. Add this to BOTH:
   - `frontend/.env.local`: `JWT_SECRET=<generated-secret>`
   - `backend/.env`: `JWT_SECRET=<generated-secret>`

3. Restart both servers

### Step 3: Verify

After updating, you'll need to:
1. Log out from the frontend
2. Log back in (this creates a new token with the correct secret)
3. Try uploading a session again

## Quick Fix

If you want to test quickly, you can temporarily set the same default in both:

**Frontend** (`frontend/.env.local`):
```
JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars
```

**Backend** (`backend/.env`):
```
JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars
```

Then restart both servers and log in again.

