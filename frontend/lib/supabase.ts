import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key';

// Client for client-side operations (uses anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for server-side operations (uses service role key)
// This bypasses Row Level Security (RLS) - use with caution
// Throws at runtime if env vars are missing (not during module initialization)
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Lazy initialization - throws only when accessed, not during module load
export const supabaseAdmin = new Proxy({} as ReturnType<typeof getSupabaseAdmin>, {
  get(_target, prop) {
    const admin = getSupabaseAdmin();
    return (admin as any)[prop];
  },
});

// Database types
export interface User {
  id: string;
  email?: string;  // Optional - users can be created without email
  role: 'admin' | 'user';
  access_code: string;
  password_hash?: string;  // Optional - for password authentication
  license_key: string | null;
  bot_id: string | null;
  plan_type: 'starter' | 'enterprise' | null;
  plan_status: 'active' | 'inactive' | 'expired' | null;
  created_at: string;
  updated_at: string;
  last_login: string | null;
}

export interface Payment {
  id: string;
  payment_id: string; // NowPayments payment ID
  user_id: string | null;
  email: string;
  plan_name: string;
  plan_type: 'starter' | 'enterprise';
  amount: number;
  currency: string;
  payment_status: 'waiting' | 'confirming' | 'paid' | 'finished' | 'failed' | 'expired';
  payment_address: string | null;
  payment_amount: string | null;
  payment_currency: string | null;
  actually_paid: string | null;
  order_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

// ============================================
// BOT INTERFACE (PRIMARY ENTITY)
// ============================================
export interface Bot {
  id: string; // UUID primary key
  bot_id: string; // Primary identity (same as id, but can be separate)
  access_code: string; // Authentication credential (unique, required)
  password_hash?: string; // Optional password (nullable)
  plan_type: 'starter' | 'enterprise' | null; // Bot plan type
  plan_status: 'active' | 'expired' | 'suspended'; // Bot status
  cycle_delay?: number; // Posting interval in seconds
  owner_user_id?: string; // Optional user ownership (nullable, for CRM only)
  created_at: string;
  updated_at: string;
  expires_at?: string; // Optional expiration
  last_login?: string; // Track last login
  frozen_state?: boolean; // Bot frozen state
  frozen_at?: string; // When bot was frozen
  frozen_reason?: string; // Reason for freezing
  suspended_at?: string; // When bot was suspended
  suspend_reason?: string; // Reason for suspension
  messages_sent?: number; // Total messages sent
  groups_reached?: number; // Total groups reached
  uptime_hours?: number; // Bot uptime in hours
}

// ============================================
// LEGACY BOT INTERFACE (DEPRECATED)
// ============================================
// This interface is kept for backward compatibility
// New code should use the Bot interface above
export interface LegacyBot {
  id: string;
  user_id: string;
  bot_id: string; // Telegram bot ID
  status: 'active' | 'inactive' | 'paused';
  messages_sent: number;
  groups_reached: number;
  uptime_hours: number;
  last_activity: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccessCode {
  id: string;
  code: string;
  role: 'admin' | 'user';
  user_id: string | null;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
}

