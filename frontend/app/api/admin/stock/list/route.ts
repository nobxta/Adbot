import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['ADMIN']);

    // Get all sessions from database
    const { data: sessions, error: dbError } = await supabase
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: false });

    if (dbError) {
      throw dbError;
    }

    // Get list of physical files from VPS
    let physicalFiles: string[] = [];
    try {
      const response = await fetch(`${PYTHON_BACKEND_URL}/api/admin/sessions/list`, {
        headers: {
          'Authorization': request.headers.get('Authorization') || '',
        },
      });

      if (response.ok) {
        const result = await response.json();
        physicalFiles = result.sessions?.map((s: any) => s.filename) || [];
      }
    } catch (error) {
      console.error('Failed to fetch physical files from VPS:', error);
      // Continue without physical file list
    }

    // Enhance sessions with file existence status
    const enhancedSessions = sessions?.map(session => {
      const filename = session.session_file_path?.split('/').pop() || '';
      const fileExists = physicalFiles.includes(filename);

      return {
        ...session,
        file_exists: fileExists,
        file_missing: !fileExists,
        usable: fileExists && session.status === 'UNUSED',
      };
    }) || [];

    return NextResponse.json({
      success: true,
      data: {
        sessions: enhancedSessions,
        total: enhancedSessions.length,
        physical_files_count: physicalFiles.length,
      },
    });
  } catch (error) {
    console.error('Error listing sessions:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

