# Testing Guide for File-Based Group Management

## Prerequisites

1. **Backend Running**: Python backend must be running on port 8000
2. **Frontend Running**: Next.js frontend must be running on port 3000
3. **Admin Access**: You must be logged in as an ADMIN user
4. **Group Files**: Files will be auto-created at `backend/data/groups/`

## Step 1: Access Admin Groups Page

1. Navigate to: `http://localhost:3000/admin/groups`
2. You should see two tabs: **STARTER Plan** and **ENTERPRISE Plan**
3. Both tabs should show current group counts (initially 0 if files are empty)

## Step 2: Add Test Groups

### Option A: Via Admin UI (Recommended)

1. **Select Plan Tab**: Click on "STARTER Plan" or "ENTERPRISE Plan"
2. **Enter Group IDs**: In the textarea, enter numeric group IDs (one per line):
   ```
   -1001234567890
   -1009876543210
   1234567890
   ```
3. **Validate**: Click "Validate" button to check for errors
4. **Save**: Click "Save Groups" button
5. **Verify**: The "Current Groups" section should update with the new count

### Option B: Via Direct File Edit

1. Navigate to: `backend/data/groups/`
2. Edit `starter_groups.txt` or `enterprise_groups.txt`
3. Add one numeric group ID per line
4. Save the file
5. Refresh the admin page to see changes

## Step 3: Test Group Validation

### Valid Group IDs:
- `-1001234567890` (negative supergroup ID)
- `1234567890` (positive group ID)
- `-1009876543210` (another supergroup)

### Invalid Group IDs (should fail validation):
- `@groupname` (username - not supported)
- `abc123` (non-numeric)
- `-100abc` (non-numeric after -)
- Empty lines (ignored)
- Lines starting with `#` (treated as comments)

**Test Steps**:
1. Enter a mix of valid and invalid IDs
2. Click "Validate"
3. Check that invalid IDs are listed with error messages
4. Only valid IDs should be saved

## Step 4: Test File Operations

### Export Groups:
1. Click "Export" button
2. A `.txt` file should download
3. Verify the file contains all group IDs (one per line)

### Load for Edit:
1. Click "Load for Edit" button
2. Current groups should populate the textarea
3. Make changes and save

### Replace vs Add vs Remove:
1. **Replace**: Replaces all groups with new list
2. **Add**: Adds new groups to existing (no duplicates)
3. **Remove**: Removes specified groups from existing

**Test Steps**:
1. Start with 3 groups: `-100111`, `-100222`, `-100333`
2. **Add** `-100444` → Should have 4 groups
3. **Remove** `-100222` → Should have 3 groups (111, 333, 444)
4. **Replace** with `-100555`, `-100666` → Should have 2 groups (555, 666)

## Step 5: Test Backend Integration

### Check API Endpoints:

1. **List Groups**:
   ```bash
   curl -X GET "http://localhost:8000/api/admin/groups/list?plan_type=STARTER" \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
   ```

2. **Update Groups**:
   ```bash
   curl -X POST "http://localhost:8000/api/admin/groups/update" \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "plan_type": "STARTER",
       "groups": ["-1001234567890", "-1009876543210"],
       "action": "replace"
     }'
   ```

3. **Validate Groups**:
   ```bash
   curl -X POST "http://localhost:8000/api/admin/groups/validate" \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "groups": ["-1001234567890", "invalid", "-1009876543210"]
     }'
   ```

## Step 6: Test Bot Execution

### Prerequisites:
- User with STARTER or ENTERPRISE plan
- Bot is running
- At least one session assigned
- Post link configured

### STARTER Plan Testing:

1. **Add groups to `starter_groups.txt`** (via admin UI or file edit)
2. **Start the bot** for a user with STARTER plan
3. **Observe behavior**:
   - All sessions should post to ALL groups
   - Sessions should start at different random times (within 60-minute window)
   - After completing all groups, wait 60-120 minutes before next cycle
   - Per-message delay: 30-60 seconds

4. **Check logs**:
   - Look for "Starter mode RANDOM offsets" messages
   - Verify sessions are posting to all groups
   - Verify timing is randomized (not synchronized)

### ENTERPRISE Plan Testing:

1. **Add groups to `enterprise_groups.txt`** (via admin UI or file edit)
2. **Start the bot** for a user with ENTERPRISE plan
3. **Observe behavior**:
   - Groups should be divided across sessions
   - Each session posts only to its assigned groups
   - After completing assigned groups, wait 20-45 minutes before next cycle
   - Per-message delay: 15-30 seconds

