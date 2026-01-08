import { NextRequest, NextResponse } from 'next/server';
import { getUserByAccessCode, updateUser } from '@/lib/db';
import { getBotByAccessCode, updateBotLastLogin, getBotById } from '@/lib/bot-db';
import { logActivity } from '@/lib/queries';
import { generateAccessToken, generateRefreshToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

// Simple in-memory rate limiter for access code verification
// Prevents brute force attacks by limiting attempts per IP
// In production, use Redis or a dedicated rate limiting service
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 5; // Max 5 attempts per window

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);
  
  if (!record || now > record.resetAt) {
    // New window or expired - reset
    rateLimitMap.set(identifier, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return false; // Rate limit exceeded
  }
  
  record.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accessCode } = body;

    if (!accessCode || typeof accessCode !== 'string') {
      return NextResponse.json(
        { error: 'Access code is required' },
        { status: 400 }
      );
    }

    // Rate limiting: prevent brute force attacks on access codes
    // Use IP address as identifier (in production, consider using user agent + IP)
    const clientIp = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    const identifier = `access_code_${clientIp}`;
    
    if (!checkRateLimit(identifier)) {
      return NextResponse.json(
        { 
          error: 'Too many login attempts. Please try again in 15 minutes.',
          retryAfter: 900 // seconds
        },
        { status: 429 }
      );
    }

    // ============================================
    // BOT-CENTRIC AUTHENTICATION
    // Access code resolves to BOT, not USER
    // ============================================
    
    // First, try to find bot by access code (PRIMARY method)
    let bot = await getBotByAccessCode(accessCode);
    
    // If bot not found, check if it's an admin user (backward compatibility)
    // This allows existing admin users to still log in during migration
    let user = null;
    let isAdminUser = false;
    
    if (!bot) {
      user = await getUserByAccessCode(accessCode);
      if (user && user.role === 'admin') {
        isAdminUser = true;
        // For admin users, we still need to create/get their bot
        // Check if admin bot exists
        if (supabaseAdmin) {
          const { data: adminBot } = await supabaseAdmin
            .from('bots')
            .select('*')
            .eq('owner_user_id', user.id)
            .maybeSingle();
          
          if (adminBot) {
            bot = adminBot as any;
          } else {
            // Create bot for admin user if it doesn't exist
            const { data: newBot } = await supabaseAdmin
              .from('bots')
              .insert({
                bot_id: user.id, // Use user id as bot_id for admins
                access_code: user.access_code,
                password_hash: user.password_hash || null,
                plan_type: null, // Admins don't have plans
                plan_status: 'active',
                owner_user_id: user.id,
              })
              .select()
              .single();
            
            if (newBot) {
              bot = newBot as any;
            }
          }
        }
      }
    }

    if (!bot && !user) {
      // Invalid code - rate limit still applies (prevents enumeration)
      console.log('[verify-access-code] Access code not found:', {
        accessCode,
        searchedAs: accessCode.trim().toUpperCase(),
      });
      return NextResponse.json(
        { error: 'Invalid access code. Please check your access code and try again.' },
        { status: 401 }
      );
    }

    // CRITICAL: Check subscription status for non-admin users
    if (bot && bot.owner_user_id && supabaseAdmin) {
      // Find adbot linked to this bot
      const { data: adbot, error: adbotError } = await supabaseAdmin
        .from('adbots')
        .select('id, subscription_status, expires_at, grace_expires_at, deleted_state')
        .eq('bot_id', bot.id)
        .eq('deleted_state', false) // Only check non-deleted adbots
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (adbotError) {
        console.error('[verify-access-code] Error fetching adbot:', adbotError);
      }

      if (adbot) {
        const subscriptionStatus = adbot.subscription_status || 'ACTIVE';
        const now = new Date();
        const graceExpiresAt = adbot.grace_expires_at ? new Date(adbot.grace_expires_at) : null;

        // Check subscription status
        if (subscriptionStatus === 'DELETED') {
          return NextResponse.json(
            { 
              error: 'Subscription expired and bot deleted. Renewal not possible.',
              subscription_status: 'DELETED',
            },
            { status: 403 }
          );
        }

        if (subscriptionStatus === 'EXPIRED') {
          // Check if still in grace period
          if (graceExpiresAt && now > graceExpiresAt) {
            // Grace period expired - should be DELETED (will be handled by expiry check)
            return NextResponse.json(
              { 
                error: 'Subscription expired and bot deleted. Renewal not possible.',
                subscription_status: 'DELETED',
              },
              { status: 403 }
            );
          }

          // Still in grace period - allow access but return status
          return NextResponse.json({
            success: true,
            accessToken: await generateAccessToken({
              botId: bot.bot_id,
              userId: bot.owner_user_id,
              role: role,
              email: email,
            }),
            refreshToken: await generateRefreshToken({
              botId: bot.bot_id,
              userId: bot.owner_user_id,
              role: role,
              email: email,
            }),
            bot: {
              id: bot.bot_id,
              role: role,
              email: email,
            },
            user: {
              id: bot.owner_user_id || bot.bot_id,
              role: role,
              email: email,
            },
            subscription_status: 'EXPIRED',
            grace_expires_at: adbot.grace_expires_at,
            expires_at: adbot.expires_at,
          });
        }

        // ACTIVE subscription - continue normally
        console.log('[verify-access-code] Subscription status: ACTIVE');
      }
    }
    
    // Log what we found for debugging
    if (bot) {
      console.log('[verify-access-code] Found bot:', {
        bot_id: bot.bot_id,
        access_code: bot.access_code,
        owner_user_id: bot.owner_user_id,
        plan_status: bot.plan_status,
      });
    }
    if (user) {
      console.log('[verify-access-code] Found user:', {
        user_id: user.id,
        access_code: user.access_code,
        role: user.role,
      });
    }
    
    // Successful login - reset rate limit for this IP
    rateLimitMap.delete(identifier);

    // Update last login timestamp
    if (bot) {
      await updateBotLastLogin(bot.bot_id);
    } else if (user) {
      await updateUser(user.id, { last_login: new Date().toISOString() });
    }

    // Get owner user info if bot has owner_user_id
    let ownerUser = null;
    let email: string | undefined;
    let role: 'ADMIN' | 'USER' | 'RESELLER' = 'USER';
    
    if (bot && bot.owner_user_id && supabaseAdmin) {
      const { data: owner, error: ownerError } = await supabaseAdmin
        .from('users')
        .select('id, email, role')
        .eq('id', bot.owner_user_id)
        .maybeSingle();
      
      if (ownerError) {
        console.error('[verify-access-code] Error fetching owner user:', ownerError);
      }
      
      if (owner) {
        ownerUser = owner;
        email = owner.email || undefined;
        role = (owner.role?.toUpperCase() as 'ADMIN' | 'USER' | 'RESELLER') || 'USER';
        console.log('[verify-access-code] Owner user role:', role, 'from owner.role:', owner.role);
      } else {
        console.warn('[verify-access-code] No owner user found for bot, using default USER role');
      }
    } else if (user) {
      email = user.email || undefined;
      role = (user.role?.toUpperCase() as 'ADMIN' | 'USER' | 'RESELLER') || 'USER';
      console.log('[verify-access-code] User role:', role, 'from user.role:', user.role);
    }
    
    console.log('[verify-access-code] Final role determined:', role);

    // Log activity (optional - won't fail if table doesn't exist)
    try {
      const entityId = bot ? bot.bot_id : (user?.id || '');
      const entityType = bot ? 'bot' : 'user';
      await logActivity({
        user_id: ownerUser?.id || user?.id || '',
        action: 'LOGIN',
        entity_type: entityType,
        entity_id: entityId,
        ip_address: clientIp,
        user_agent: request.headers.get('user-agent') || undefined,
      });
    } catch (activityError) {
      // Activity logging is optional - don't fail login if it errors
      console.warn('Activity logging failed (non-critical):', activityError);
    }

    // Generate JWT tokens with bot_id (PRIMARY) and optional user_id
    const botId = bot ? bot.bot_id : (user?.id || '');
    const userId = ownerUser?.id || user?.id || undefined;

    const accessToken = await generateAccessToken({
      botId: botId,
      userId: userId,
      role: role,
      email: email,
    });

    const refreshToken = await generateRefreshToken({
      botId: botId,
      userId: userId,
      role: role,
      email: email,
    });

    return NextResponse.json({
      success: true,
      accessToken,
      refreshToken,
      bot: {
        id: botId,
        role: role,
        email: email,
      },
      // Legacy field for backward compatibility
      user: {
        id: userId || botId,
        role: role,
        email: email,
      },
    });
  } catch (error) {
    console.error('Error verifying access code:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

