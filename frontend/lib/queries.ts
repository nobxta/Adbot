// ============================================
// DATABASE QUERIES FOR SUPABASE
// ============================================

import { supabase } from './supabase';
import {
  User,
  Admin,
  Reseller,
  Product,
  Order,
  Adbot,
  Session,
  Payment,
  Notification,
  ActivityLog,
  UserRole,
  OrderStatus,
  AdbotStatus,
  SessionStatus,
  PaymentStatus,
  NotificationType,
  ActivityAction,
} from '@/types';

// ============================================
// USER QUERIES
// ============================================

export async function createUser(data: {
  access_code: string;
  email?: string;
  role?: UserRole;
  telegram_id?: string;
}) {
  const { data: user, error } = await supabase
    .from('users')
    .insert([{ ...data, role: data.role || 'USER' }])
    .select()
    .single();

  if (error) throw error;
  return user as User;
}

export async function getUserById(id: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as User;
}

export async function getUserByAccessCode(accessCode: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('access_code', accessCode)
    .single();

  if (error) throw error;
  return data as User;
}

export async function updateUser(id: string, updates: Partial<User>) {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as User;
}

export async function suspendUser(id: string) {
  return await updateUser(id, { is_suspended: true });
}

export async function listUsers(filters?: { role?: UserRole; is_active?: boolean }) {
  let query = supabase.from('users').select('*');

  if (filters?.role) {
    query = query.eq('role', filters.role);
  }
  if (filters?.is_active !== undefined) {
    query = query.eq('is_active', filters.is_active);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as User[];
}

// ============================================
// ADMIN QUERIES
// ============================================

export async function getAdminByUsername(username: string) {
  const { data, error } = await supabase
    .from('admins')
    .select('*')
    .eq('username', username)
    .single();

  if (error) throw error;
  return data as Admin;
}

// ============================================
// RESELLER QUERIES
// ============================================

export async function createReseller(data: { user_id: string; commission_rate: number }) {
  const { data: reseller, error } = await supabase
    .from('resellers')
    .insert([data])
    .select()
    .single();

  if (error) throw error;
  return reseller as Reseller;
}

export async function getResellerByUserId(userId: string) {
  const { data, error } = await supabase
    .from('resellers')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) throw error;
  return data as Reseller;
}

export async function listResellers() {
  const { data, error } = await supabase.from('resellers').select('*');
  if (error) throw error;
  return data as Reseller[];
}

export async function updateResellerCommission(id: string, commissionRate: number) {
  const { data, error } = await supabase
    .from('resellers')
    .update({ commission_rate: commissionRate })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Reseller;
}

// ============================================
// PRODUCT QUERIES
// ============================================

export async function createProduct(data: Omit<Product, 'id' | 'created_at' | 'updated_at'>) {
  const { data: product, error } = await supabase
    .from('products')
    .insert([data])
    .select()
    .single();

  if (error) throw error;
  return product as Product;
}

export async function getProductById(id: string) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as Product;
}

