import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { updateProduct, logActivity } from '@/lib/queries';
import { supabase } from '@/lib/supabase';

// PUT /api/admin/products/[id] - Update product
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireRole(request, ['ADMIN']);
    const body = await request.json();
    const { id } = await params;

    const { name, description, type, plan_type, price, sessions_count, posting_interval_minutes, validity_days, is_active } = body;

    // Update product with all fields including plan_type
    const { data: product, error: productError } = await supabase
      .from('products')
      .update({
        name,
        description,
        type,
        plan_type: plan_type || null,
        price,
        sessions_count,
        posting_interval_minutes,
        posting_interval_seconds: posting_interval_minutes * 60,
        validity_days,
        is_active: is_active !== undefined ? is_active : true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (productError) {
      throw productError;
    }

    await logActivity({
      admin_id: admin.userId,
      action: 'UPDATE',
      entity_type: 'product',
      entity_id: id,
      details: { name, type, plan_type, price },
    });

    return NextResponse.json({
      success: true,
      message: 'Product updated successfully',
      data: product,
    });
  } catch (error) {
    console.error('Error updating product:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE /api/admin/products/[id] - Delete product
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireRole(request, ['ADMIN']);
    const { id } = await params;

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    await logActivity({
      admin_id: admin.userId,
      action: 'DELETE',
      entity_type: 'product',
      entity_id: id,
      details: {},
    });

    return NextResponse.json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

