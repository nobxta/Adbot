# Quick Start: Group Management Testing

## 🚀 Quick Setup (5 minutes)

### 1. Start Backend
```bash
cd backend
python main.py
# Or: uvicorn main:app --reload
```

### 2. Start Frontend
```bash
cd frontend
npm run dev
```

### 3. Login as Admin
- Go to: `http://localhost:3000/access`
- Login with admin credentials
- You should see admin dashboard

## 📝 Add Groups (2 ways)

### Method 1: Admin UI (Easiest) ✅

1. **Navigate**: `http://localhost:3000/admin/groups`
2. **Select Plan**: Click "STARTER Plan" or "ENTERPRISE Plan" tab
3. **Enter Groups**: Paste group IDs (one per line):
   ```
   -1001234567890
   -1009876543210
   1234567890
   ```
4. **Validate**: Click "Validate" to check for errors
5. **Save**: Click "Save Groups"
6. **Done!** Groups are saved to file

### Method 2: Direct File Edit

1. **Open File**: `backend/data/groups/starter_groups.txt` or `enterprise_groups.txt`
2. **Add IDs**: One numeric ID per line
3. **Save**: File is auto-detected on next cycle

## ✅ Test Checklist

- [ ] Admin page loads: `/admin/groups`
- [ ] Can see both STARTER and ENTERPRISE tabs
- [ ] Can add groups via UI
- [ ] Validation catches invalid IDs
- [ ] Can export groups to file
- [ ] Can load groups for editing
- [ ] Replace/Add/Remove actions work
- [ ] File is created at: `backend/data/groups/`

## 🧪 Test Bot Execution

### For STARTER Plan:
1. Add groups to `starter_groups.txt` (via UI or file)
2. Start bot for user with STARTER plan
3. **Expected**: All sessions post to all groups with random timing

### For ENTERPRISE Plan:
1. Add groups to `enterprise_groups.txt` (via UI or file)
2. Start bot for user with ENTERPRISE plan
3. **Expected**: Groups divided across sessions, full coverage

## 🔍 Verify It's Working

### Check Backend Logs:
```
✓ Groups loaded from file: starter_groups.txt
✓ User {user_id}: Starter mode RANDOM offsets (this cycle) - offsets: [7.23min, 41.56min]
```

### Check File Location:
```
backend/data/groups/
├── starter_groups.txt
└── enterprise_groups.txt
```

### Check Admin UI:
- Groups count updates after save
- File path shows correct location
- File size shows correct bytes

## ⚠️ Common Issues

**"Groups not showing"**
→ Check file exists at `backend/data/groups/`
→ Refresh admin page
→ Check backend logs for errors

**"Invalid group ID"**
→ Only numeric IDs allowed (e.g., `-1001234567890`)
→ No usernames (e.g., `@groupname`)
→ Use validation button before saving

**"Changes not applying"**
→ Changes apply at cycle completion, not immediately
→ Wait for current cycle to finish
→ Check file modification time

## 📚 Full Documentation

See `backend/TESTING_GUIDE.md` for comprehensive testing instructions.

## 🎯 What to Test

1. ✅ Add groups via admin UI
2. ✅ Validate group IDs
3. ✅ Export/import groups
4. ✅ Test Replace/Add/Remove actions
5. ✅ Start bot and verify groups are used
6. ✅ Check logs for plan-specific behavior
7. ✅ Test file reload at cycle completion

---

**Ready to test?** Start with adding 2-3 test group IDs via the admin UI!

