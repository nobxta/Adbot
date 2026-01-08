# HQAdz API Testing Guide

Complete guide for testing the backend API endpoints.

## 🚀 Quick Start

### 1. Prerequisites

- API server running (`cd api && npm run dev`)
- Database migrated (`supabase/migrations/001_complete_schema.sql`)
- Environment configured (`.env` file)

### 2. Get Admin Token

```bash
# Login with default admin account
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"accessCode": "ADMIN-2024-CHANGE-THIS"}'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid",
      "email": "admin@hqadz.com",
      "role": "ADMIN",
      "accessCode": "ADMIN-2024-CHANGE-THIS",
      "permissions": ["*"]
    }
  }
}
```

**Save the token:**
```bash
export TOKEN="your-jwt-token-here"
```

## 📋 Test Scenarios

### Scenario 1: Health Check

```bash
# Basic health check
curl http://localhost:8000/health

# Expected: {"success":true,"message":"HQAdz API is running",...}
```

### Scenario 2: Authentication Flow

#### Test Login
```bash
# Valid access code
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"accessCode": "ADMIN-2024-CHANGE-THIS"}'

# Invalid access code (should fail)
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"accessCode": "INVALID-CODE"}'
```

#### Test Token Verification
```bash
curl http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

#### Test Token Refresh
```bash
curl -X POST http://localhost:8000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"token\": \"$TOKEN\"}"
```

### Scenario 3: Admin Dashboard

```bash
# Get dashboard metrics
curl http://localhost:8000/api/admin/dashboard \
  -H "Authorization: Bearer $TOKEN"

# Expected: Sales, revenue, active adbots, stock status, etc.
```

### Scenario 4: User Management

#### List All Users
```bash
curl "http://localhost:8000/api/admin/users?limit=10&offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

#### Get Specific User
```bash
# Replace {user-id} with actual UUID
curl http://localhost:8000/api/admin/users/{user-id} \
  -H "Authorization: Bearer $TOKEN"
```

#### Suspend User
```bash
curl -X POST http://localhost:8000/api/admin/users/{user-id}/suspend \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Testing suspension"}'
```

#### Unsuspend User
```bash
curl -X POST http://localhost:8000/api/admin/users/{user-id}/unsuspend \
  -H "Authorization: Bearer $TOKEN"
```

#### Reset Access Code
```bash
curl -X POST http://localhost:8000/api/admin/users/{user-id}/reset-access-code \
  -H "Authorization: Bearer $TOKEN"
```

### Scenario 5: Adbot Management

#### List All Adbots
```bash
curl "http://localhost:8000/api/admin/adbots?status=RUNNING&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

#### Start Adbot
```bash
curl -X POST http://localhost:8000/api/admin/adbots/{adbot-id}/start \
  -H "Authorization: Bearer $TOKEN"
```

#### Stop Adbot
```bash
curl -X POST http://localhost:8000/api/admin/adbots/{adbot-id}/stop \
  -H "Authorization: Bearer $TOKEN"
```

#### Extend Adbot Validity
```bash
curl -X POST http://localhost:8000/api/admin/adbots/{adbot-id}/extend \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"days": 30}'
```

### Scenario 6: Product Management

#### List Products
```bash
curl http://localhost:8000/api/products
# No auth required - public endpoint
```

#### Create Product (Admin)
```bash
curl -X POST http://localhost:8000/api/admin/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Plan",
    "type": "ADBOT_PLAN",
    "planType": "STARTER",
    "sessionsCount": 2,
    "postingIntervalSeconds": 1200,
    "price": 35.00,
    "currency": "USD",
    "validityDays": 30,
    "description": "Test product"
  }'
```

#### Update Product
```bash
curl -X PUT http://localhost:8000/api/admin/products/{product-id} \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"price": 40.00, "isActive": true}'
```

#### Toggle Product Active Status
```bash
curl -X POST http://localhost:8000/api/admin/products/{product-id}/toggle \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isActive": false}'
```

### Scenario 7: Stock Management

#### Check Stock Status
```bash
curl http://localhost:8000/api/admin/sessions/stock \
  -H "Authorization: Bearer $TOKEN"
```

#### Upload Session
```bash
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

#### List All Sessions
```bash
curl http://localhost:8000/api/admin/sessions \
  -H "Authorization: Bearer $TOKEN"
```

### Scenario 8: Reseller Operations

