# HQAdz SaaS - Complete Setup Guide

This guide will walk you through setting up the entire HQAdz Telegram Adbot SaaS platform from scratch.

## 📋 Prerequisites

- **Node.js** 20+ installed
- **Python** 3.9+ installed
- **Supabase** account (or PostgreSQL database)
- **NowPayments** account (for payment processing)
- **Git** installed

## 🚀 Step 1: Clone and Install

```bash
# Clone the repository
cd HQAdz

# Install root dependencies
npm install

# Install API dependencies
cd api
npm install
cd ..
```

## 🗄️ Step 2: Database Setup

### Option A: Using Supabase (Recommended)

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** in your Supabase dashboard
3. Copy the contents of `supabase/migrations/001_complete_schema.sql`
4. Paste and execute in the SQL Editor
5. Wait for completion (should take ~30 seconds)

### Option B: Using Local PostgreSQL

```bash
# Install PostgreSQL if not already installed
# Then create database
createdb hqadz_saas

# Run migration
psql -d hqadz_saas -f supabase/migrations/001_complete_schema.sql
```

## 🔑 Step 3: Environment Configuration

1. Copy the example environment file:

```bash
cp env.example .env
```

2. Edit `.env` with your credentials:

```env
# Supabase Configuration
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-anon-key-here"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"

# JWT Configuration
JWT_SECRET="generate-a-strong-random-secret-here"
JWT_EXPIRES_IN="7d"

# API Configuration
API_PORT=8000
NODE_ENV=development

# Frontend URLs
ADMIN_PANEL_URL="http://localhost:3001"
USER_PANEL_URL="http://localhost:3000"
NEXT_PUBLIC_API_URL="http://localhost:8000"

# NowPayments (Get from nowpayments.io)
NOWPAYMENTS_API_KEY="your-api-key"
NOWPAYMENTS_API_URL="https://api.nowpayments.io/v1"
NOWPAYMENTS_IPN_SECRET="your-ipn-secret"

# Email Configuration (Optional)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
EMAIL_FROM="noreply@hqadz.com"

# Python Backend Integration
PYTHON_BACKEND_PATH="./backend"
PYTHON_SESSIONS_PATH="./backend/sessions"
```

### Getting Your Supabase Keys

1. Go to your Supabase project
2. Click **Settings** → **API**
3. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

### Generating JWT Secret

```bash
# Generate a secure random secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## 🐍 Step 4: Python Backend Setup

```bash
# Navigate to Python backend
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create necessary directories
mkdir -p sessions/unused sessions/assigned sessions/banned
mkdir -p data logs

cd ..
```

## 🏃 Step 5: Start the API Server

```bash
# From the api directory
cd api
npm run dev
```

You should see:

```
╔════════════════════════════════════════╗
║     HQAdz Backend API Server          ║
╠════════════════════════════════════════╣
║  Status: Running                       ║
║  Port: 8000                            ║
║  Environment: development              ║
╚════════════════════════════════════════╝
```

## ✅ Step 6: Verify Installation

### Test the API

```bash
# Health check
curl http://localhost:8000/health

# Should return:
# {"success":true,"message":"HQAdz API is running","timestamp":"..."}
```

### Test Authentication

```bash
# Login with default admin account
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"accessCode": "ADMIN-2024-CHANGE-THIS"}'

# Should return a JWT token
```

## 🔐 Step 7: Change Default Admin Credentials

**IMPORTANT**: Change the default admin access code immediately!

1. Login to Supabase SQL Editor
2. Run:

```sql
UPDATE users 
SET access_code = 'YOUR-NEW-SECURE-CODE' 
WHERE email = 'admin@hqadz.com';
```

Or use the API:

```bash
# First, login and get your token
TOKEN="your-jwt-token-here"

# Then reset access code
curl -X POST http://localhost:8000/api/admin/users/{user-id}/reset-access-code \
  -H "Authorization: Bearer $TOKEN"
```

## 📦 Step 8: Upload Session Stock

Sessions are Telegram accounts used by adbots. You need to upload sessions before users can purchase adbots.

### Upload via API

```bash
TOKEN="your-admin-jwt-token"

curl -X POST http://localhost:8000/api/admin/sessions/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "apiId": "12345678",
    "apiHash": "your-api-hash-here",
    "sessionFilePath": "/path/to/session.session",
    "phoneNumber": "+1234567890"
  }'
