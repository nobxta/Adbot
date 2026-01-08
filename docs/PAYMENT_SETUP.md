# Payment Integration Setup Guide

This guide explains how to set up the NowPayments integration for the HQAdz checkout flow.

## Overview

The payment flow consists of:
1. **Checkout Page** (`/checkout`) - Email collection and payment instructions
2. **Payment API** (`/api/payment/create`) - Creates payment with NowPayments
3. **Status API** (`/api/payment/status`) - Checks payment status
4. **Webhook API** (`/api/payment/webhook`) - Receives payment updates from NowPayments
5. **Success Page** (`/payment-success`) - Confirmation page after successful payment

## Prerequisites

1. NowPayments account (sign up at https://nowpayments.io)
2. API key from NowPayments dashboard
3. Next.js environment variables configured

## Environment Variables

Create a `.env.local` file in the `frontend` directory with the following variables:

```env
# NowPayments API Configuration
NOWPAYMENTS_API_KEY=your_nowpayments_api_key_here
NOWPAYMENTS_API_URL=https://api.nowpayments.io/v1

# Application URLs (update for production)
NEXT_PUBLIC_BASE_URL=http://localhost:3000
IPN_CALLBACK_URL=http://localhost:3000/api/payment/webhook
```

### For Production

Update the URLs to your production domain:

```env
NEXT_PUBLIC_BASE_URL=https://yourdomain.com
IPN_CALLBACK_URL=https://yourdomain.com/api/payment/webhook
```

## NowPayments Setup Steps

1. **Sign up for NowPayments**
   - Go to https://nowpayments.io
   - Create an account and verify your email

2. **Get Your API Key**
   - Log in to the NowPayments dashboard
   - Navigate to API Settings
   - Copy your API key

3. **Configure IPN (Instant Payment Notification)**
   - In NowPayments dashboard, go to IPN Settings
   - Set the IPN URL to: `https://yourdomain.com/api/payment/webhook`
   - Enable IPN notifications

4. **Enable Cryptocurrencies**
   - In the dashboard, select which cryptocurrencies to accept
   - Recommended: BTC, ETH, SOL, LTC, USDT

5. **Set Up Wallet Addresses**
   - Configure wallet addresses for each cryptocurrency in the dashboard
   - NowPayments will handle payment processing automatically

## Testing

### Sandbox Mode

NowPayments offers a sandbox environment for testing:
- Use sandbox API key for development
- Test payments won't process real transactions
- API URL remains the same

### Test Flow

1. Select a plan on the pricing page
2. Enter email address on checkout
3. Select a cryptocurrency
4. Copy the payment address
5. Use NowPayments testnet wallets for testing
6. Confirm payment and verify status updates

## Payment Flow Details

### 1. User Selects Plan
- User clicks "Get Started" on a pricing card
- Redirects to `/checkout?plan=Bronze&type=starter&price=$30&...`

### 2. Email Collection
- User enters email address
- Email is validated
- Proceeds to payment step

### 3. Crypto Selection
- User selects a cryptocurrency (BTC, ETH, SOL, LTC, USDT)
- System creates payment with NowPayments API
- Receives unique payment address and amount

### 4. Payment Instructions
- Displays payment address (copyable)
- Shows exact amount to send
- Warning about not closing the page

### 5. Payment Confirmation
- User clicks "I've Paid" button
- System starts polling for payment status
- Status updates: pending → confirming → paid

### 6. Payment Verification
- System polls `/api/payment/status` every 5 seconds
- NowPayments webhook also sends updates to `/api/payment/webhook`
- When status is "finished" or "confirmed", payment is complete

### 7. Success Page
- Redirects to `/payment-success`
- Shows confirmation message
- Displays payment ID and email
- Provides links to control panel

## API Endpoints

### POST `/api/payment/create`
Creates a new payment with NowPayments.

**Request Body:**
```json
{
  "email": "user@example.com",
  "planName": "Bronze",
  "planType": "starter",
  "amount": 30,
  "currency": "BTC"
}
```

**Response:**
```json
{
  "paymentId": "payment_id_from_nowpayments",
  "paymentAddress": "crypto_address_to_send_to",
  "paymentAmount": "0.001234",
  "paymentCurrency": "BTC",
  "paymentStatus": "waiting",
  "expiresAt": "2024-01-01T12:00:00Z"
}
```

### GET `/api/payment/status?paymentId=xxx`
Checks the status of a payment.

**Response:**
```json
{
  "paymentId": "payment_id",
  "status": "paid",
  "paymentStatus": "finished",
  "payAmount": "0.001234",
  "payCurrency": "BTC",
  "actuallyPaid": "0.001234",
  "outcomeAmount": "30.00",
  "outcomeCurrency": "USD"
}
```

### POST `/api/payment/webhook`
Receives payment updates from NowPayments (IPN).

**Note:** This endpoint should be publicly accessible for NowPayments to send webhooks.

## Database Integration (Optional)

For production, you should store payment records in a database:

1. **Create Payment Record**
   - Store: paymentId, email, planName, planType, amount, status, createdAt
   - Use paymentId as primary key

2. **Update Payment Status**
   - Update status when webhook received
   - Update status when polling finds changes

3. **Activate Plan**
   - When payment status is "finished", activate user's plan
   - Send account credentials to user's email
   - Grant access to control panel

## Security Considerations

1. **API Key Security**
   - Never commit API keys to version control
   - Use environment variables only
   - Rotate API keys periodically

2. **Webhook Verification**
   - Verify webhook signatures (if enabled in NowPayments)
   - Validate payment amounts match order
   - Check payment status before activating plans

3. **Rate Limiting**
   - Implement rate limiting on payment creation
   - Limit status polling frequency
   - Prevent abuse of payment endpoints

4. **Error Handling**
   - Handle payment failures gracefully
   - Log errors for debugging
   - Notify administrators of critical errors

## Troubleshooting

### Payment Creation Fails
- Check API key is correct
- Verify API key has required permissions
- Check network connectivity to NowPayments API
- Review NowPayments API logs in dashboard

### Payment Status Not Updating
- Verify webhook URL is accessible
- Check webhook endpoint logs
- Ensure polling is running (check browser console)
- Verify payment ID is correct

### Payment Address Not Showing
- Check NowPayments API response
- Verify cryptocurrency is enabled in dashboard
- Check browser console for errors
- Review API endpoint logs

## Support

- NowPayments Documentation: https://documenter.getpostman.com/view/7907941/T1LJjU52
- NowPayments Support: https://nowpayments.io/contact

