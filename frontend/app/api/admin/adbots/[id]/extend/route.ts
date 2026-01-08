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
    const { days } = body;

    if (!days || days < 1) {
      return NextResponse.json(
        { error: 'Days must be at least 1' },
        { status: 400 }
      );
    }

    // Get current validity
    const { data: adbot, error: fetchError } = await supabaseAdmin
      .from('adbots')
      .select('valid_until')
      .eq('id', adbotId)
      .single();

    if (fetchError) throw fetchError;

    // Calculate new validity date
    const currentDate = adbot.valid_until ? new Date(adbot.valid_until) : new Date();
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + days);

    // Update validity
    const { data, error } = await supabaseAdmin
      .from('adbots')
      .update({ 
        valid_until: newDate.toISOString()
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
        action: 'extend_validity',
        days: days,
        new_valid_until: newDate.toISOString(),
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Validity extended by ${days} days`,
      data,
    });
  } catch (error) {
    console.error('Error extending validity:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}
