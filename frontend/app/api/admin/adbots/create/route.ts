import { NextRequest, NextResponse } from 'next/server';
import { requireRole, generateAccessCode } from '@/lib/auth';
import { createAdbot, logActivity, listUnusedSessions, assignSessionToAdbot } from '@/lib/queries';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { createBot } from '@/lib/bot-db';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const admin = await requireRole(request, ['ADMIN']);

    const body = await request.json();
    const {
      product_id,
      plan_type,
      sessions_assigned,
      posting_interval_minutes,
      valid_until,
      user_email, // Optional - create user if provided
      access_code, // Optional - auto-generate if not provided
      session_source, // 'unused' or 'custom'
      creation_type, // 'manual' or 'automatic'
    } = body;

    // Validate required fields
    if (!product_id) {
      return NextResponse.json(
        { error: 'product_id is required' },
        { status: 400 }
      );
    }

    if (!plan_type) {
      return NextResponse.json(
        { error: 'plan_type is required' },
        { status: 400 }
      );
    }

    if (!sessions_assigned || typeof sessions_assigned !== 'number' || sessions_assigned < 1) {
      return NextResponse.json(
        { error: 'sessions_assigned must be a positive number' },
        { status: 400 }
      );
    }

    if (!posting_interval_minutes || typeof posting_interval_minutes !== 'number' || posting_interval_minutes < 1) {
      return NextResponse.json(
        { error: 'posting_interval_minutes must be a positive number' },
        { status: 400 }
      );
    }

    if (!valid_until) {
      return NextResponse.json(
        { error: 'valid_until is required (ISO date string)' },
        { status: 400 }
      );
    }

    // Validate product exists and get details
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, name, sessions_count, posting_interval_minutes, plan_type')
      .eq('id', product_id)
      .single();

    if (productError || !product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Debug: Log plan_type values
    console.log('Plan type from request:', plan_type);
    console.log('Plan type from product:', product.plan_type);

    // Get default post link and groups based on plan type
    // TODO: Later, these will be stored in a configuration table or environment variables
    // For now, using placeholders that will be configured per plan type
    const defaultPostLink = process.env[`DEFAULT_POST_LINK_${plan_type}`] || '';
    const defaultGroupsEnv = process.env[`DEFAULT_GROUPS_${plan_type}`] || '';
    const defaultGroups = defaultGroupsEnv ? defaultGroupsEnv.split(',').map(g => g.trim()).filter(Boolean) : [];
    
    // If no defaults configured, use empty values (will be set later)
    const post_link = defaultPostLink || '';
    const target_groups = defaultGroups.length > 0 ? defaultGroups : [];

    // Step 1: Create or get user first (required for bots table)
    // If email provided, use/create that user; otherwise create a minimal user
    let userId: string;
    
    // Use admin client to bypass RLS policies
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database admin client not configured' },
        { status: 500 }
      );
    }

    // Helper function to generate unique access code
    const generateUniqueAccessCode = async (): Promise<string> => {
      let attempts = 0;
      let accessCode: string;
      do {
        accessCode = generateAccessCode().toUpperCase(); // Ensure uppercase
        attempts++;
        if (attempts > 10) {
          throw new Error('Failed to generate unique access code after 10 attempts');
        }
        // Check if access code exists (case-insensitive check)
        const { data: existing } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('access_code', accessCode)
          .maybeSingle();
        if (!existing) break;
      } while (true);
      return accessCode;
    };

    if (user_email && user_email.trim()) {
      // Check if user exists with this email
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('id, access_code')
        .eq('email', user_email.trim().toLowerCase())
        .maybeSingle();
      
      if (existingUser) {
        userId = existingUser.id;
      } else {
        // Create new user with email using admin client (bypasses RLS)
        const userAccessCode = await generateUniqueAccessCode();
        const { data: newUser, error: userError } = await supabaseAdmin
          .from('users')
          .insert([{
            email: user_email.trim().toLowerCase(),
            access_code: userAccessCode,
            role: 'user', // Must be lowercase per database constraint
            is_active: true,
          }])
          .select()
          .single();
        
        if (userError || !newUser) {
          console.error('User creation error:', userError);
          return NextResponse.json(
            { error: `Failed to create user: ${userError?.message || 'Unknown error'}` },
            { status: 500 }
          );
        }
        userId = newUser.id;
      }
    } else {
      // Create a minimal user with placeholder email and access code
      // Database requires both email and access_code to be NOT NULL
      const placeholderEmail = `bot-${Date.now()}@system.local`;
      const userAccessCode = await generateUniqueAccessCode();
      
      const { data: minimalUser, error: userError } = await supabaseAdmin
        .from('users')
        .insert([{
          email: placeholderEmail,
          access_code: userAccessCode,
          role: 'user', // Must be lowercase per database constraint
          is_active: true,
        }])
        .select()
        .single();
      
      if (userError || !minimalUser) {
        console.error('Minimal user creation error:', userError);
        return NextResponse.json(
          { error: `Failed to create user: ${userError?.message || 'Unknown error'}` },
          { status: 500 }
        );
      }
      userId = minimalUser.id;
    }

    // Step 2: Create bot with access code and user_id
    // Convert plan_type to lowercase (database stores "STARTER"/"ENTERPRISE", backend expects "starter"/"enterprise")
    // Use plan_type from request first, then fallback to product.plan_type
    const planTypeToNormalize = plan_type || product.plan_type;
    let normalizedPlanType: string | null = null;
    
    if (planTypeToNormalize) {
      // Convert to string, trim, and lowercase
      normalizedPlanType = String(planTypeToNormalize).trim().toLowerCase();
      
      // Validate normalized plan type
      if (!['starter', 'enterprise'].includes(normalizedPlanType)) {
        return NextResponse.json(
          { error: `Invalid plan_type: "${normalizedPlanType}". Must be "starter" or "enterprise"` },
          { status: 400 }
        );
      }
    }
    
    console.log('Normalized plan type:', normalizedPlanType);
    console.log('Sending to bot creation:', {
      plan_type: normalizedPlanType,
      owner_user_id: userId,
      userId_valid: !!userId,
    });
    
    // Ensure userId is set before creating bot
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required but was not created' },
        { status: 500 }
      );
    }
    
    const token = request.headers.get('Authorization') || '';
    const botResponse = await fetch(`${request.nextUrl.origin}/api/admin/bots/create`, {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        access_code: access_code || undefined, // Auto-generate if not provided
        plan_type: normalizedPlanType, // This should now be "starter" or "enterprise"
        plan_status: 'active',
        cycle_delay: posting_interval_minutes * 60, // Convert minutes to seconds
        expires_at: valid_until,
        owner_user_id: userId, // Link bot to user (required)
      }),
    });

    if (!botResponse.ok) {
      const errorData = await botResponse.json();
      console.error('Bot creation failed:', {
        status: botResponse.status,
        error: errorData,
        requestBody: {
          plan_type: normalizedPlanType,
          owner_user_id: userId,
        },
      });
      throw new Error(errorData.error || `Failed to create bot: ${botResponse.status}`);
    }

    const botResult = await botResponse.json();
    const bot = botResult.data;
    const credentials = botResult.credentials;

    // Step 3: Create adbot linked to bot
    // Note: For manual creation, there's no order_id (no payment)
    // Post link and groups are assigned based on plan type (currently same for both, will differ later)
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required but was not created' },
        { status: 500 }
      );
    }

    // CRITICAL: Map product.plan_type to execution_mode (SAME as webhook)
    // This ensures admin-created and user-paid bots are IDENTICAL
    if (!product.plan_type) {
      return NextResponse.json(
        { error: `Product ${product_id} missing required plan_type field` },
        { status: 400 }
      );
    }
    
    const execution_mode = product.plan_type.toUpperCase() === 'STARTER' ? 'starter' : 'enterprise';
    
    // CRITICAL: Validate plan_type from request matches product.plan_type
    // Admin can select plan_type, but it must match product.plan_type
    const requestPlanType = plan_type?.toUpperCase();
    const productPlanType = product.plan_type.toUpperCase();
    if (requestPlanType && requestPlanType !== productPlanType) {
      return NextResponse.json(
        { error: `Plan type mismatch: Requested "${requestPlanType}" but product has "${productPlanType}". They must match.` },
        { status: 400 }
      );
    }

    let adbot;
    try {
      // For manual admin-created adbots, create a dummy order (marked as manual)
      // This ensures admin-created and user-paid bots have identical data structure
      const { data: dummyOrder, error: orderCreateError } = await supabaseAdmin
        .from('orders')
        .insert([{
          user_id: userId,
          product_id,
          total_amount: 0, // Free manual creation
          status: 'COMPLETED', // Mark as completed since it's manual
        }])
        .select()
        .single();
      
      if (orderCreateError || !dummyOrder) {
        throw new Error(`Failed to create order for manual adbot: ${orderCreateError?.message || 'Unknown error'}`);
      }
      
      // CRITICAL: Use SAME createAdbot function as webhook
      // Pass execution_mode from product.plan_type (canonical mapping)
      adbot = await createAdbot({
        user_id: userId,
        order_id: dummyOrder.id, // Always create order (even for manual adbots)
        product_id,
        post_link: post_link || '',
        target_groups: target_groups.length > 0 ? target_groups : [],
        sessions_assigned,
        posting_interval_minutes,
        valid_until,
        execution_mode, // CRITICAL: Set from product.plan_type (same as webhook)
        bot_id: bot.id, // Link adbot to bot
        validity_days: product.validity_days, // CRITICAL: Pass validity_days for subscription lifecycle
      });
    } catch (error) {
      console.error('Error creating adbot:', error);
      return NextResponse.json(
        { error: `Failed to create adbot: ${error instanceof Error ? error.message : 'Unknown error'}` },
        { status: 500 }
      );
    }
    
    // Step 4: Link adbot to bot
    try {
      const { error: linkError } = await supabase
        .from('adbots')
        .update({ bot_id: bot.id })
        .eq('id', adbot.id);
      
      if (linkError) {
        console.error('Error linking adbot to bot:', linkError);
        // Continue - this is not critical, we can retry later
      }
    } catch (error) {
      console.error('Error linking adbot to bot:', error);
      // Continue - this is not critical
    }

    // Step 5: Assign sessions from unused pool if session_source is 'unused'
    let finalAdbotStatus: 'STOPPED' | 'QUEUED' = 'STOPPED';
    let assignedSessionsCount = 0;
    let missingSessionsCount = 0;
    let queuedReason: string | undefined;
    
    if (session_source === 'unused') {
      try {
        const unusedSessions = await listUnusedSessions(sessions_assigned);
        const availableCount = unusedSessions?.length || 0;
        
        // Assign available sessions (even if less than required)
        const assignedSessions = [];
        const sessionsToAssign = Math.min(availableCount, sessions_assigned);
        
        if (unusedSessions && unusedSessions.length > 0) {
          for (let i = 0; i < sessionsToAssign; i++) {
            if (!unusedSessions[i] || !unusedSessions[i].id) {
              console.warn(`Skipping invalid session at index ${i}`);
              continue;
            }
            try {
              // Get admin token from request for Python backend authentication
              const authHeader = request.headers.get('Authorization') || '';
              const adminToken = authHeader.replace('Bearer ', '');
              
              const assigned = await assignSessionToAdbot(unusedSessions[i].id, adbot.id, adminToken);
              if (assigned) {
                assignedSessions.push(assigned);
              }
            } catch (error) {
              console.error(`Failed to assign session ${unusedSessions[i]?.id}:`, error);
              // For admin-created adbots, try direct assignment if verification fails
              // This allows admins to assign sessions even if Python backend is unavailable
              if (supabaseAdmin) {
                try {
                  const { error: directAssignError, data: directAssigned } = await supabaseAdmin
                    .from('sessions')
                    .update({
                      status: 'ASSIGNED',
                      assigned_to_adbot_id: adbot.id,
                      assigned_to_user_id: userId,
                      assigned_at: new Date().toISOString(),
                    })
                    .eq('id', unusedSessions[i].id)
                    .select()
                    .single();
                  
                  if (!directAssignError && directAssigned) {
                    assignedSessions.push(directAssigned);
                    console.log(`Directly assigned session ${unusedSessions[i].id} (bypassing verification)`);
                  } else {
                    console.error(`Direct assignment also failed:`, directAssignError);
                  }
                } catch (directError) {
                  console.error(`Direct assignment error:`, directError);
                }
              } else {
                console.error('supabaseAdmin not available for direct assignment');
              }
            }
          }
        }
        
        assignedSessionsCount = assignedSessions.length;
        missingSessionsCount = Math.max(0, sessions_assigned - assignedSessionsCount);
        
        // Determine status based on session assignment
        if (missingSessionsCount > 0) {
          // Not enough sessions - set to QUEUED
          finalAdbotStatus = 'QUEUED';
          queuedReason = `Insufficient sessions. Required: ${sessions_assigned}, Available: ${assignedSessionsCount}, Missing: ${missingSessionsCount}`;
          
          console.warn(`Admin-created adbot will be QUEUED due to insufficient sessions:`, {
            adbot_id: adbot.id,
            required: sessions_assigned,
            assigned: assignedSessionsCount,
            missing: missingSessionsCount,
          });
          
          // CRITICAL: Notify admin immediately
          await createNotification({
            type: 'ERROR',
            title: '⚠️ Admin-Created Adbot Queued: Insufficient Sessions',
            message: `Adbot ${adbot.id} requires ${sessions_assigned} sessions but only ${assignedSessionsCount} available. Missing: ${missingSessionsCount}. Adbot created in QUEUED state.`,
          });
        } else {
          console.log(`Successfully assigned ${assignedSessionsCount} sessions to admin-created adbot ${adbot.id}`);
        }
        
        // Update adbot with assigned sessions count and queue status
        if (supabaseAdmin) {
          try {
            await supabaseAdmin
              .from('adbots')
              .update({
                sessions_assigned: assignedSessionsCount,
                status: finalAdbotStatus,
                required_sessions: sessions_assigned,
                missing_sessions_count: missingSessionsCount,
                queued_reason: queuedReason,
                queued_at: finalAdbotStatus === 'QUEUED' ? new Date().toISOString() : null,
              })
              .eq('id', adbot.id);
          } catch (updateError) {
            console.error('Error updating adbot with session count and queue status:', updateError);
            // Continue - adbot is created, status update can be retried
          }
        }
      } catch (error) {
        console.error('Error assigning sessions:', error);
        // If assignment completely fails, set to QUEUED
        finalAdbotStatus = 'QUEUED';
        missingSessionsCount = sessions_assigned;
        queuedReason = `Session assignment failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        
        // Update adbot status to QUEUED
        if (supabaseAdmin) {
          try {
            await supabaseAdmin
              .from('adbots')
              .update({
                status: 'QUEUED',
                required_sessions: sessions_assigned,
                missing_sessions_count: missingSessionsCount,
                queued_reason: queuedReason,
                queued_at: new Date().toISOString(),
              })
              .eq('id', adbot.id);
          } catch (updateError) {
            console.error('Error updating adbot to QUEUED status:', updateError);
          }
        }
        
        // Notify admin
        await createNotification({
          type: 'ERROR',
          title: '⚠️ Admin-Created Adbot Queued: Assignment Failed',
          message: `Adbot ${adbot.id} could not be assigned sessions. Error: ${queuedReason}. Adbot created in QUEUED state.`,
        });
      }
    } else {
      // Custom sessions - assume all assigned (admin provides them)
      assignedSessionsCount = sessions_assigned;
      finalAdbotStatus = 'STOPPED';
    }

    // If adbot was queued, trigger queue resolution check (in case enough sessions are now available)
    if (finalAdbotStatus === 'QUEUED') {
      try {
        const { resolveQueuedAdbots } = await import('@/lib/queue-resolution');
        // Run in background (don't wait)
        resolveQueuedAdbots().catch(err => {
          console.error('Background queue resolution failed:', err);
        });
      } catch (importError) {
        console.error('Failed to import queue resolution:', importError);
      }
    }

    // Note: Bot registration in Python backend will happen automatically
    // when user logs in with the access code for the first time

    // Log the creation with creation type
    // Fetch product again to ensure we have the latest data
    const { data: productData } = await supabase
      .from('products')
      .select('name, plan_type')
      .eq('id', product_id)
      .single();

    await logActivity({
      admin_id: admin.userId || admin.botId,
      action: 'CREATE',
      entity_type: 'adbot',
      entity_id: adbot.id,
      details: {
        creation_type: creation_type || 'manual',
        bot_id: bot.id,
        access_code: credentials?.access_code || access_code || 'N/A',
        user_email: user_email || null,
        product_id,
        product_name: productData?.name || 'Unknown',
        plan_type: plan_type || productData?.plan_type || 'unknown',
        sessions_assigned: assignedSessionsCount,
        required_sessions: sessions_assigned,
        missing_sessions_count: missingSessionsCount,
        status: finalAdbotStatus,
        target_groups_count: target_groups.length,
        valid_until,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: finalAdbotStatus === 'QUEUED' 
        ? `Adbot created successfully but QUEUED due to insufficient sessions. Missing: ${missingSessionsCount} sessions.`
        : 'Adbot created successfully',
      data: {
        adbot: {
          ...adbot,
          status: finalAdbotStatus,
          sessions_assigned: assignedSessionsCount,
          required_sessions: sessions_assigned,
          missing_sessions_count: missingSessionsCount,
        },
        bot,
        credentials, // Return credentials for admin to share with user
        queue_info: finalAdbotStatus === 'QUEUED' ? {
          status: 'QUEUED',
          required_sessions: sessions_assigned,
          assigned_sessions: assignedSessionsCount,
          missing_sessions: missingSessionsCount,
          reason: queuedReason,
        } : null,
      },
    });
  } catch (error) {
    console.error('Error creating adbot:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

