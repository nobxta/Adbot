# Supabase Database Setup Guide

This guide explains how to set up Supabase for the HQAdz application to store user information, payments, bots, and license keys.

## Overview

The application uses Supabase (PostgreSQL) to store:
- **Users**: Email, access codes, license keys, bot IDs, plan information
- **Payments**: Payment details, status, amounts, timestamps
- **Bots**: Bot status, statistics, uptime, activity
- **Access Codes**: Access code management with roles and expiration

## Prerequisites

1. A Supabase account (sign up at https://supabase.com)
2. A Supabase project created
3. Next.js environment variables configured

## Step 1: Create Supabase Project

1. Go to https://supabase.com and sign up/login
2. Click "New Project"
3. Fill in:
   - **Name**: HQAdz (or your preferred name)
   - **Database Password**: Choose a strong password (save it securely!)
   - **Region**: Choose closest to your users
4. Click "Create new project"
5. Wait for the project to be created (takes 1-2 minutes)

## Step 2: Get Your Supabase Credentials

1. In your Supabase project dashboard, go to **Settings** → **API**
2. You'll need:
   - **Project URL** (under "Project URL")
   - **anon/public key** (under "Project API keys" → "anon public")
   - **service_role key** (under "Project API keys" → "service_role" - keep this secret!)

## Step 3: Run Database Schema

1. In Supabase dashboard, go to **SQL Editor**
2. Click "New query"
3. Open the file `frontend/supabase/schema.sql` from this project
4. Copy the entire contents
5. Paste into the SQL Editor
6. Click "Run" (or press Ctrl+Enter)
7. You should see "Success. No rows returned"

This creates:
- All necessary tables (users, payments, bots, access_codes)
- Indexes for performance
- Triggers for automatic timestamp updates
- Row Level Security (RLS) policies
- Default admin and user accounts for testing

## Step 4: Configure Environment Variables

Create or update `.env.local` in the `frontend` directory:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# NowPayments API Configuration (if using payments)
NOWPAYMENTS_API_KEY=your_nowpayments_api_key_here
NOWPAYMENTS_API_URL=https://api.nowpayments.io/v1

# Application URLs
NEXT_PUBLIC_BASE_URL=http://localhost:3000
IPN_CALLBACK_URL=http://localhost:3000/api/payment/webhook
```

### Important Notes:

- **NEXT_PUBLIC_SUPABASE_URL**: Your project URL from Supabase dashboard
- **NEXT_PUBLIC_SUPABASE_ANON_KEY**: The "anon public" key (safe to expose in client-side code)
- **SUPABASE_SERVICE_ROLE_KEY**: The "service_role" key (NEVER expose this - server-side only!)
- All `NEXT_PUBLIC_*` variables are exposed to the browser
- `SUPABASE_SERVICE_ROLE_KEY` should NEVER be in client-side code

## Step 5: Verify Setup

1. Restart your Next.js development server:
   ```bash
   npm run dev
   ```

2. Test the access page:
   - Go to `http://localhost:3000/access`
   - Try the default admin code: `ADMIN123`
   - Try the default user code: `USER123`

3. Check Supabase dashboard:
   - Go to **Table Editor**
   - You should see tables: `users`, `payments`, `bots`, `access_codes`
   - The `users` table should have 2 default entries

## Database Schema Details

### Users Table
- `id`: UUID (primary key)
- `email`: Unique email address
- `role`: 'admin' or 'user'
- `access_code`: Unique access code for login
- `license_key`: Unique license key
- `bot_id`: Associated Telegram bot ID
- `plan_type`: 'starter' or 'enterprise'
- `plan_status`: 'active', 'inactive', or 'expired'
- `created_at`, `updated_at`, `last_login`: Timestamps

### Payments Table
- `id`: UUID (primary key)
- `payment_id`: NowPayments payment ID (unique)
- `user_id`: Foreign key to users table
- `email`: Customer email
- `plan_name`, `plan_type`: Plan details
- `amount`, `currency`: Payment amount
- `payment_status`: 'waiting', 'confirming', 'paid', 'finished', 'failed', 'expired'
- `payment_address`, `payment_amount`, `payment_currency`: Crypto payment details
- `created_at`, `updated_at`, `completed_at`: Timestamps

### Bots Table
- `id`: UUID (primary key)
- `user_id`: Foreign key to users table
- `bot_id`: Telegram bot ID (unique)
- `status`: 'active', 'inactive', or 'paused'
- `messages_sent`, `groups_reached`, `uptime_hours`: Statistics
- `last_activity`: Last activity timestamp
- `created_at`, `updated_at`: Timestamps

### Access Codes Table
- `id`: UUID (primary key)
- `code`: Access code (unique)
- `role`: 'admin' or 'user'
- `user_id`: Foreign key to users table (optional)
- `is_active`: Boolean
- `expires_at`: Optional expiration date

## Default Test Accounts

After running the schema, you'll have:

**Admin Account:**
- Email: `admin@hqadz.com`
- Access Code: `ADMIN123`
- License Key: `ADMIN-LICENSE-KEY-001`
- Status: Active

**User Account:**
- Email: `user@example.com`
- Access Code: `USER123`
- License Key: `USER-LICENSE-KEY-001`
- Status: Inactive

**⚠️ Important:** Change these default credentials in production!

## Managing Users

### Create a New User

You can create users through:
1. **Payment flow**: Users are automatically created when they make a payment
2. **Manual creation**: Use Supabase dashboard or create an API endpoint
3. **Admin panel**: (To be implemented)

### Update User Plan

When a payment is completed:
1. Webhook receives payment confirmation
2. User's `plan_status` is set to 'active'
3. Bot is created for the user
4. License key and access code are sent via email

## Row Level Security (RLS)

The database uses RLS policies to secure data:

- **Users**: Can only read/update their own data (except admins)
- **Payments**: Users can only see their own payments
- **Bots**: Users can only see/update their own bots
- **API Routes**: Use service role key to bypass RLS (server-side only)

## Production Checklist

- [ ] Change default admin/user credentials
- [ ] Set strong database password
- [ ] Enable database backups in Supabase
- [ ] Set up proper authentication (JWT tokens)
- [ ] Configure CORS settings
- [ ] Set up monitoring and alerts
- [ ] Review and adjust RLS policies
- [ ] Test payment webhook in production
- [ ] Set up database migrations for future updates

## Troubleshooting

### "Supabase admin client not configured"
- Check that `SUPABASE_SERVICE_ROLE_KEY` is set in `.env.local`
- Restart the development server after adding env variables

### "Invalid access code"
- Verify the schema was run successfully
- Check the `users` table in Supabase dashboard
- Ensure access codes are uppercase (they're normalized automatically)

### "Payment not found in database"
- Check that payment was created in `payments` table
- Verify webhook is receiving data from NowPayments
- Check webhook logs in Supabase dashboard

### Connection Issues
- Verify `NEXT_PUBLIC_SUPABASE_URL` is correct
- Check API keys are correct
- Ensure project is not paused in Supabase dashboard

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)

## Support

For issues or questions:
1. Check Supabase dashboard logs
2. Review Next.js server logs
3. Check browser console for client-side errors
4. Verify all environment variables are set correctly