export async function listProducts(activeOnly: boolean = true) {
  let query = supabase.from('products').select('*');
  if (activeOnly) {
    query = query.eq('is_active', true);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data as Product[];
}

export async function updateProduct(id: string, updates: Partial<Product>) {
  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Product;
}

// ============================================
// ORDER QUERIES
// ============================================

export async function createOrder(data: {
  user_id: string;
  product_id: string;
  total_amount: number;
  reseller_id?: string;
  commission_amount?: number;
}) {
  const { data: order, error } = await supabase
    .from('orders')
    .insert([{ ...data, status: 'PENDING' }])
    .select()
    .single();

  if (error) throw error;
  return order as Order;
}

export async function getOrderById(id: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as Order;
}

export async function updateOrderStatus(id: string, status: OrderStatus) {
  const { data, error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Order;
}

export async function listOrdersByUser(userId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Order[];
}

export async function listAllOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Order[];
}

// ============================================
// ADBOT QUERIES
// ============================================

export async function createAdbot(data: {
  user_id: string;
  order_id: string | null; // Allow null for manual admin-created adbots
  product_id: string;
  post_link: string;
  target_groups: string[];
  sessions_assigned: number;
  posting_interval_minutes: number;
  valid_until: string;
  execution_mode: 'starter' | 'enterprise'; // CRITICAL: Required - no default fallback
  bot_id?: string; // Optional bot_id to link adbot to bot
  status?: 'STOPPED' | 'QUEUED' | 'ACTIVE' | 'RUNNING'; // Optional status (defaults to STOPPED)
  required_sessions?: number; // Required sessions count (for queue tracking)
  missing_sessions_count?: number; // Missing sessions count (for queue tracking)
  queued_reason?: string; // Reason for queuing
  creation_source?: 'USER_PAYMENT' | 'ADMIN_MANUAL'; // How adbot was created
  validity_days?: number; // Number of days subscription is valid (from product)
}) {
  // CRITICAL: Validate execution_mode
  if (!data.execution_mode || !['starter', 'enterprise'].includes(data.execution_mode)) {
    throw new Error(`Invalid execution_mode: ${data.execution_mode}. Must be 'starter' or 'enterprise'`);
  }

  // Only include order_id if it's not null (some schemas require it, others allow null)
  const insertData: any = {
    user_id: data.user_id,
    product_id: data.product_id,
    post_link: data.post_link,
    target_groups: data.target_groups,
    sessions_assigned: data.sessions_assigned,
    posting_interval_minutes: data.posting_interval_minutes,
    valid_until: data.valid_until,
    execution_mode: data.execution_mode, // CRITICAL: Store execution_mode in database
    status: data.status || 'STOPPED', // Use provided status or default to STOPPED
    messages_sent: 0,
    groups_reached: 0,
  };
  
  // Set bot_id if provided
  if (data.bot_id) {
    insertData.bot_id = data.bot_id;
  }
  
  // Only set order_id if provided (not null)
  if (data.order_id !== null && data.order_id !== undefined && data.order_id !== '') {
    insertData.order_id = data.order_id;
  }

  // Queue tracking fields
  if (data.required_sessions !== undefined) {
    insertData.required_sessions = data.required_sessions;
  }
  if (data.missing_sessions_count !== undefined) {
    insertData.missing_sessions_count = data.missing_sessions_count;
  }
  if (data.queued_reason) {
    insertData.queued_reason = data.queued_reason;
  }
  if (data.creation_source) {
    insertData.creation_source = data.creation_source;
  }
  
  // Set queued_at if status is QUEUED
  if (data.status === 'QUEUED') {
    insertData.queued_at = new Date().toISOString();
  }
  
  // CRITICAL: Set subscription lifecycle fields
  const now = new Date();
  const activatedAt = now.toISOString();
  const expiresAt = new Date(data.valid_until).toISOString();
  const graceExpiresAt = new Date(new Date(expiresAt).getTime() + 24 * 60 * 60 * 1000).toISOString(); // +24 hours
  
  insertData.activated_at = activatedAt;
  insertData.expires_at = expiresAt;
  insertData.grace_expires_at = graceExpiresAt;
  insertData.subscription_status = 'ACTIVE';
  
  if (data.validity_days !== undefined) {
    insertData.validity_days = data.validity_days;
  }
  
  // Initialize notification flags
  insertData.pre_expiry_notification_sent = false;
  insertData.expiry_notification_sent = false;
  insertData.deletion_notification_sent = false;
  
  const { data: adbot, error } = await supabase
    .from('adbots')
    .select()
    .insert([insertData])
    .select()
    .single();

  if (error) throw error;
  return adbot as Adbot;
}

export async function getAdbotById(id: string) {
  const { data, error } = await supabase
    .from('adbots')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as Adbot;
}

export async function listAdbotsByUser(userId: string) {
  const { data, error } = await supabase
    .from('adbots')
    .select('*')
    .eq('user_id', userId)
    .eq('deleted_state', false) // Exclude deleted adbots from user view
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Adbot[];
}

export async function listAllAdbots() {
  // Fetch adbots with related bot and user data (including access_code)
  const { data, error } = await supabase
    .from('adbots')
    .select(`
      *,
      bot:bots!adbots_bot_id_fkey (
        id,
        access_code
      ),
      user:users!adbots_user_id_fkey (
        id,
        email,
        access_code
      ),
      product:products!adbots_product_id_fkey (
        id,
        name
      )
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  
  // Transform the data to match the expected format
  return (data || []).map((adbot: any) => ({
    ...adbot,
    bot: adbot.bot ? (Array.isArray(adbot.bot) ? adbot.bot[0] : adbot.bot) : null,
    user: adbot.user ? (Array.isArray(adbot.user) ? adbot.user[0] : adbot.user) : null,
    product: adbot.product ? (Array.isArray(adbot.product) ? adbot.product[0] : adbot.product) : null,
  })) as Adbot[];
}

export async function updateAdbotStatus(id: string, status: AdbotStatus) {
  const { data, error } = await supabase
    .from('adbots')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Adbot;
}

export async function updateAdbotStats(id: string, messagesSent: number, groupsReached: number) {
  const { data, error } = await supabase
    .from('adbots')
    .update({ messages_sent: messagesSent, groups_reached: groupsReached, last_run: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Adbot;
}

export async function extendAdbotValidity(id: string, days: number) {
  const adbot = await getAdbotById(id);
  const currentValidity = new Date(adbot.valid_until);
  const newValidity = new Date(currentValidity.getTime() + days * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('adbots')
    .update({ valid_until: newValidity.toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Adbot;
}

// ============================================
// SESSION QUERIES
// ============================================

export async function createSession(data: {
  phone_number: string;
  api_id: string;
  api_hash: string;
  session_file_path: string;
}) {
  const { data: session, error } = await supabase
    .from('sessions')
    .insert([{ ...data, status: 'UNUSED' }])
    .select()
    .single();

  if (error) throw error;
  return session as Session;
}

export async function getSessionById(id: string) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as Session;
}

export async function listUnusedSessions(limit?: number) {
  let query = supabase
    .from('sessions')
    .select('*')
    .eq('status', 'UNUSED')
    .order('created_at', { ascending: true });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as Session[];
}

export async function assignSessionToAdbot(sessionId: string, adbotId: string, adminToken?: string) {
  // ASSIGNMENT GUARD: Verify file exists on VPS before assignment
  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (!session) {
    throw new Error('Session not found');
  }

  // Extract filename from session_file_path
  const filename = session.session_file_path?.split('/').pop();
  
  if (!filename) {
    throw new Error('Session file path is invalid');
  }

  // Get user_id from adbot
  const { data: adbot } = await supabase
    .from('adbots')
    .select('user_id')
    .eq('id', adbotId)
    .single();

  if (!adbot || !adbot.user_id) {
    throw new Error('Adbot not found or missing user_id');
  }

  const userId = adbot.user_id;

  // Verify and move file via Python backend
  const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
  
  try {
    // Use admin token if provided, otherwise generate one
    let authToken = adminToken;
    if (!authToken) {
      // Generate admin JWT using the same method as backend expects
      // This is a fallback - ideally adminToken should always be provided
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
        // Continue without token - Python backend will reject but we'll handle gracefully
      }
    }

    // First verify file exists
    const verifyResponse = await fetch(`${PYTHON_BACKEND_URL}/api/admin/sessions/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ filename }),
    });

    if (!verifyResponse.ok) {
      throw new Error('Failed to verify session file on VPS');
    }

    const verification = await verifyResponse.json();

    if (!verification.valid || !verification.exists) {
      // File is missing or invalid - mark session as INVALID_FILE
      await supabase
        .from('sessions')
        .update({
          status: 'INVALID_FILE',
        })
        .eq('id', sessionId);

      throw new Error(`Session file verification failed: ${verification.reason || 'File missing or corrupt'}`);
    }

    // File is verified - now move it to assigned folder via Python backend
    const assignResponse = await fetch(`${PYTHON_BACKEND_URL}/api/admin/sessions/assign`, {
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

    if (!assignResponse.ok) {
      const errorData = await assignResponse.json().catch(() => ({}));
      console.warn('Failed to move session file via Python backend:', errorData);
      // Continue with database update even if file move fails (file might already be moved)
    } else {
      console.log(`Successfully moved session ${filename} to assigned folder for user ${userId}`);
    }

    // Update database status
    const { data, error } = await supabase
      .from('sessions')
      .update({
        status: 'ASSIGNED',
        assigned_to_adbot_id: adbotId,
        assigned_to_user_id: userId,
        assigned_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw error;
    return data as Session;

  } catch (error) {
    // If verification fails, mark session as INVALID_FILE
    await supabase
      .from('sessions')
      .update({
        status: 'INVALID_FILE',
      })
      .eq('id', sessionId)
      .catch(() => {}); // Silent fail on update

    throw error;
  }
}

export async function markSessionAsBanned(sessionId: string) {
  const { data, error } = await supabase
    .from('sessions')
    .update({
      status: 'BANNED',
      banned_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) throw error;
  return data as Session;
}

export async function getSessionStockOverview() {
  // CRITICAL: Use filesystem as source of truth, not database
  // Database can be out of sync, but filesystem is authoritative
  try {
    const { getAccurateUnusedCount } = await import('./session-reconciliation');
    
    // Try to get filesystem counts first (most accurate)
    const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
    try {
      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
      const authToken = jwt.sign(
        { 
          role: 'admin',
          user_id: 'admin',
          iat: Math.floor(Date.now() / 1000),
        },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      const response = await fetch(`${PYTHON_BACKEND_URL}/api/admin/sessions/list`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.counts) {
          // Use filesystem counts (source of truth)
          const overview = {
            total: result.counts.total || 0,
            unused: result.counts.unused || 0,
            assigned: result.counts.assigned || 0,
            banned: result.counts.banned || 0,
            frozen: result.counts.frozen || 0,
          };
          console.log('Session stock overview from filesystem:', overview);
          return overview;
        }
      }
    } catch (fsError) {
      console.warn('Failed to get filesystem counts, falling back to database:', fsError);
    }

    // Fallback: Use database counts (less accurate but better than nothing)
    const { data, error } = await supabase
      .from('sessions')
      .select('status')
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('Could not find the table')) {
        return {
          total: 0,
          unused: 0,
          assigned: 0,
          banned: 0,
          frozen: 0,
        };
      }
      throw error;
    }

    const overview = {
      total: data?.length || 0,
      unused: data?.filter((s) => s.status === 'UNUSED').length || 0,
      assigned: data?.filter((s) => s.status === 'ASSIGNED').length || 0,
      banned: data?.filter((s) => s.status === 'BANNED').length || 0,
      frozen: data?.filter((s) => s.status === 'FROZEN').length || 0,
    };

    console.log('Session stock overview from database (fallback):', overview);
    return overview;
  } catch (error) {
    console.error('Error getting session stock overview:', error);
    // Return zeros on error
    return {
      total: 0,
      unused: 0,
      assigned: 0,
      banned: 0,
      frozen: 0,
    };
  }
}

// ============================================
// PAYMENT QUERIES
// ============================================

export async function createPayment(data: {
  order_id: string;
  user_id: string;
  amount: number;
  currency: string;
  payment_provider: string;
  provider_payment_id?: string;
}) {
  const { data: payment, error } = await supabase
    .from('payments')
    .insert([{ ...data, status: 'PENDING' }])
    .select()
    .single();

  if (error) throw error;
  return payment as Payment;
}

export async function updatePaymentStatus(id: string, status: PaymentStatus, providerResponse?: any) {
  const { data, error } = await supabase
    .from('payments')
    .update({ status, provider_response: providerResponse })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Payment;
}

export async function getPaymentByOrderId(orderId: string) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('order_id', orderId)
    .single();

  if (error) throw error;
  return data as Payment;
}

