import { supabaseAdmin, supabase, type User, type Payment, type Bot, type AccessCode } from './supabase';

// ==================== USER OPERATIONS ====================

export async function getUserByAccessCode(accessCode: string): Promise<User | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const trimmedCode = accessCode.trim();
  const upperCode = trimmedCode.toUpperCase();

  // Use maybeSingle() instead of single() to avoid PGRST116 error when no rows found
  // First try with uppercase (standard format)
  let { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('access_code', upperCode)
    .maybeSingle();

  // If not found with uppercase, try case-insensitive search as fallback
  if (!data && !error) {
    const { data: caseInsensitiveData, error: caseError } = await supabaseAdmin
      .from('users')
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
    console.error('Error fetching user by access code:', error);
    return null;
  }

  if (!data) {
    console.warn(`Access code not found: ${trimmedCode} (searched as: ${upperCode})`);
    return null;
  }

  return data as User;
}

export async function getUserById(userId: string): Promise<User | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as User;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase())
    .single();

  if (error || !data) {
    return null;
  }

  return data as User;
}

export async function createUser(userData: {
  email?: string;  // Optional: Users can be created with access_code + password only
  role: 'admin' | 'user';
  access_code: string;
  license_key?: string;
  bot_id?: string;
  plan_type?: 'starter' | 'enterprise';
  plan_status?: 'active' | 'inactive' | 'expired';
}): Promise<User | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const insertData: any = {
    ...userData,
    access_code: userData.access_code.toUpperCase(),
  };

  // Only include email if provided (and lowercase it)
  if (userData.email) {
    insertData.email = userData.email.toLowerCase();
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .insert(insertData)
    .select()
    .single();

  if (error || !data) {
    console.error('Error creating user:', error);
    return null;
  }

  return data as User;
}

export async function updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single();

  if (error || !data) {
    console.error('Error updating user:', error);
    return null;
  }

  return data as User;
}

export async function updateUserLastLogin(userId: string): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  await supabaseAdmin
    .from('users')
    .update({ last_login: new Date().toISOString() })
    .eq('id', userId);
}

// ==================== PAYMENT OPERATIONS ====================

export async function createPayment(paymentData: {
  payment_id: string;
  email: string;
  plan_name: string;
  plan_type: 'starter' | 'enterprise';
  amount: number;
  currency?: string;
  user_id?: string;
  order_id?: string;
  product_id?: string;
  payment_status?: string;
  payment_address?: string;
  payment_amount?: string | number;
  payment_currency?: string;
}): Promise<Payment | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('payments')
    .insert({
      payment_id: paymentData.payment_id,
      email: paymentData.email.toLowerCase(),
      plan_name: paymentData.plan_name,
      plan_type: paymentData.plan_type,
      amount: paymentData.amount,
      currency: paymentData.currency || 'USD',
      user_id: paymentData.user_id || null,
      order_id: paymentData.order_id || null,
      payment_status: (paymentData as any).payment_status || 'waiting',
      payment_address: (paymentData as any).payment_address || null,
      payment_amount: (paymentData as any).payment_amount || null,
      payment_currency: (paymentData as any).payment_currency || null,
    })
    .select()
    .single();

  if (error || !data) {
    console.error('Error creating payment:', error);
    return null;
  }

  return data as Payment;
}

export async function getPaymentByPaymentId(paymentId: string): Promise<Payment | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('payments')
    .select('*')
    .eq('payment_id', paymentId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Payment;
}

export async function updatePaymentStatus(
  paymentId: string,
  status: Payment['payment_status'],
  additionalData?: Partial<Payment>
): Promise<Payment | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const updateData: any = {
    payment_status: status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'finished' || status === 'paid') {
    updateData.completed_at = new Date().toISOString();
  }

  if (additionalData) {
    Object.assign(updateData, additionalData);
  }

  const { data, error } = await supabaseAdmin
    .from('payments')
    .update(updateData)
    .eq('payment_id', paymentId)
    .select()
    .single();

  if (error || !data) {
    console.error('Error updating payment:', error);
    return null;
  }

  return data as Payment;
}

export async function getPaymentsByUserId(userId: string): Promise<Payment[]> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('payments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as Payment[];
}

// ==================== BOT OPERATIONS ====================

export async function getBotByUserId(userId: string): Promise<Bot | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('bots')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Bot;
}

export async function createBot(botData: {
  user_id: string;
  bot_id: string;
  status?: 'active' | 'inactive' | 'paused';
}): Promise<Bot | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('bots')
    .insert({
      ...botData,
      status: botData.status || 'inactive',
    })
    .select()
    .single();

  if (error || !data) {
    console.error('Error creating bot:', error);
    return null;
  }

  return data as Bot;
}

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
    .eq('id', botId)
    .select()
    .single();

  if (error || !data) {
    console.error('Error updating bot:', error);
    return null;
  }

  return data as Bot;
}

export async function updateBotByUserId(userId: string, updates: Partial<Bot>): Promise<Bot | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('bots')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select()
    .single();

  if (error || !data) {
    console.error('Error updating bot:', error);
    return null;
  }

  return data as Bot;
}

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

// ==================== ACCESS CODE OPERATIONS ====================

export async function getAccessCode(code: string): Promise<AccessCode | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('access_codes')
    .select('*')
    .eq('code', code.trim().toUpperCase())
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return null;
  }

  // Check if expired
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return null;
  }

  return data as AccessCode;
}

// ==================== STATISTICS OPERATIONS ====================

export async function getTotalUsers(): Promise<number> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { count, error } = await supabaseAdmin
    .from('users')
    .select('*', { count: 'exact', head: true });

  return count || 0;
}

export async function getActiveBots(): Promise<number> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { count, error } = await supabaseAdmin
    .from('bots')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');

  return count || 0;
}

export async function getTotalRevenue(): Promise<number> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('payments')
    .select('amount')
    .eq('payment_status', 'finished');

  if (error || !data) {
    return 0;
  }

  return data.reduce((sum, payment) => sum + Number(payment.amount), 0);
}

