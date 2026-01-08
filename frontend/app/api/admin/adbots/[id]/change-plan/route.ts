import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logActivity } from '@/lib/queries';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireRole(request, ['ADMIN']);
    const { id: adbotId } = await params;
    const body = await request.json();
    const { product_id } = body;

    if (!product_id) {
      return NextResponse.json(
        { error: 'product_id is required' },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Get current adbot and product
    const { data: currentAdbot } = await supabaseAdmin
      .from('adbots')
      .select('product_id, posting_interval_minutes, sessions_assigned')
      .eq('id', adbotId)
      .single();

    if (!currentAdbot) {
      return NextResponse.json(
        { error: 'Adbot not found' },
        { status: 404 }
      );
    }

    // Get new product details
    const { data: newProduct } = await supabaseAdmin
      .from('products')
      .select('id, name, plan_type, sessions_count, posting_interval_minutes, price')
      .eq('id', product_id)
      .single();

    if (!newProduct) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Update adbot with new product
    const { data: updatedAdbot, error } = await supabaseAdmin
      .from('adbots')
      .update({
        product_id: product_id,
        posting_interval_minutes: newProduct.posting_interval_minutes || currentAdbot.posting_interval_minutes,
        // Optionally update sessions_assigned if new product has different count
        sessions_assigned: newProduct.sessions_count || currentAdbot.sessions_assigned,
      })
      .eq('id', adbotId)
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await logActivity({
      admin_id: admin.userId || admin.botId,
      action: 'UPDATE',
      entity_type: 'adbot',
      entity_id: adbotId,
      details: {
        action: 'change_plan',
        old_product_id: currentAdbot.product_id,
        new_product_id: product_id,
        new_product_name: newProduct.name,
        new_plan_type: newProduct.plan_type,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Plan changed to ${newProduct.name}`,
      data: updatedAdbot,
    });
  } catch (error) {
    console.error('Error changing plan:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


