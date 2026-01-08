import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { listProducts, createProduct, logActivity } from '@/lib/queries';
import { supabase } from '@/lib/supabase';

// GET /api/admin/products - List all products
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['ADMIN']);

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('activeOnly') !== 'false';

    const products = await listProducts(activeOnly);

    return NextResponse.json({
      success: true,
      data: products,
    });
  } catch (error) {
    console.error('Error listing products:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

// POST /api/admin/products - Create new product
export async function POST(request: NextRequest) {
  try {
    const admin = await requireRole(request, ['ADMIN']);
    const body = await request.json();

    const { name, description, type, plan_type, price, sessions_count, posting_interval_minutes, validity_days } = body;

    if (!name || !type || !price || !sessions_count || !posting_interval_minutes || !validity_days) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Use supabase directly to include plan_type
    const { data: product, error: productError } = await supabase
      .from('products')
      .insert([{
        name,
        description,
        type,
        plan_type: plan_type || null,
        price,
        sessions_count,
        posting_interval_minutes,
        posting_interval_seconds: posting_interval_minutes * 60,
        validity_days,
        is_active: true,
      }])
      .select()
      .single();

    if (productError) {
      throw productError;
    }

    await logActivity({
      admin_id: admin.userId,
      action: 'CREATE',
      entity_type: 'product',
      entity_id: product.id,
      details: { name, type, price },
    });

    return NextResponse.json({
      success: true,
      message: 'Product created successfully',
      data: product,
    });
  } catch (error) {
    console.error('Error creating product:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


