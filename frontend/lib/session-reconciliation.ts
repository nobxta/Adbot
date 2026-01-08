/**
 * Session Reconciliation Utilities
 * Ensures filesystem and database state are always in sync
 */

import { supabaseAdmin } from './supabase';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

/**
 * Revoke session assignment - updates both filesystem and database
 * This is the canonical way to unassign sessions
 */
export async function revokeSessionAssignment(
  sessionId: string,
  adminToken?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Step 1: Get session from database
    const { data: session, error: fetchError } = await supabaseAdmin
      .from('sessions')
      .select('id, session_file_path, assigned_to_user_id, status')
      .eq('id', sessionId)
      .single();

    if (fetchError || !session) {
      return { success: false, error: 'Session not found in database' };
    }

    const filename = session.session_file_path?.split('/').pop();
    if (!filename) {
      return { success: false, error: 'Invalid session file path' };
    }

    const userId = session.assigned_to_user_id;

    // Step 2: Move file back to unused folder via Python backend
    if (userId) {
      try {
        let authToken = adminToken;
        if (!authToken) {
          // Generate admin JWT
          try {
            const jwt = require('jsonwebtoken');
            const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
            authToken = jwt.sign(
              { 
                role: 'admin',
                user_id: 'admin',
                iat: Math.floor(Date.now() / 1000),
              },
              JWT_SECRET,
              { expiresIn: '1h' }
            );
          } catch (jwtError) {
            console.error('Failed to generate admin JWT:', jwtError);
          }
        }

        const unassignResponse = await fetch(`${PYTHON_BACKEND_URL}/api/admin/sessions/unassign`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ 
            filename,
            user_id: userId,
          }),
        });

        if (!unassignResponse.ok) {
          const errorData = await unassignResponse.json().catch(() => ({}));
          console.warn('Failed to move session file back to unused folder:', errorData);
          // Continue with database update even if file move fails
        } else {
          console.log(`Successfully moved session ${filename} back to unused folder`);
        }
      } catch (fileError) {
        console.error('Error moving session file:', fileError);
        // Continue with database update
      }
    }

    // Step 3: Update database
    const { error: updateError } = await supabaseAdmin
      .from('sessions')
      .update({
        status: 'UNUSED',
        assigned_to_adbot_id: null,
        assigned_to_user_id: null,
        assigned_at: null,
      })
      .eq('id', sessionId);

    if (updateError) {
      return { success: false, error: `Failed to update database: ${updateError.message}` };
    }

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error during revocation' 
    };
  }
}

/**
 * Revoke all sessions assigned to an adbot
 */
export async function revokeAdbotSessions(adbotId: string, adminToken?: string): Promise<{
  revoked: number;
  errors: string[];
}> {
  try {
    // Get all sessions assigned to this adbot
    const { data: sessions, error: fetchError } = await supabaseAdmin
      .from('sessions')
      .select('id')
      .eq('assigned_to_adbot_id', adbotId)
      .eq('status', 'ASSIGNED');

    if (fetchError) {
      return { revoked: 0, errors: [`Failed to fetch sessions: ${fetchError.message}`] };
    }

    const revoked: string[] = [];
    const errors: string[] = [];

    // Revoke each session
    for (const session of sessions || []) {
      const result = await revokeSessionAssignment(session.id, adminToken);
      if (result.success) {
        revoked.push(session.id);
      } else {
        errors.push(`Session ${session.id}: ${result.error || 'Unknown error'}`);
      }
    }

    return { revoked: revoked.length, errors };
  } catch (error) {
    return { 
      revoked: 0, 
      errors: [error instanceof Error ? error.message : 'Unknown error'] 
    };
  }
}

/**
 * Get accurate unused session count from filesystem (source of truth)
 */
export async function getAccurateUnusedCount(adminToken?: string): Promise<number> {
  try {
    let authToken = adminToken;
    if (!authToken) {
      try {
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
        authToken = jwt.sign(
          { 
            role: 'admin',
            user_id: 'admin',
            iat: Math.floor(Date.now() / 1000),
          },
          JWT_SECRET,
          { expiresIn: '1h' }
        );
      } catch (jwtError) {
        console.error('Failed to generate admin JWT:', jwtError);
        return 0;
      }
    }

    const response = await fetch(`${PYTHON_BACKEND_URL}/api/admin/sessions/list`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch filesystem session counts');
      return 0;
    }

    const result = await response.json();
    if (result.success && result.counts) {
      return result.counts.unused || 0;
    }

    return 0;
  } catch (error) {
    console.error('Error getting accurate unused count:', error);
    return 0;
  }
}