#### List Resellers
```bash
curl http://localhost:8000/api/admin/resellers \
  -H "Authorization: Bearer $TOKEN"
```

#### Update Commission Rate
```bash
curl -X POST http://localhost:8000/api/admin/resellers/{reseller-id}/commission \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"commissionRate": 0.40}'
```

#### Toggle Reseller Status
```bash
curl -X POST http://localhost:8000/api/admin/resellers/{reseller-id}/toggle \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isActive": false}'
```

#### Reseller Dashboard (as reseller)
```bash
# First, login as reseller
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"accessCode": "RESELLER-CODE"}'

# Get reseller dashboard
curl http://localhost:8000/api/resellers/dashboard \
  -H "Authorization: Bearer $RESELLER_TOKEN"
```

### Scenario 9: Notifications

#### Send Broadcast Notification
```bash
curl -X POST http://localhost:8000/api/admin/notifications/broadcast \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "SYSTEM",
    "title": "Test Notification",
    "message": "This is a test broadcast message",
    "targetAudience": "all"
  }'
```

#### Get User Notifications
```bash
curl http://localhost:8000/api/users/notifications \
  -H "Authorization: Bearer $TOKEN"
```

#### Mark Notification as Read
```bash
curl -X PUT http://localhost:8000/api/notifications/{notification-id}/read \
  -H "Authorization: Bearer $TOKEN"
```

### Scenario 10: System Health

```bash
curl http://localhost:8000/api/admin/system/health \
  -H "Authorization: Bearer $TOKEN"

# Expected: Database status, stock levels, failed adbots, etc.
```

### Scenario 11: Payment Flow

#### Create Payment
```bash
curl -X POST http://localhost:8000/api/payments/create \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "productId": "product-uuid-here"
  }'
```

#### Check Payment Status
```bash
curl http://localhost:8000/api/payments/status/{payment-id}
```

#### Simulate Payment Webhook (Testing)
```bash
curl -X POST http://localhost:8000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "payment_id": "PAY-123",
    "payment_status": "finished",
    "order_id": "order-uuid",
    "pay_amount": "0.001",
    "pay_currency": "BTC"
  }'
```

## 🧪 Automated Testing with Postman/Insomnia

### Import Collection

Create a collection with these requests:

1. **Auth** folder:
   - POST Login
   - POST Refresh
   - GET Me
   - GET Verify

2. **Admin** folder:
   - GET Dashboard
   - GET Users
   - POST Suspend User
   - GET Adbots
   - POST Start Adbot
   - POST Stop Adbot
   - GET Products
   - POST Create Product
   - GET Stock Status
   - POST Upload Session
   - POST Broadcast Notification
   - GET System Health

3. **User** folder:
   - GET Profile
   - GET Orders
   - GET Adbots
   - GET Notifications

4. **Public** folder:
   - GET Products
   - POST Create Payment

### Environment Variables

```json
{
  "baseUrl": "http://localhost:8000",
  "adminToken": "your-admin-token",
  "userToken": "your-user-token",
  "resellerToken": "your-reseller-token"
}
```

## 🔬 Testing with cURL Script

Create `test-api.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:8000"
TOKEN=""

echo "🧪 Testing HQAdz API"
echo "===================="

# Test 1: Health Check
echo -e "\n✅ Test 1: Health Check"
curl -s $BASE_URL/health | jq

# Test 2: Login
echo -e "\n✅ Test 2: Admin Login"
RESPONSE=$(curl -s -X POST $BASE_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"accessCode": "ADMIN-2024-CHANGE-THIS"}')

TOKEN=$(echo $RESPONSE | jq -r '.data.token')
echo "Token: ${TOKEN:0:50}..."

# Test 3: Dashboard
echo -e "\n✅ Test 3: Admin Dashboard"
curl -s $BASE_URL/api/admin/dashboard \
  -H "Authorization: Bearer $TOKEN" | jq '.data | {totalSales, activeAdbots, stockStatus}'

# Test 4: Products
echo -e "\n✅ Test 4: List Products"
curl -s $BASE_URL/api/products | jq '.data.products | length'

# Test 5: System Health
echo -e "\n✅ Test 5: System Health"
curl -s $BASE_URL/api/admin/system/health \
  -H "Authorization: Bearer $TOKEN" | jq '.data.healthy'

echo -e "\n✅ All tests completed!"
```