```

### Bulk Upload

Create a script `scripts/upload-sessions.js`:

```javascript
const sessions = [
  { apiId: '12345', apiHash: 'hash1', sessionFilePath: './sessions/session1.session', phoneNumber: '+1111111111' },
  { apiId: '12346', apiHash: 'hash2', sessionFilePath: './sessions/session2.session', phoneNumber: '+2222222222' },
  // Add more...
];

// Upload each session
for (const session of sessions) {
  // Make API call to upload
}
```

## 🛍️ Step 9: Configure Products

Products are already seeded in the database, but you can modify them:

```bash
# List products
curl http://localhost:8000/api/products

# Update a product
curl -X PUT http://localhost:8000/api/admin/products/{product-id} \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "price": 25.00,
    "isActive": true
  }'
```

## 💳 Step 10: Configure NowPayments

1. Sign up at [nowpayments.io](https://nowpayments.io)
2. Get your API key from the dashboard
3. Set up IPN (Instant Payment Notification):
   - IPN URL: `https://your-domain.com/api/payments/webhook`
   - IPN Secret: Generate a random secret
4. Add credentials to `.env`

## 🎨 Step 11: Frontend Setup (When Ready)

The frontend panels are pending implementation. Once ready:

```bash
# Admin Panel
cd apps/admin-panel
npm install
npm run dev
# Runs on http://localhost:3001

# User Panel
cd apps/user-panel
npm install
npm run dev
# Runs on http://localhost:3000
```

## 📊 Step 12: Monitor Your System

### Check System Health

```bash
curl http://localhost:8000/api/admin/system/health \
  -H "Authorization: Bearer $TOKEN"
```

### View Dashboard Metrics

```bash
curl http://localhost:8000/api/admin/dashboard \
  -H "Authorization: Bearer $TOKEN"
```

### Check Stock Status

```bash
curl http://localhost:8000/api/admin/sessions/stock \
  -H "Authorization: Bearer $TOKEN"
```

## 🐛 Troubleshooting

### Database Connection Error

```
Error: SUPABASE_URL environment variable is required
```

**Solution**: Make sure `.env` file exists and has correct Supabase credentials.

### Port Already in Use

```
Error: listen EADDRINUSE: address already in use :::8000
```

**Solution**: Change `API_PORT` in `.env` or kill the process using port 8000.

### Python Process Won't Start

**Solution**: 
1. Check Python is installed: `python --version`
2. Check virtual environment is activated
3. Check `PYTHON_BACKEND_PATH` in `.env` is correct

### Low Stock Warning

**Solution**: Upload more sessions via the admin API.

## 📝 Common Tasks

### Create a New Admin User

```sql
-- In Supabase SQL Editor
INSERT INTO users (email, role, access_code, license_key)
VALUES ('newadmin@example.com', 'ADMIN', 'ADMIN-NEW-CODE', 'LICENSE-KEY');

INSERT INTO admins (user_id, can_manage_resellers, can_manage_stock, permissions)
SELECT id, true, true, '["*"]'::jsonb
FROM users
WHERE email = 'newadmin@example.com';
```

### Create a Reseller

```sql
INSERT INTO users (email, role, access_code, license_key)
VALUES ('reseller@example.com', 'RESELLER', 'RESELLER-CODE', 'LICENSE-KEY');

INSERT INTO resellers (user_id, commission_rate, is_active)
SELECT id, 0.50, true
FROM users
WHERE email = 'reseller@example.com';
```

### Manually Create an Order

```bash
curl -X POST http://localhost:8000/api/payments/create \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "productId": "product-uuid-here"
  }'
```

## 🚀 Production Deployment

### 1. Environment Setup

```env
NODE_ENV=production
JWT_SECRET="use-a-very-strong-secret-here"
SUPABASE_URL="your-production-supabase-url"
# ... other production values
```

### 2. Build

```bash
cd api
npm run build
```

### 3. Start

```bash
npm start
```

### 4. Process Manager (PM2)

```bash
npm install -g pm2

# Start API
pm2 start npm --name "hqadz-api" -- start

# Save configuration
pm2 save

# Setup startup script
pm2 startup
```

### 5. Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 📚 Next Steps

1. ✅ Complete frontend panels implementation
2. ✅ Set up email service (Resend, SendGrid, etc.)
3. ✅ Configure domain and SSL
4. ✅ Set up monitoring (Sentry, LogRocket)
5. ✅ Configure backups
6. ✅ Load test the system
7. ✅ Create user documentation

## 🆘 Support

For issues or questions:
- Check the [README.md](README.md) for API documentation
- Review the [database schema](supabase/migrations/001_complete_schema.sql)
- Contact: admin@hqadz.com

## 📄 License

Proprietary - All rights reserved

