# Quick Fix: Stop Auto-Logout and Fix JWT

## What I Fixed

1. ✅ **Removed auto-logout** - No more automatic redirects on 401 errors
2. ✅ **Improved .env loading** - Backend now properly loads JWT_SECRET
3. ✅ **Better error handling** - Shows errors instead of logging out

## Steps to Fix (Do These Now)

### Step 1: Install python-dotenv

```bash
cd backend
pip install -r requirements.txt
```

This installs `python-dotenv` which loads `.env` files.

### Step 2: Create backend/.env file

Create a file named `.env` (with the dot!) in the `backend/` folder:

**File path**: `backend/.env`

**Content**:
```
JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars
```

**IMPORTANT**: 
- Use the SAME value as in `frontend/.env.local`
- No spaces around the `=` sign
- No quotes around the value

### Step 3: Restart Python Backend

**CRITICAL**: Environment variables are only loaded when the server starts!

1. Stop the backend (Ctrl+C)
2. Start it again: `python main.py`
3. Look for these messages:
   ```
   ✓ Loaded environment variables from backend\.env
   ✓ JWT_SECRET loaded successfully (first 10 chars): your-actual...
   ```

If you see warnings, the `.env` file isn't being read correctly.

### Step 4: Clear Old Token and Log In Again

Your old token was created with a different JWT_SECRET. You need a new one:

1. **Option A**: Open browser console (F12) and run:
   ```javascript
   localStorage.clear()
   ```

2. **Option B**: Click logout button in the app

3. **Then**: Log in again at `/access` page

This creates a new token with the correct JWT_SECRET.

### Step 5: Test Upload

After logging in again, try uploading a session. It should work now!

## Verification

After restarting the backend, you should see:
```
✓ Loaded environment variables from backend\.env
✓ JWT_SECRET loaded successfully (first 10 chars): your-actual...
✓ CORS configured to allow origins: ['http://localhost:3000']
```

If you see warnings instead, check:
- Is the file named exactly `.env` (with dot)?
- Is it in the `backend/` folder?
- Does it have `JWT_SECRET=value` (no spaces)?

## What Changed

- **No more auto-logout**: Errors will show in the UI instead of redirecting
- **Better .env loading**: Backend now properly loads and verifies JWT_SECRET
- **Clearer errors**: You'll see what went wrong instead of being logged out

