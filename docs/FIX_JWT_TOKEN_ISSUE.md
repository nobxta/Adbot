# Fix JWT Token Signature Mismatch Issue

## Why This Happens

Even if you set the same `JWT_SECRET` in both frontend and backend env files, you'll still get "Invalid token signature" if:

1. **Your token was created BEFORE you set JWT_SECRET** - The token in your browser's localStorage was signed with the old default secret
2. **The Next.js server wasn't restarted** - Environment variables are only loaded when the server starts
3. **The token is cached** - Your browser still has the old token

## Solution (Step by Step)

### Step 1: Make Sure JWT_SECRET is Set

**Frontend** (`frontend/.env.local`):
```
JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars
```

**Backend** (`backend/.env`):
```
JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars
```

**IMPORTANT**: They must be EXACTLY the same (copy-paste to be sure)

### Step 2: Restart Both Servers

1. **Stop the Next.js server** (Ctrl+C in the terminal running `npm run dev`)
2. **Stop the Python backend** (Ctrl+C in the terminal running `python main.py`)
3. **Start the Python backend first**: `cd backend && python main.py`
4. **Start the Next.js server**: `cd frontend && npm run dev`

### Step 3: Clear Old Token and Log In Again

**Option A: Clear localStorage manually**
1. Open browser console (F12)
2. Run: `localStorage.clear()`
3. Refresh the page
4. Log in again

**Option B: Use the logout button**
1. Click logout in your app
2. Log in again

**Option C: Clear browser data**
1. Open browser settings
2. Clear site data/cookies for localhost:3000
3. Refresh and log in again

### Step 4: Verify It Works

After logging in again, try uploading a session. The new token will be created with the correct JWT_SECRET.

## Why You Need to Log In Again

When you log in, the server creates a JWT token signed with the current `JWT_SECRET`. If you:
- Set JWT_SECRET after logging in → Your token was signed with the old secret
- Change JWT_SECRET → Your old token is now invalid
- Restart server without logging in again → You're still using the old token

**The token in localStorage doesn't automatically update** - you need to log in again to get a new one.

## Quick Test

To verify your JWT_SECRET is being read correctly:

1. Check server console when it starts - you should see the debug log (if in development mode)
2. Try logging in - if it works, the secret is correct
3. If login fails, check that JWT_SECRET is set in `.env.local` (not just `.env`)

## Still Not Working?

If you've done all the above and it still doesn't work:

1. **Check file names**: Make sure it's `.env.local` (not `.env`) in the frontend folder
2. **Check for typos**: Make sure there are no extra spaces or quotes around the JWT_SECRET value
3. **Check both files match**: Copy the exact same value to both frontend and backend
4. **Restart everything**: Close all terminals, restart both servers
5. **Clear everything**: Clear localStorage, cookies, and browser cache

