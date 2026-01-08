import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { logActivity } from '@/lib/queries';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const admin = await requireRole(request, ['ADMIN']);

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'File is required' },
        { status: 400 }
      );
    }

    const token = request.headers.get('Authorization') || '';
    
    // Upload zip file to Python backend
    const uploadFormData = new FormData();
    uploadFormData.append('file', file);

    const response = await fetch(`${PYTHON_BACKEND_URL}/api/admin/sessions/bulk-upload`, {
      method: 'POST',
      headers: {
        'Authorization': token,
      },
      body: uploadFormData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to upload sessions');
    }

    const result = await response.json();
    const extractedFiles = result.extracted || [];

    // Create database records for all extracted sessions
    const dbRecords = [];
    const errors = [];

    for (const filename of extractedFiles) {
      try {
        // Extract phone number from filename (remove .session extension)
        const phone_number = filename.replace('.session', '');

        // Check if session already exists in database
        const { data: existing } = await supabase
          .from('sessions')
          .select('id')
          .eq('phone_number', phone_number)
          .single();

        if (existing) {
          // Session already exists in DB, skip
          continue;
        }

        // Create new database record
        const { data: session, error: dbError } = await supabase
          .from('sessions')
          .insert([{
            phone_number,
            api_id: '', // Will be assigned when session is used
            api_hash: '', // Will be assigned when session is used
            session_file_path: `backend/sessions/unused/${filename}`,
            status: 'UNUSED', // Verified by Python, ready to use
          }])
          .select()
          .single();

        if (dbError) {
          errors.push(`${filename}: ${dbError.message}`);
          continue;
        }

        dbRecords.push(session);

        // Log the upload
        await logActivity({
          admin_id: admin.userId || admin.botId,
          action: 'CREATE',
          entity_type: 'session',
          entity_id: session.id,
          details: {
            phone_number,
            filename,
            bulk_upload: true,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        errors.push(`${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    // Trigger queue resolution (new sessions may resolve queued adbots)
    if (dbRecords.length > 0) {
      try {
        const { resolveQueuedAdbots } = await import('@/lib/queue-resolution');
        // Run in background (don't wait)
        resolveQueuedAdbots().catch(err => {
          console.error('Background queue resolution failed after bulk upload:', err);
        });
      } catch (importError) {
        console.error('Failed to import queue resolution:', importError);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Extracted ${extractedFiles.length} session(s). Created ${dbRecords.length} database record(s).`,
      data: {
        ...result,
        db_records_created: dbRecords.length,
        db_errors: errors,
      },
    });
  } catch (error) {
    console.error('Error bulk uploading sessions:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

