import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

/**
 * POST /api/admin/stock/reconcile
 * Reconcile filesystem state with database state
 * Fixes mismatches between physical files and database records
 */
export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ['ADMIN']);

    const token = request.headers.get('Authorization') || '';
    
    // Step 1: Get filesystem state from Python backend (source of truth)
    const fsResponse = await fetch(`${PYTHON_BACKEND_URL}/api/admin/sessions/list`, {
      headers: {
        'Authorization': token,
      },
    });

    if (!fsResponse.ok) {
      throw new Error('Failed to fetch filesystem state from Python backend');
    }

    const fsData = await fsResponse.json();
    if (!fsData.success) {
      throw new Error('Python backend returned error');
    }

    const fsSessions = fsData.sessions || {};
    const fsUnused = new Set(fsSessions.unused || []);
    const fsAssigned = new Map<string, string>(); // filename -> user_id
    (fsSessions.assigned || []).forEach((s: any) => {
      fsAssigned.set(s.filename, s.user_id);
    });
    const fsBanned = new Set(fsSessions.banned || []);
    const fsFrozen = new Set(fsSessions.frozen || []);

    // Step 2: Get database state
    const { data: dbSessions, error: dbError } = await supabaseAdmin
      .from('sessions')
      .select('id, session_file_path, status, assigned_to_user_id, assigned_to_adbot_id');

    if (dbError) {
      throw dbError;
    }

    // Step 3: Build reconciliation report
    const reconciliation = {
      fixed: [] as Array<{ type: string; session_id: string; filename: string; action: string }>,
      errors: [] as Array<{ type: string; message: string }>,
      stats: {
        filesystem: {
          unused: fsUnused.size,
          assigned: fsAssigned.size,
          banned: fsBanned.size,
          frozen: fsFrozen.size,
        },
        database: {
          unused: 0,
          assigned: 0,
          banned: 0,
          frozen: 0,
        },
        mismatches: 0,
      },
    };

    // Step 4: Reconcile each database session
    for (const dbSession of dbSessions || []) {
      const filename = dbSession.session_file_path?.split('/').pop() || '';
      if (!filename) continue;

      const dbStatus = dbSession.status;
      const fsLocation = 
        fsUnused.has(filename) ? 'unused' :
        fsAssigned.has(filename) ? 'assigned' :
        fsBanned.has(filename) ? 'banned' :
        fsFrozen.has(filename) ? 'frozen' :
        'missing';

      // Count database statuses
      if (dbStatus === 'UNUSED') reconciliation.stats.database.unused++;
      else if (dbStatus === 'ASSIGNED') reconciliation.stats.database.assigned++;
      else if (dbStatus === 'BANNED') reconciliation.stats.database.banned++;
      else if (dbStatus === 'FROZEN') reconciliation.stats.database.frozen++;

      // Check for mismatches
      const expectedStatus = 
        fsLocation === 'unused' ? 'UNUSED' :
        fsLocation === 'assigned' ? 'ASSIGNED' :
        fsLocation === 'banned' ? 'BANNED' :
        fsLocation === 'frozen' ? 'FROZEN' :
        null;

      if (expectedStatus && dbStatus !== expectedStatus) {
        reconciliation.stats.mismatches++;
        
        // Fix: Update database to match filesystem
        try {
          const updateData: any = {
            status: expectedStatus,
          };

          if (fsLocation === 'assigned') {
            const userId = fsAssigned.get(filename);
            if (userId) {
              updateData.assigned_to_user_id = userId;
            }
          } else {
            updateData.assigned_to_user_id = null;
            updateData.assigned_to_adbot_id = null;
            updateData.assigned_at = null;
          }

          const { error: updateError } = await supabaseAdmin
            .from('sessions')
            .update(updateData)
            .eq('id', dbSession.id);

          if (updateError) {
            reconciliation.errors.push({
              type: 'database_update_failed',
              message: `Failed to update session ${dbSession.id}: ${updateError.message}`,
            });
          } else {
            reconciliation.fixed.push({
              type: 'status_mismatch',
              session_id: dbSession.id,
              filename,
              action: `Updated status from ${dbStatus} to ${expectedStatus} to match filesystem`,
            });
          }
        } catch (fixError) {
          reconciliation.errors.push({
            type: 'fix_error',
            message: `Error fixing session ${dbSession.id}: ${fixError instanceof Error ? fixError.message : 'Unknown error'}`,
          });
        }
      }

      // Check for orphaned assignments (database says ASSIGNED but file is not in assigned folder)
      if (dbStatus === 'ASSIGNED' && fsLocation !== 'assigned' && fsLocation !== 'missing') {
        reconciliation.stats.mismatches++;
        
        try {
          // File exists but not in assigned folder - update database
          const { error: updateError } = await supabaseAdmin
            .from('sessions')
            .update({
              status: fsLocation.toUpperCase() as any,
              assigned_to_user_id: null,
              assigned_to_adbot_id: null,
              assigned_at: null,
            })
            .eq('id', dbSession.id);

          if (updateError) {
            reconciliation.errors.push({
              type: 'orphan_fix_failed',
              message: `Failed to fix orphaned assignment for session ${dbSession.id}: ${updateError.message}`,
            });
          } else {
            reconciliation.fixed.push({
              type: 'orphaned_assignment',
              session_id: dbSession.id,
              filename,
              action: `Removed orphaned assignment (file is ${fsLocation}, not assigned)`,
            });
          }
        } catch (fixError) {
          reconciliation.errors.push({
            type: 'orphan_fix_error',
            message: `Error fixing orphaned assignment ${dbSession.id}: ${fixError instanceof Error ? fixError.message : 'Unknown error'}`,
          });
        }
      }
    }

    // Step 5: Find filesystem files not in database (orphaned files)
    const allFsFiles = new Set([
      ...fsUnused,
      ...Array.from(fsAssigned.keys()),
      ...fsBanned,
      ...fsFrozen,
    ]);

    const dbFilenames = new Set(
      (dbSessions || [])
        .map(s => s.session_file_path?.split('/').pop())
        .filter(Boolean)
    );

    for (const filename of allFsFiles) {
      if (!dbFilenames.has(filename)) {
        reconciliation.errors.push({
          type: 'orphaned_file',
          message: `File ${filename} exists in filesystem but not in database. Manual intervention required.`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      reconciliation,
      message: `Reconciliation complete. Fixed ${reconciliation.fixed.length} mismatches, found ${reconciliation.errors.length} issues.`,
    });
  } catch (error) {
    console.error('Error reconciling stock:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

