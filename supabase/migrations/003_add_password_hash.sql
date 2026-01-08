-- Migration: Add password_hash field to users table
-- This enables password authentication alongside access_code

-- Add password_hash column (nullable for backward compatibility)
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Add comment
COMMENT ON COLUMN users.password_hash IS 'Bcrypt hashed password for user authentication (optional - users can use access_code only)';

-- Note: Existing users will have NULL password_hash (access_code only auth)
-- New users created via admin panel will have password_hash set

