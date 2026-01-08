# Check JWT_SECRET Configuration

## Problem
The Python backend logs show it's using the default JWT_SECRET:
```
JWT_SECRET being used: your-super... (first 10 chars)
```

This means the backend is NOT reading your `.env` file.

## Solution

### Step 1: Create/Check `.env` file in `backend/` folder

Make sure you have a file called `.env` (not `.env.template`) in the `backend/` folder:

**File location**: `backend/.env`

**Content should be**:
```
JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars
```

**IMPORTANT**: 
- The file must be named exactly `.env` (with the dot at the start)
- It must be in the `backend/` folder (same folder as `main.py`)
- The value must match EXACTLY what's in `frontend/.env.local`

### Step 2: Verify the file exists

Run this command in the `backend/` folder:
```bash
cd backend
ls -la .env
# On Windows PowerShell:
Get-ChildItem .env
```

If the file doesn't exist, create it:
```bash
# Copy from template
cp env.template .env

# Then edit .env and set JWT_SECRET to match frontend
```

### Step 3: Restart Python Backend

**CRITICAL**: Environment variables are only loaded when the server starts!

1. Stop the Python backend (Ctrl+C)
2. Start it again: `python main.py`
3. Check the console output - you should see:
   ```
   ✓ JWT_SECRET loaded from environment (first 10 chars): your-actual...
   ```

If you see the warning message, the `.env` file is not being read.

### Step 4: Verify Both Secrets Match

**Frontend** (`frontend/.env.local`):
```
JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars
```

**Backend** (`backend/.env`):
```
JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars
```

They must be EXACTLY the same (copy-paste to be sure).

### Step 5: Log Out and Log In Again

After setting the correct JWT_SECRET and restarting:
1. Clear your browser's localStorage: `localStorage.clear()` in console
2. Or click logout in the app
3. Log in again to get a new token with the correct secret

## Troubleshooting

### If `.env` file is not being read:

1. **Check file location**: Must be in `backend/` folder, same level as `main.py`
2. **Check file name**: Must be exactly `.env` (not `env`, not `.env.txt`)
3. **Check file format**: No spaces around the `=` sign:
   ```
   JWT_SECRET=value-here
   ```
   NOT:
   ```
   JWT_SECRET = value-here  ❌
   ```
4. **Restart server**: Environment variables are only loaded on startup

### If still not working:

Try setting it as an environment variable directly:
```bash
# Windows PowerShell
$env:JWT_SECRET="your-secret-here"
python main.py

# Linux/Mac
export JWT_SECRET="your-secret-here"
python main.py
```