// ============================================
// NOTIFICATION QUERIES
// ============================================

export async function createNotification(data: {
  user_id?: string;
  type: NotificationType;
  title: string;
  message: string;
}) {
  const { data: notification, error } = await supabase
    .from('notifications')
    .insert([{ ...data, is_read: false }])
    .select()
    .single();

  if (error) throw error;
  return notification as Notification;
}

export async function broadcastNotification(data: {
  type: NotificationType;
  title: string;
  message: string;
  targetRole?: UserRole;
}) {
  // Get all users matching the target role
  let users: User[] = [];
  if (data.targetRole) {
    users = await listUsers({ role: data.targetRole });
  } else {
    users = await listUsers();
  }

  // Create notification for each user
  const notifications = users.map((user) => ({
    user_id: user.id,
    type: data.type,
    title: data.title,
    message: data.message,
    is_read: false,
  }));

  const { data: created, error } = await supabase
    .from('notifications')
    .insert(notifications)
    .select();

  if (error) throw error;
  return created as Notification[];
}

export async function listNotificationsByUser(userId: string) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Notification[];
}

export async function markNotificationAsRead(id: string) {
  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Notification;
}

// ============================================
// ACTIVITY LOG QUERIES
// ============================================

export async function logActivity(data: {
  user_id?: string;
  admin_id?: string;
  action: ActivityAction;
  entity_type: string;
  entity_id?: string;
  details?: any;
  ip_address?: string;
  user_agent?: string;
}) {
  try {
    const { data: log, error } = await supabase
      .from('activity_logs')
      .insert([data])
      .select()
      .single();

    if (error) {
      // Log error but don't throw - activity logging is optional
      console.warn('Failed to log activity (table may not exist):', error.message);
      return null;
    }
    return log as ActivityLog;
  } catch (error) {
    // Gracefully handle errors (e.g., table doesn't exist)
    console.warn('Activity logging failed:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

export async function listActivityLogsByUser(userId: string, limit: number = 50) {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data as ActivityLog[];
}

export async function listAllActivityLogs(limit: number = 100) {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data as ActivityLog[];
}


