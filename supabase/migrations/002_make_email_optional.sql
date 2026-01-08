-- Migration: Make email optional in users table
-- This allows admin to create users with only access_code + password (no email required)

-- Drop the NOT NULL constraint on email and make it nullable
ALTER TABLE users 
  ALTER COLUMN email DROP NOT NULL;

-- Remove the UNIQUE constraint on email (since it can now be NULL and multiple NULLs would conflict)
-- Instead, we'll enforce uniqueness only when email is NOT NULL
ALTER TABLE users 
  DROP CONSTRAINT IF EXISTS users_email_key;

-- Create a unique partial index that only applies when email IS NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique 
  ON users(email) 
  WHERE email IS NOT NULL;

-- Add comment to document the change
COMMENT ON COLUMN users.email IS 'User email address (optional - users can be created with access_code + password only)';

