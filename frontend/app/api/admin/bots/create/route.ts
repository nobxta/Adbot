import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { hashPassword, generateAccessCode } from '@/lib/auth';
import { createBot, accessCodeExists } from '@/lib/bot-db';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/admin/bots/create
 * Admin-only endpoint to create bots (replaces user creation)
 * 
 * BOT is the PRIMARY entity. USER is optional metadata.
 * 
 * Request body:
 * {
 *   access_code?: string,  // Optional - auto-generated if not provided
 *   password?: string,      // Optional - min 6 characters if provided
 *   plan_type?: 'starter' | 'enterprise',  // Optional
 *   plan_status?: 'active' | 'expired' | 'suspended',  // Optional, defaults to 'active'
 *   cycle_delay?: number,  // Optional - posting interval in seconds
 *   owner_user_id?: string,  // Optional - link to user for CRM purposes
 *   expires_at?: string,    // Optional - ISO timestamp
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   message: string,
 *   data: { id, bot_id, access_code, plan_type, plan_status, created_at },
 *   credentials: { access_code, password }  // ONE-TIME return for admin (if password provided)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Require admin role
    await requireRole(request, ['ADMIN']);

    const body = await request.json();
    const { 
      access_code, 
      password, 
      plan_type, 
      plan_status,
      cycle_delay,
      owner_user_id,
      expires_at,
    } = body;

    // Validate password if provided (optional but must be min 6 chars if provided)
    if (password !== undefined && password !== null) {
      if (typeof password !== 'string' || password.trim().length < 6) {
        return NextResponse.json(
          { error: 'Password must be at least 6 characters if provided' },
          { status: 400 }
        );
      }
    }

    // Validate plan_type if provided
    if (plan_type && !['starter', 'enterprise'].includes(plan_type)) {
      return NextResponse.json(
        { error: 'plan_type must be "starter" or "enterprise"' },
        { status: 400 }
      );
    }

    // Validate plan_status if provided
    if (plan_status && !['active', 'expired', 'suspended'].includes(plan_status)) {
      return NextResponse.json(
        { error: 'plan_status must be "active", "expired", or "suspended"' },
        { status: 400 }
      );
    }

    // Validate cycle_delay if provided
    if (cycle_delay !== undefined && (typeof cycle_delay !== 'number' || cycle_delay < 0)) {
      return NextResponse.json(
        { error: 'cycle_delay must be a non-negative number' },
        { status: 400 }
      );
    }

    // Validate owner_user_id if provided
    if (owner_user_id && supabaseAdmin) {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', owner_user_id)
        .maybeSingle();
      
      if (!user) {
        return NextResponse.json(
          { error: 'owner_user_id does not exist' },
          { status: 400 }
        );
      }
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Generate access code if not provided
    let finalAccessCode = access_code?.trim().toUpperCase();
    if (!finalAccessCode) {
      // Generate unique access code
      let attempts = 0;
      do {
        finalAccessCode = generateAccessCode();
        attempts++;
        if (attempts > 10) {
          return NextResponse.json(
            { error: 'Failed to generate unique access code. Please try again.' },
            { status: 500 }
          );
        }
      } while (await accessCodeExists(finalAccessCode));
    } else {
      // Validate access code format (alphanumeric, dashes optional)
      if (!/^[A-Z0-9-]+$/.test(finalAccessCode)) {
        return NextResponse.json(
          { error: 'Access code must contain only uppercase letters, numbers, and dashes' },
          { status: 400 }
        );
      }

      // Check if access code already exists
      if (await accessCodeExists(finalAccessCode)) {
        return NextResponse.json(
          { error: `Access code "${finalAccessCode}" is already in use` },
          { status: 409 }
        );
      }
    }

    // Hash password if provided
    let hashedPassword: string | undefined;
    if (password) {
      const { hashPassword } = await import('@/lib/auth');
      hashedPassword = await hashPassword(password);
    }

    // Create bot (PRIMARY entity)
    let bot;
    try {
      bot = await createBot({
        access_code: finalAccessCode,
        password_hash: hashedPassword,
        plan_type: plan_type || null,
        plan_status: plan_status || 'active',
        cycle_delay: cycle_delay || null,
        owner_user_id: owner_user_id || null,
        expires_at: expires_at || null,
      });
    } catch (error) {
      console.error('createBot threw error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create bot in database';
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }

    if (!bot) {
      return NextResponse.json(
        { error: 'Failed to create bot in database (returned null)' },
        { status: 500 }
      );
    }

    // Return created bot data and credentials (ONE-TIME - admin must save credentials)
    const response: any = {
      success: true,
      message: 'Bot created successfully',
      data: {
        id: bot.id,
        bot_id: bot.bot_id,
        access_code: finalAccessCode,
        plan_type: bot.plan_type || null,
        plan_status: bot.plan_status,
        cycle_delay: bot.cycle_delay || null,
        owner_user_id: bot.owner_user_id || null,
        expires_at: bot.expires_at || null,
        created_at: bot.created_at,
      },
    };

    // Credentials returned ONLY ONCE - admin must securely share with bot owner
    if (password) {
      response.credentials = {
        access_code: finalAccessCode,
        password: password, // Plain password - returned ONLY ONCE
      };
    } else {
      response.credentials = {
        access_code: finalAccessCode,
        password: null, // No password set
      };
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error creating bot:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

