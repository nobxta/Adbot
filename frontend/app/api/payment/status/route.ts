import { NextRequest, NextResponse } from 'next/server';

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY || '';
const NOWPAYMENTS_API_URL = process.env.NOWPAYMENTS_API_URL || 'https://api.nowpayments.io/v1';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const paymentId = searchParams.get('paymentId');

    if (!paymentId) {
      return NextResponse.json(
        { error: 'Payment ID is required' },
        { status: 400 }
      );
    }

    if (!NOWPAYMENTS_API_KEY) {
      return NextResponse.json(
        { error: 'Payment service not configured' },
        { status: 500 }
      );
    }

    // Check payment status with NowPayments
    const statusResponse = await fetch(`${NOWPAYMENTS_API_URL}/payment/${paymentId}`, {
      method: 'GET',
      headers: {
        'x-api-key': NOWPAYMENTS_API_KEY,
      },
    });

    if (!statusResponse.ok) {
      const errorData = await statusResponse.json();
      console.error('NowPayments status check error:', errorData);
      return NextResponse.json(
        { error: 'Failed to check payment status', details: errorData },
        { status: statusResponse.status }
      );
    }

    const statusData = await statusResponse.json();

    // Map NowPayments status to our status
    const statusMap: Record<string, string> = {
      'waiting': 'pending',
      'confirming': 'confirming',
      'confirmed': 'confirming',
      'sending': 'confirming',
      'partially_paid': 'confirming',
      'finished': 'paid',
      'failed': 'failed',
      'refunded': 'refunded',
      'expired': 'expired',
    };

    return NextResponse.json({
      paymentId: statusData.payment_id,
      status: statusMap[statusData.payment_status] || statusData.payment_status,
      paymentStatus: statusData.payment_status,
      payAmount: statusData.pay_amount,
      payCurrency: statusData.pay_currency,
      actuallyPaid: statusData.actually_paid,
      outcomeAmount: statusData.outcome_amount,
      outcomeCurrency: statusData.outcome_currency,
    });
  } catch (error) {
    console.error('Payment status check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

