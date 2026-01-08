// ============================================
// SHARED TYPES FOR HQADZ PLATFORM
// ============================================

export type UserRole = 'ADMIN' | 'USER' | 'RESELLER';
export type OrderStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
export type AdbotStatus = 'ACTIVE' | 'STOPPED' | 'EXPIRED' | 'SUSPENDED';
export type SessionStatus = 'UNUSED' | 'ASSIGNED' | 'BANNED';
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
export type NotificationType = 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS' | 'PROMOTION';
export type ActivityAction = 'LOGIN' | 'LOGOUT' | 'CREATE' | 'UPDATE' | 'DELETE' | 'START' | 'STOP' | 'PURCHASE';

// ============================================
// USER & AUTH
// ============================================

export interface User {
  id: string;
  access_code: string;
  email?: string;
  role: UserRole;
  is_active: boolean;
  is_suspended: boolean;
  telegram_id?: string;
  created_at: string;
  updated_at: string;
  last_login?: string;
}

export interface Admin {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
}

export interface Reseller {
  id: string;
  user_id: string;
  commission_rate: number;
  total_sales: number;
  total_revenue: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================
// PRODUCTS & ORDERS
// ============================================

export interface Product {
  id: string;
  name: string;
  description?: string;
  type: 'ADBOT_PLAN' | 'SESSION_PACK' | 'REPLACEMENT';
  plan_type?: 'STARTER' | 'ENTERPRISE' | null;
  price: number;
  sessions_count: number;
  posting_interval_minutes: number;
  posting_interval_seconds?: number;
  validity_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  product_id: string;
  status: OrderStatus;
  total_amount: number;
  payment_method?: string;
  reseller_id?: string;
  commission_amount?: number;
  created_at: string;
  updated_at: string;
}

// ============================================
// ADBOTS
// ============================================

export interface Adbot {
  id: string;
  user_id: string;
  order_id: string;
  product_id: string;
  status: AdbotStatus;
  post_link: string;
  target_groups: string[];
  sessions_assigned: number;
  posting_interval_minutes: number;
  valid_until: string;
  last_run?: string;
  messages_sent: number;
  groups_reached: number;
  created_at: string;
  updated_at: string;
}

// ============================================
// SESSIONS (TELEGRAM ACCOUNTS)
// ============================================

export interface Session {
  id: string;
  phone_number: string;
  api_id: string;
  api_hash: string;
  session_file_path: string;
  status: SessionStatus;
  assigned_to_adbot_id?: string;
  assigned_at?: string;
  banned_at?: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// PAYMENTS
// ============================================

export interface Payment {
  id: string;
  order_id: string;
  user_id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  payment_provider: string;
  provider_payment_id?: string;
  provider_response?: any;
  created_at: string;
  updated_at: string;
}

// ============================================
// NOTIFICATIONS
// ============================================

export interface Notification {
  id: string;
  user_id?: string;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

// ============================================
// ACTIVITY LOGS
// ============================================

export interface ActivityLog {
  id: string;
  user_id?: string;
  admin_id?: string;
  action: ActivityAction;
  entity_type: string;
  entity_id?: string;
  details?: any;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

// ============================================
// API RESPONSES
// ============================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ============================================
// DASHBOARD METRICS
// ============================================

export interface AdminDashboardMetrics {
  totalSales: {
    today: number;
    week: number;
    month: number;
    lifetime: number;
  };
  activeAdbots: number;
  expiredAdbots: number;
  totalUsers: number;
  totalResellers: number;
  revenueChart: {
    date: string;
    amount: number;
  }[];
  lowStockWarnings: {
    total: number;
    unused: number;
    assigned: number;
    banned: number;
  };
  failedAdbots: {
    id: string;
    user_id: string;
    error: string;
  }[];
  systemHealth: {
    database: 'healthy' | 'degraded' | 'down';
    pythonBackend: 'healthy' | 'degraded' | 'down';
    payments: 'healthy' | 'degraded' | 'down';
  };
}

export interface UserDashboardMetrics {
  activeAdbots: number;
  totalMessagesSent: number;
  totalGroupsReached: number;
  recentActivity: ActivityLog[];
  notifications: Notification[];
}

export interface ResellerDashboardMetrics {
  totalClients: number;
  activeSubscriptions: number;
  totalRevenue: number;
  commissionEarned: number;
  recentSales: Order[];
}


