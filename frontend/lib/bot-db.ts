// ============================================
// BOT DATABASE OPERATIONS
// Bot-centric database functions
// ============================================

import { supabaseAdmin, supabase, type Bot } from './supabase';

// ============================================
// BOT AUTHENTICATION OPERATIONS
// ============================================

/**
 * Get bot by access code (for authentication)
 * This is the PRIMARY authentication method
 */
export async function getBotByAccessCode(accessCode: string): Promise<Bot | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const trimmedCode = accessCode.trim();
  const upperCode = trimmedCode.toUpperCase();

  // Use maybeSingle() to avoid PGRST116 error when no rows found
  let { data, error } = await supabaseAdmin
    .from('bots')
    .select('*')
    .eq('access_code', upperCode)
    .maybeSingle();

  // If not found with uppercase, try case-insensitive search as fallback
  if (!data && !error) {
    const { data: caseInsensitiveData, error: caseError } = await supabaseAdmin
      .from('bots')
      .select('*')
      .ilike('access_code', trimmedCode)
      .maybeSingle();
    
    if (caseInsensitiveData) {
      data = caseInsensitiveData;
    }
    if (caseError) {
      error = caseError;
    }
  }

  if (error) {
    console.error('Error fetching bot by access code:', error);
    return null;
  }

  if (!data) {
    console.warn(`Access code not found: ${trimmedCode} (searched as: ${upperCode})`);
    return null;
  }

  return data as Bot;
}

/**
 * Get bot by bot_id (primary identity)
 */
export async function getBotById(botId: string): Promise<Bot | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('bots')
    .select('*')
    .eq('bot_id', botId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as Bot;
}

/**
 * Get bot by database id (UUID)
 */
export async function getBotByDbId(id: string): Promise<Bot | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('bots')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as Bot;
}

/**
 * Update bot last login timestamp
 */
export async function updateBotLastLogin(botId: string): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  await supabaseAdmin
    .from('bots')
    .update({ last_login: new Date().toISOString() })
    .eq('bot_id', botId);
}

/**
 * Update bot
 */
export async function updateBot(botId: string, updates: Partial<Bot>): Promise<Bot | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('bots')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('bot_id', botId)
    .select()
    .single();

  if (error || !data) {
    console.error('Error updating bot:', error);
    return null;
  }

  return data as Bot;
}

// ============================================
// BOT CREATION OPERATIONS
// ============================================

/**
 * Create a new bot
 * This is the PRIMARY way to create bots (replaces user creation)
 */
export async function createBot(botData: {
  access_code: string; // Required
  password_hash?: string; // Optional
  plan_type?: 'starter' | 'enterprise'; // Optional
  plan_status?: 'active' | 'expired' | 'suspended'; // Optional, defaults to 'active'
  cycle_delay?: number; // Optional
  owner_user_id?: string; // Optional user ownership
  expires_at?: string; // Optional expiration
}): Promise<Bot | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  // Build insert data - handle both schema versions
  // bot_id is required (NOT NULL) - generate UUID if database doesn't have default
  const { randomUUID } = await import('crypto');
  const insertData: any = {
    bot_id: randomUUID(), // Generate UUID for bot_id (required field)
    access_code: botData.access_code.toUpperCase(),
    password_hash: botData.password_hash || null,
    plan_type: botData.plan_type || null,
    plan_status: botData.plan_status || 'active',
    cycle_delay: botData.cycle_delay || null,
    expires_at: botData.expires_at || null,
  };

  // Handle user_id/owner_user_id - some schemas have user_id (NOT NULL), others have owner_user_id (nullable)
  if (botData.owner_user_id) {
    // Set both to support both schema versions
    insertData.owner_user_id = botData.owner_user_id;
    insertData.user_id = botData.owner_user_id; // Required in some schemas
  } else {
    // If no user_id provided, we can't create bot in schema that requires user_id
    // This should not happen in normal flow, but handle gracefully
    console.warn('Creating bot without user_id - may fail if schema requires it');
    insertData.owner_user_id = null;
    // Don't set user_id if null - let database default or error
  }

  const { data, error } = await supabaseAdmin
    .from('bots')
    .insert(insertData)
    .select()
    .single();

  if (error || !data) {
    console.error('Error creating bot:', {
      error,
      insertData: {
        ...insertData,
        password_hash: insertData.password_hash ? '[HIDDEN]' : null,
      },
    });
    // Throw error with details so it can be caught and returned
    throw new Error(error?.message || 'Failed to create bot in database');
  }

  // Update bot_id to match id (for consistency)
  if (!data.bot_id || data.bot_id === data.id) {
    await supabaseAdmin
      .from('bots')
      .update({ bot_id: data.id })
      .eq('id', data.id);
    data.bot_id = data.id;
  }

  return data as Bot;
}

/**
 * Get all bots (admin only)
 */
export async function getAllBots(): Promise<Bot[]> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('bots')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as Bot[];
}

/**
 * Get bots by owner user_id (optional filtering)
 */
export async function getBotsByOwnerUserId(userId: string): Promise<Bot[]> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('bots')
    .select('*')
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as Bot[];
}

/**
 * Check if access code exists
 */
export async function accessCodeExists(accessCode: string): Promise<boolean> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('bots')
    .select('id')
    .eq('access_code', accessCode.toUpperCase())
    .maybeSingle();

  return !error && data !== null;
}

