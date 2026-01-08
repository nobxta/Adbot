import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { logActivity } from '@/lib/queries';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    // Check if token exists first
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization token required' },
        { status: 401 }
      );
    }

    const admin = await requireRole(request, ['ADMIN']);
    
    // Get form data with file
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!file.name.endsWith('.session')) {
      return NextResponse.json(
        { error: 'Only .session files are allowed' },
        { status: 400 }
      );
    }

    // Extract phone number from filename
    const phone_number = file.name.replace('.session', '');

    // Forward the file to Python backend for REAL upload and verification
    const uploadFormData = new FormData();
    uploadFormData.append('file', file);

    const uploadResponse = await fetch(`${PYTHON_BACKEND_URL}/api/admin/sessions/upload`, {
      method: 'POST',
      headers: {
        'Authorization': request.headers.get('Authorization') || '',
      },
      body: uploadFormData,
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.json().catch(() => ({ detail: 'Upload failed' }));
      return NextResponse.json(
        { error: error.detail || 'Failed to upload session to VPS' },
        { status: uploadResponse.status }
      );
    }

    const uploadResult = await uploadResponse.json();

    // File is verified and on VPS - now create DB metadata (without API credentials)
    // API credentials will be assigned later when sessions are assigned to users
    const { data: session, error: dbError } = await supabase
      .from('sessions')
      .insert([{
        phone_number,
        api_id: '', // Will be assigned when session is used
        api_hash: '', // Will be assigned when session is used
        session_file_path: `backend/sessions/unused/${file.name}`,
        status: 'UNUSED', // Verified by Python, ready to use
      }])
      .select()
      .single();

    if (dbError) {
      // DB creation failed, but file is on VPS - log this discrepancy
      console.error('DB creation failed after VPS upload:', dbError);
      return NextResponse.json(
        { error: 'File uploaded to VPS but database record creation failed' },
        { status: 500 }
      );
    }

    // Log the upload
    await logActivity({
      admin_id: admin.userId,
      action: 'CREATE',
      entity_type: 'session',
      entity_id: session.id,
      details: {
        phone_number,
        filename: file.name,
        verification: uploadResult.verification,
        timestamp: new Date().toISOString(),
      },
    });

    // Trigger queue resolution (new session may resolve queued adbots)
    try {
      const { resolveQueuedAdbots } = await import('@/lib/queue-resolution');
      // Run in background (don't wait)
      resolveQueuedAdbots().catch(err => {
        console.error('Background queue resolution failed after session upload:', err);
      });
    } catch (importError) {
      console.error('Failed to import queue resolution:', importError);
    }

    return NextResponse.json({
      success: true,
      message: 'Session uploaded and verified successfully',
      data: {
        session_id: session.id,
        filename: file.name,
        verification: uploadResult.verification,
      },
    });
  } catch (error) {
    console.error('Error uploading session:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    
    // Handle authentication errors - check for various error messages
    if (message.includes('Unauthorized') || 
        message.includes('Invalid') || 
        message.includes('expired') ||
        message.includes('token')) {
      return NextResponse.json(
        { error: 'Invalid or expired token. Please log out and log in again.' },
        { status: 401 }
      );
    }
    
    if (message.includes('Forbidden')) {
      return NextResponse.json(
        { error: 'You do not have permission to perform this action' },
        { status: 403 }
      );
    }
    
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}


