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

    // Fetch posting logs for this adbot
    // Assuming there's a posting_logs table or similar
    const { data: logs, error } = await supabaseAdmin
      .from('posting_logs')
      .select('*')
      .eq('adbot_id', adbotId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      // If table doesn't exist (PGRST205) or schema error (42P01), return empty array
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return NextResponse.json({
          success: true,
          data: [],
        });
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: logs || [],
    });
  } catch (error) {
    console.error('Error fetching posting logs:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