Run it:
```bash
chmod +x test-api.sh
./test-api.sh
```

## 🐛 Common Issues & Solutions

### Issue 1: 401 Unauthorized

**Problem**: `{"success":false,"error":"Authorization header required"}`

**Solution**: 
```bash
# Make sure to include Bearer token
curl -H "Authorization: Bearer $TOKEN" ...
```

### Issue 2: 403 Forbidden

**Problem**: `{"success":false,"error":"Access denied"}`

**Solution**: 
- Check user role (admin endpoints require ADMIN role)
- Verify token hasn't expired
- Login again to get fresh token

### Issue 3: 404 Not Found

**Problem**: `{"success":false,"error":"Route not found"}`

**Solution**:
- Check endpoint URL spelling
- Verify API server is running
- Check route exists in `api/src/index.ts`

### Issue 4: 500 Internal Server Error

**Problem**: Server error response

**Solution**:
- Check API server logs
- Verify database connection
- Check Supabase credentials in `.env`

### Issue 5: CORS Error (Browser)

**Problem**: CORS policy blocking request

**Solution**:
- Add your frontend URL to CORS config in `api/src/index.ts`
- Or use `--cors` flag for testing

## 📊 Expected Test Results

### Successful Responses

All successful responses follow this format:
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional success message"
}
```

### Error Responses

All error responses follow this format:
```json
{
  "success": false,
  "error": "Error message here"
}
```

### Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (no/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

## 🎯 Testing Checklist

### Authentication
- [ ] Login with valid access code
- [ ] Login with invalid access code (should fail)
- [ ] Get current user info
- [ ] Refresh token
- [ ] Verify token
- [ ] Access protected route without token (should fail)

### Admin Operations
- [ ] View dashboard metrics
- [ ] List all users
- [ ] Suspend/unsuspend user
- [ ] Reset user access code
- [ ] List all adbots
- [ ] Start/stop adbot
- [ ] Extend adbot validity
- [ ] Create product
- [ ] Update product
- [ ] Toggle product status
- [ ] Check stock status
- [ ] Upload session
- [ ] Send broadcast notification
- [ ] Check system health

### User Operations
- [ ] View own profile
- [ ] Update profile
- [ ] View own orders
- [ ] View own adbots
- [ ] Start/stop own adbot
- [ ] Update adbot config
- [ ] View notifications
- [ ] Mark notification as read

### Reseller Operations
- [ ] View reseller dashboard
- [ ] List clients
- [ ] Create adbot for client

### Public Operations
- [ ] List products (no auth)
- [ ] Get product details (no auth)

### Payment Flow
- [ ] Create payment
- [ ] Check payment status
- [ ] Process webhook (simulated)

## 📝 Test Data

### Sample Users

```sql
-- Create test user
INSERT INTO users (email, role, access_code, license_key)
VALUES ('test@example.com', 'USER', 'TEST-USER-123', 'LIC-TEST-001');

-- Create test reseller
INSERT INTO users (email, role, access_code, license_key)
VALUES ('reseller@example.com', 'RESELLER', 'TEST-RESELLER-123', 'LIC-RESELLER-001');

INSERT INTO resellers (user_id, commission_rate, is_active)
SELECT id, 0.50, true FROM users WHERE email = 'reseller@example.com';
```

### Sample Products

Already seeded in migration, but you can add more:

```sql
INSERT INTO products (name, type, plan_type, sessions_count, posting_interval_seconds, price, validity_days)
VALUES ('Test Plan', 'ADBOT_PLAN', 'STARTER', 1, 1800, 15.00, 7);
```

## 🚀 Next Steps

1. **Run all test scenarios** above
2. **Check logs** for any errors
3. **Verify database** records are created correctly
4. **Test edge cases** (invalid data, missing fields, etc.)
5. **Load testing** (optional - use tools like Apache Bench or k6)

## 📚 Additional Resources

- **API Documentation**: See `README.md`
- **Setup Guide**: See `SETUP_GUIDE.md`
- **Database Schema**: See `supabase/migrations/001_complete_schema.sql`
- **Implementation Status**: See `IMPLEMENTATION_STATUS.md`

## 🆘 Need Help?

If tests are failing:
1. Check API server logs
2. Verify database migration ran successfully
3. Check environment variables in `.env`
4. Ensure Supabase credentials are correct
5. Review error messages carefully

For support: admin@hqadz.com

