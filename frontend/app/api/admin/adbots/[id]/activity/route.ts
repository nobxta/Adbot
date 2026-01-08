import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(request, ['ADMIN']);
    const { id: adbotId } = await params;

    // Fetch activity logs for this adbot
    const { data: activities, error } = await supabaseAdmin
      .from('activity_logs')
      .select('*')
      .eq('entity_type', 'adbot')
      .eq('entity_id', adbotId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: activities || [],
    });
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


