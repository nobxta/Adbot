# Token Expiration Updated to 30 Days

## Changes Made

All JWT tokens now expire after **30 days** instead of the previous short expiration times.

### Updated Token Expirations:

1. **Access Token** (`frontend/lib/auth.ts`)
   - **Before**: 15 minutes (production) / 24 hours (development)
   - **After**: 30 days
   - Used for: Frontend API authentication

2. **Refresh Token** (`frontend/lib/auth.ts`)
   - **Before**: 7 days
   - **After**: 60 days (longer than access token for safety)
   - Used for: Refreshing expired access tokens

3. **Backend JWT Token** (`frontend/lib/backend-jwt.ts`)
   - **Before**: 24 hours
   - **After**: 30 days
   - Used for: Python backend API authentication

## What This Means

- Users will stay logged in for **30 days** without needing to re-authenticate
- After 30 days, users will need to log in again
- Refresh tokens last 60 days, providing a buffer for token renewal

## Important Notes

1. **Existing tokens are not affected** - Only new tokens created after this change will have the 30-day expiration
2. **Users need to log in again** - Current users with expired tokens need to log out and log back in to get a new 30-day token
3. **Security consideration** - 30 days is a long expiration time. Ensure proper security measures are in place:
   - Use HTTPS in production
   - Implement proper logout functionality
   - Consider adding token revocation for security incidents

## Testing

After deploying this change:
1. Log out and log back in
2. Check that the token works for at least 30 days
3. Verify that expired tokens properly require re-authentication