4. **Check logs**:
   - Look for group distribution messages
   - Verify each session has unique groups
   - Verify full coverage (all groups posted across all sessions)

## Step 7: Test File Reload

### Test File Change Detection:

1. **Start a bot** with groups already loaded
2. **While bot is running**, add/remove groups via admin UI
3. **Observe**:
   - File modification is detected at cycle start
   - Log message: "Group file changed, will reload at cycle completion"
   - Changes apply AFTER current cycle finishes
   - Next cycle uses new groups

### Test Mid-Cycle Safety:

1. **Start a bot** posting to groups
2. **While posting is in progress**, modify the group file
3. **Verify**:
   - Current cycle continues with old groups
   - No interruption to posting
   - New groups apply at next cycle

## Step 8: Test Error Handling

### Invalid File Content:

1. **Manually edit** `starter_groups.txt` to include invalid IDs:
   ```
   -1001234567890
   invalid_group
   -1009876543210
   ```
2. **Restart backend** or trigger file reload
3. **Check logs** for error messages
4. **Verify** system handles gracefully (skips invalid lines or logs error)

### Empty File:

1. **Clear all groups** from a file
2. **Start bot**
3. **Verify**:
   - System handles empty file gracefully
   - Falls back to user_data groups if available (legacy mode)
   - Logs warning about empty file

### Missing File:

1. **Delete** `starter_groups.txt` or `enterprise_groups.txt`
2. **Start bot**
3. **Verify**:
   - File is auto-created (empty)
   - System handles gracefully
   - Falls back to user_data groups if available

## Step 9: Test Plan-Specific Behavior

### STARTER Plan Characteristics:
- ✅ All sessions post to ALL groups
- ✅ Random start offsets (0-60 minutes)
- ✅ Randomized cycle gaps (60-120 minutes)
- ✅ Per-message delay: 30-60 seconds
- ✅ No group division

### ENTERPRISE Plan Characteristics:
- ✅ Groups divided across sessions
- ✅ No start offsets (immediate start)
- ✅ Shorter cycle gaps (20-45 minutes)
- ✅ Per-message delay: 15-30 seconds
- ✅ Full coverage per cycle

**Verification**:
- Check logs for plan-specific messages
- Verify timing matches plan constraints
- Verify group assignment matches plan type

## Step 10: Performance Testing

### Large Group Lists:

1. **Add 100+ groups** to a file
2. **Start bot** with multiple sessions
3. **Observe**:
   - File loads quickly
   - Groups are distributed correctly (ENTERPRISE)
   - No performance degradation
   - Memory usage is reasonable

### Concurrent File Updates:

1. **Multiple admins** editing groups simultaneously
2. **Verify**:
   - Last write wins (file-based, no locking)
   - Changes are detected correctly
   - No corruption

## Common Issues & Solutions

### Issue: "Groups not loading"
**Solution**: 
- Check file exists at `backend/data/groups/`
- Check file permissions
- Check backend logs for errors
- Verify admin token is valid

### Issue: "Changes not applying"
**Solution**:
- Changes apply at cycle completion, not immediately
- Wait for current cycle to finish
- Check file modification time
- Verify cache is cleared

### Issue: "Invalid group ID errors"
**Solution**:
- Ensure only numeric IDs (no usernames)
- Check for leading/trailing spaces
- Use validation endpoint before saving

### Issue: "Bot not using file groups"
**Solution**:
- Verify plan type matches file (STARTER vs ENTERPRISE)
- Check execution_mode in user_data
- Check backend logs for file loading messages
- Verify file is not empty

## Success Criteria

✅ **Admin UI**:
- Can view groups for both plans
- Can add/remove/replace groups
- Validation works correctly
- Export/import works

✅ **Backend API**:
- All endpoints return correct data
- File operations work correctly
- Validation catches invalid IDs
- Cache updates correctly

✅ **Bot Execution**:
- STARTER: Random timing, all groups, all sessions
- ENTERPRISE: Group division, full coverage
- File reload works at cycle completion
- No errors in logs

✅ **Error Handling**:
- Invalid IDs are rejected
- Empty files handled gracefully
- Missing files auto-created
- No crashes on invalid input

## Next Steps

After successful testing:
1. Add real Telegram group IDs
2. Monitor bot execution logs
3. Verify timing matches plan constraints
4. Check for any performance issues
5. Document any custom configurations

