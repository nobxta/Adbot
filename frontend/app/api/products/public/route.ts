import { NextRequest, NextResponse } from 'next/server';
import { listProducts } from '@/lib/queries';

/**
 * GET /api/products/public
 * Public endpoint to fetch active products for pricing page
 * No authentication required
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const planType = searchParams.get('plan_type'); // 'STARTER' or 'ENTERPRISE'
    const activeOnly = searchParams.get('activeOnly') !== 'false';

    // Get all active products
    const products = await listProducts(activeOnly);

    // Filter by plan_type if provided
    let filteredProducts = products;
    if (planType) {
      filteredProducts = products.filter(p => 
        p.type === 'ADBOT_PLAN' && 
        p.plan_type?.toUpperCase() === planType.toUpperCase()
      );
    } else {
      // If no plan_type specified, return only ADBOT_PLAN products
      filteredProducts = products.filter(p => p.type === 'ADBOT_PLAN');
    }

    return NextResponse.json({
      success: true,
      data: filteredProducts,
    });
  } catch (error) {
    console.error('Error fetching public products:', error);
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    );
  }
}

