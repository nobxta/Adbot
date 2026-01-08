# Environment Variables Setup

## Quick Start

1. **Copy the example file:**
   ```bash
   cp .env.example .env.local
   ```

2. **Edit `.env.local` with your actual values:**
   ```env
   NOWPAYMENTS_API_KEY=your_actual_api_key_here
   NEXT_PUBLIC_BASE_URL=http://localhost:3000
   IPN_CALLBACK_URL=http://localhost:3000/api/payment/webhook
   ```

## Required Environment Variables

### `NEXT_PUBLIC_SUPABASE_URL` (Required)
- **Description:** Your Supabase project URL
- **Where to get it:** Supabase Dashboard → Settings → API → Project URL
- **Example:** `https://abcdefghijklmnop.supabase.co`
- **Note:** This is safe to expose in client-side code

### `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Required)
- **Description:** Your Supabase anonymous/public API key
- **Where to get it:** Supabase Dashboard → Settings → API → Project API keys → anon public
- **Example:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Note:** This is safe to expose in client-side code

### `SUPABASE_SERVICE_ROLE_KEY` (Required)
- **Description:** Your Supabase service role key (server-side only)
- **Where to get it:** Supabase Dashboard → Settings → API → Project API keys → service_role
- **Example:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **⚠️ CRITICAL:** Never expose this in client-side code! Server-side only!
- **Note:** This key bypasses Row Level Security - keep it secret

### `NOWPAYMENTS_API_KEY` (Required for payments)
- **Description:** Your NowPayments API key
- **Where to get it:** 
  1. Sign up at https://nowpayments.io
  2. Go to Dashboard → API Settings
  3. Copy your API key
- **Example:** `a1b2c3d4-e5f6-7890-abcd-ef1234567890`

### `NOWPAYMENTS_API_URL` (Optional - has default)
- **Description:** NowPayments API endpoint URL
- **Default:** `https://api.nowpayments.io/v1`
- **Usually:** Don't change this unless using a different environment

### `NEXT_PUBLIC_BASE_URL` (Required)
- **Description:** Your application's base URL
- **Local Development:** `http://localhost:3000`
- **Production:** `https://yourdomain.com`
- **Note:** Must be publicly accessible for webhooks

### `IPN_CALLBACK_URL` (Required)
- **Description:** URL where NowPayments sends payment status updates
- **Format:** `${NEXT_PUBLIC_BASE_URL}/api/payment/webhook`
- **Local Development:** `http://localhost:3000/api/payment/webhook`
- **Production:** `https://yourdomain.com/api/payment/webhook`
- **Note:** Must be publicly accessible

### `ADMIN_ACCESS_CODES` (Optional)
- **Description:** Comma-separated list of admin access codes
- **Format:** `CODE1,CODE2,CODE3`
- **Example:** `ADMIN123,ADMIN456,SUPERADMIN`
- **Note:** In production, use a database to store access codes with user roles

### `USER_ACCESS_CODES` (Optional)
- **Description:** Comma-separated list of user access codes
- **Format:** `CODE1,CODE2,CODE3`
- **Example:** `USER123,USER456,USER789`
- **Note:** In production, use a database to store access codes with user roles

## Local Development Setup

Create `.env.local` file in the `frontend` directory:

```env
# Supabase Configuration (Required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# NowPayments API Configuration (Required for payments)
NOWPAYMENTS_API_KEY=your_sandbox_api_key_here

# API URL (usually don't change)
NOWPAYMENTS_API_URL=https://api.nowpayments.io/v1

# Local development URLs
NEXT_PUBLIC_BASE_URL=http://localhost:3000
IPN_CALLBACK_URL=http://localhost:3000/api/payment/webhook
```

**Important for Local Development:**
- For webhooks to work locally, you'll need to use a service like:
  - **ngrok:** `ngrok http 3000`
  - Then use the ngrok URL in `IPN_CALLBACK_URL`
- Or test webhooks manually in production

## Production Setup

For production, update `.env.local` or set environment variables in your hosting platform:

```env
# Supabase Configuration (Required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# NowPayments API Configuration
NOWPAYMENTS_API_KEY=your_production_api_key_here

# API URL
NOWPAYMENTS_API_URL=https://api.nowpayments.io/v1

# Production URLs
NEXT_PUBLIC_BASE_URL=https://yourdomain.com
IPN_CALLBACK_URL=https://yourdomain.com/api/payment/webhook
```

**Production Checklist:**
- ✅ Use production API key (not sandbox)
- ✅ Update `NEXT_PUBLIC_BASE_URL` to your domain
- ✅ Update `IPN_CALLBACK_URL` to your domain
- ✅ Ensure webhook endpoint is publicly accessible
- ✅ Configure IPN settings in NowPayments dashboard

## Getting Your NowPayments API Key

1. **Sign up** at https://nowpayments.io
2. **Verify** your email address
3. **Complete** KYC verification (for production)
4. **Navigate** to Dashboard → Settings → API
5. **Copy** your API key
6. **Enable** IPN (Instant Payment Notification) in settings
7. **Set IPN URL** to: `${NEXT_PUBLIC_BASE_URL}/api/payment/webhook`

## Security Notes

⚠️ **Important Security Practices:**
- Never commit `.env.local` to version control
- Use different API keys for development and production
- Rotate API keys periodically
- Keep API keys secure and private
- Use environment variables in hosting platforms (Vercel, Netlify, etc.)

## Testing

### Sandbox Mode
- NowPayments offers sandbox/testing API keys
- Use sandbox keys for development
- Switch to production keys for live payments

### Local Testing
- Use `http://localhost:3000` for local development
- Use ngrok or similar for webhook testing
- Test with testnet cryptocurrencies

## Troubleshooting

### "Payment service not configured"
- Check that `NOWPAYMENTS_API_KEY` is set in `.env.local`
- Restart the development server after adding env variables
- Verify the API key is correct

### "Failed to create payment"
- Verify API key is valid
- Check API key has required permissions
- Ensure cryptocurrency is enabled in NowPayments dashboard
- Check network connectivity

### Webhooks not working
- Verify `IPN_CALLBACK_URL` is publicly accessible
- Check IPN settings in NowPayments dashboard
- Ensure webhook endpoint URL matches exactly
- Test webhook endpoint manually

## File Structure

```
frontend/
  ├── .env.local          # Your actual environment variables (not in git)
  ├── .env.example        # Example file (safe to commit)
  └── ENV_SETUP.md        # This file
```

## Quick Reference

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Yes | `https://xxx.supabase.co` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Yes | `eyJhbGci...` | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Yes | `eyJhbGci...` | Supabase service role key (server-only) |
| `NOWPAYMENTS_API_KEY` | ✅ Yes* | `abc123...` | Your API key from NowPayments (*if using payments) |
| `NOWPAYMENTS_API_URL` | ❌ No | `https://api.nowpayments.io/v1` | API endpoint (default is fine) |
| `NEXT_PUBLIC_BASE_URL` | ✅ Yes | `http://localhost:3000` | Your app's base URL |
| `IPN_CALLBACK_URL` | ✅ Yes* | `http://localhost:3000/api/payment/webhook` | Webhook callback URL (*if using payments) |

