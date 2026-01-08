import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { hashPassword, generateAccessCode } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/admin/users/create
 * Admin-only endpoint to create users with access_code + password (NO email required)
 * 
 * Request body:
 * {
 *   access_code?: string,  // Optional - auto-generated if not provided
 *   password: string,       // Required - min 6 characters
 *   plan_type?: 'starter' | 'enterprise',  // Optional
 *   role?: 'user' | 'admin'  // Optional - defaults to 'user'
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   message: string,
 *   data: { id, access_code, role, plan_type, created_at },
 *   credentials: { access_code, password }  // ONE-TIME return for admin
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Require admin role
    await requireRole(request, ['ADMIN']);

    const body = await request.json();
    const { access_code, password, plan_type, role } = body;

    // Validate password (required)
    if (!password || typeof password !== 'string' || password.trim().length < 6) {
      return NextResponse.json(
        { error: 'Password is required and must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Validate plan_type if provided
    if (plan_type && !['starter', 'enterprise'].includes(plan_type)) {
      return NextResponse.json(
        { error: 'plan_type must be "starter" or "enterprise"' },
        { status: 400 }
      );
    }

    // Validate role if provided
    if (role && !['user', 'admin'].includes(role.toLowerCase())) {
      return NextResponse.json(
        { error: 'role must be "user" or "admin"' },
        { status: 400 }
      );
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
      finalAccessCode = generateAccessCode();
    } else {
      // Validate access code format (alphanumeric, dashes optional)
      if (!/^[A-Z0-9-]+$/.test(finalAccessCode)) {
        return NextResponse.json(
          { error: 'Access code must contain only uppercase letters, numbers, and dashes' },
          { status: 400 }
        );
      }
    }

    // Check if access code already exists
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('access_code', finalAccessCode)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json(
        { error: `Access code "${finalAccessCode}" is already in use` },
        { status: 409 }
      );
    }

    // Hash password securely (bcrypt)
    const hashedPassword = await hashPassword(password);

    // Create user in Supabase (NO email required)
    const insertData: any = {
      access_code: finalAccessCode,
      password_hash: hashedPassword,
      role: (role || 'user').toLowerCase(),
      plan_type: plan_type || null,
    };

    // DO NOT include email - it's optional and we're creating users without email

    const { data: user, error: createError } = await supabaseAdmin
      .from('users')
      .insert(insertData)
      .select()
      .single();

    if (createError || !user) {
      console.error('Error creating user:', createError);
      return NextResponse.json(
        { error: createError?.message || 'Failed to create user in database' },
        { status: 500 }
      );
    }

    // Return created user data and credentials (ONE-TIME - admin must save credentials)
    return NextResponse.json({
      success: true,
      message: 'User created successfully',
      data: {
        id: user.id,
        access_code: finalAccessCode,
        role: user.role,
        plan_type: user.plan_type || null,
        created_at: user.created_at,
      },
      // Credentials returned ONLY ONCE - admin must securely share with user
      credentials: {
        access_code: finalAccessCode,
        password: password, // Plain password - returned ONLY ONCE for admin to share with user
      },
    });

  } catch (error) {
    console.error('Error creating user:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}
