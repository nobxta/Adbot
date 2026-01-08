-- HQAdz SaaS Complete Database Schema
-- PostgreSQL with Supabase
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE user_role AS ENUM ('ADMIN', 'USER', 'RESELLER');
CREATE TYPE product_type AS ENUM ('ADBOT_PLAN', 'SESSION_PACK', 'REPLACEMENT_PACK');
CREATE TYPE plan_type AS ENUM ('STARTER', 'ENTERPRISE');
CREATE TYPE order_status AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PENDING_STOCK');
CREATE TYPE payment_status AS ENUM ('WAITING', 'CONFIRMING', 'PAID', 'FINISHED', 'FAILED', 'EXPIRED');
CREATE TYPE adbot_status AS ENUM ('RUNNING', 'STOPPED', 'EXPIRED', 'FAILED');
CREATE TYPE session_status AS ENUM ('UNUSED', 'ASSIGNED', 'BANNED', 'EXPIRED');
CREATE TYPE notification_type AS ENUM ('SYSTEM', 'ALERT', 'PROMO');

-- ============================================
-- CORE TABLES
-- ============================================

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  role user_role NOT NULL DEFAULT 'USER',
  access_code TEXT UNIQUE NOT NULL,
  license_key TEXT UNIQUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  
  suspended_at TIMESTAMPTZ,
  suspended_reason TEXT
);

-- Admins table (extends users)
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permissions JSONB DEFAULT '[]',
  can_manage_resellers BOOLEAN DEFAULT false,
  can_manage_stock BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Resellers table (extends users)
CREATE TABLE resellers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  commission_rate DECIMAL(5,2) DEFAULT 0.50, -- 0.50 = 50%
  total_sales INTEGER DEFAULT 0,
  total_revenue DECIMAL(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  parent_reseller_id UUID REFERENCES resellers(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type product_type NOT NULL,
  plan_type plan_type,
  sessions_count INTEGER NOT NULL,
  posting_interval_seconds INTEGER NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  is_active BOOLEAN DEFAULT true,
  validity_days INTEGER NOT NULL,
  description TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders table
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reseller_id UUID REFERENCES resellers(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES products(id),
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  status order_status DEFAULT 'PENDING',
  payment_method TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Adbots table
CREATE TABLE adbots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  status adbot_status DEFAULT 'STOPPED',
  validity_start TIMESTAMPTZ,
  validity_end TIMESTAMPTZ,
  sessions_assigned JSONB DEFAULT '[]',
  post_link TEXT,
  groups JSONB DEFAULT '[]',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity TIMESTAMPTZ,
  
  -- Statistics
  messages_sent INTEGER DEFAULT 0,
  groups_reached INTEGER DEFAULT 0,
  uptime_seconds INTEGER DEFAULT 0
);

-- Sessions table (Stock Management)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_id TEXT NOT NULL,
  api_hash TEXT NOT NULL,
  session_file_path TEXT NOT NULL,
  phone_number TEXT,
  status session_status DEFAULT 'UNUSED',
  assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_adbot_id UUID REFERENCES adbots(id) ON DELETE SET NULL,
  
  assigned_at TIMESTAMPTZ,
  banned_at TIMESTAMPTZ,
  banned_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments table
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_id TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  status payment_status DEFAULT 'WAITING',
  
  payment_address TEXT,
  payment_amount TEXT,
  payment_currency TEXT,
  actually_paid TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Notifications table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type notification_type DEFAULT 'SYSTEM',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity logs table
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Users indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_access_code ON users(access_code);
CREATE INDEX idx_users_license_key ON users(license_key);
CREATE INDEX idx_users_role ON users(role);

-- Admins indexes
CREATE INDEX idx_admins_user_id ON admins(user_id);

-- Resellers indexes
CREATE INDEX idx_resellers_user_id ON resellers(user_id);
CREATE INDEX idx_resellers_is_active ON resellers(is_active);
CREATE INDEX idx_resellers_parent_reseller_id ON resellers(parent_reseller_id);

-- Products indexes
CREATE INDEX idx_products_type ON products(type);
CREATE INDEX idx_products_plan_type ON products(plan_type);
CREATE INDEX idx_products_is_active ON products(is_active);

-- Orders indexes
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_reseller_id ON orders(reseller_id);
CREATE INDEX idx_orders_product_id ON orders(product_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- Adbots indexes
CREATE INDEX idx_adbots_user_id ON adbots(user_id);
CREATE INDEX idx_adbots_order_id ON adbots(order_id);
CREATE INDEX idx_adbots_product_id ON adbots(product_id);
CREATE INDEX idx_adbots_status ON adbots(status);
CREATE INDEX idx_adbots_validity_end ON adbots(validity_end);

-- Sessions indexes
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_assigned_to_user_id ON sessions(assigned_to_user_id);
CREATE INDEX idx_sessions_assigned_to_adbot_id ON sessions(assigned_to_adbot_id);
CREATE INDEX idx_sessions_api_id ON sessions(api_id);

-- Payments indexes
CREATE INDEX idx_payments_payment_id ON payments(payment_id);
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);

-- Notifications indexes
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- Activity logs indexes
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_action ON activity_logs(action);
CREATE INDEX idx_activity_logs_resource_type ON activity_logs(resource_type);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at);

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admins_updated_at BEFORE UPDATE ON admins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resellers_updated_at BEFORE UPDATE ON resellers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_adbots_updated_at BEFORE UPDATE ON adbots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE resellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE adbots ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Note: API will use service role key to bypass RLS
-- These policies are for direct client access (if needed)

-- Users: Can read own data, admins can read all
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (
    auth.uid()::text = id::text OR 
    EXISTS (SELECT 1 FROM users WHERE users.id::text = auth.uid()::text AND users.role = 'ADMIN')
  );

-- Users: Can update own data (except role)
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid()::text = id::text);

-- Orders: Users can read own orders, admins can read all
CREATE POLICY "Users can read own orders" ON orders
  FOR SELECT USING (
    auth.uid()::text = user_id::text OR
    EXISTS (SELECT 1 FROM users WHERE users.id::text = auth.uid()::text AND users.role = 'ADMIN')
  );

-- Adbots: Users can read own adbots, admins can read all
CREATE POLICY "Users can read own adbots" ON adbots
  FOR SELECT USING (
    auth.uid()::text = user_id::text OR
    EXISTS (SELECT 1 FROM users WHERE users.id::text = auth.uid()::text AND users.role = 'ADMIN')
  );

-- Adbots: Users can update own adbots
CREATE POLICY "Users can update own adbots" ON adbots
  FOR UPDATE USING (auth.uid()::text = user_id::text);

-- Payments: Users can read own payments, admins can read all
CREATE POLICY "Users can read own payments" ON payments
  FOR SELECT USING (
    auth.uid()::text = user_id::text OR
    EXISTS (SELECT 1 FROM users WHERE users.id::text = auth.uid()::text AND users.role = 'ADMIN')
  );

-- Notifications: Users can read own notifications
CREATE POLICY "Users can read own notifications" ON notifications
  FOR SELECT USING (
    auth.uid()::text = user_id::text OR 
    user_id IS NULL OR
    EXISTS (SELECT 1 FROM users WHERE users.id::text = auth.uid()::text AND users.role = 'ADMIN')
  );

-- Products: Everyone can read active products
CREATE POLICY "Everyone can read active products" ON products
  FOR SELECT USING (is_active = true);

-- ============================================
-- SEED DATA
-- ============================================

-- Insert default admin user
INSERT INTO users (email, role, access_code, license_key)
VALUES ('admin@hqadz.com', 'ADMIN', 'ADMIN-2024-CHANGE-THIS', 'ADMIN-LICENSE-001')
ON CONFLICT (access_code) DO NOTHING;

-- Create admin record for the admin user
INSERT INTO admins (user_id, can_manage_resellers, can_manage_stock, permissions)
SELECT id, true, true, '["*"]'::jsonb
FROM users 
WHERE email = 'admin@hqadz.com'
ON CONFLICT (user_id) DO NOTHING;

-- Insert sample products (Starter Plans)
INSERT INTO products (name, type, plan_type, sessions_count, posting_interval_seconds, price, validity_days, description)
VALUES 
  ('Starter Basic', 'ADBOT_PLAN', 'STARTER', 1, 1800, 20.00, 30, '1 Account, 30-Minute Interval'),
  ('Starter Standard', 'ADBOT_PLAN', 'STARTER', 2, 1200, 40.00, 30, '2 Accounts, 20-Minute Interval'),
  ('Starter Premium', 'ADBOT_PLAN', 'STARTER', 3, 900, 80.00, 30, '3 Accounts, 15-Minute Interval'),
  ('Starter Diamond', 'ADBOT_PLAN', 'STARTER', 6, 600, 160.00, 30, '6 Accounts, 10-Minute Interval'),
  ('Enterprise Basic', 'ADBOT_PLAN', 'ENTERPRISE', 3, 900, 199.00, 30, '3 Accounts, 15-Minute Interval'),
  ('Enterprise Pro', 'ADBOT_PLAN', 'ENTERPRISE', 7, 420, 450.00, 30, '7 Accounts, 7-Minute Interval'),
  ('Enterprise Elite', 'ADBOT_PLAN', 'ENTERPRISE', 15, 120, 899.00, 30, '15 Accounts, 2-Minute Interval')
ON CONFLICT DO NOTHING;

-- Insert sample session pack products
INSERT INTO products (name, type, plan_type, sessions_count, posting_interval_seconds, price, validity_days, description)
VALUES 
  ('Session Pack - 5 Sessions', 'SESSION_PACK', NULL, 5, 0, 50.00, 365, 'Add 5 extra sessions to your account'),
  ('Session Pack - 10 Sessions', 'SESSION_PACK', NULL, 10, 0, 90.00, 365, 'Add 10 extra sessions to your account'),
  ('Replacement Pack - 3 Sessions', 'REPLACEMENT_PACK', NULL, 3, 0, 30.00, 30, 'Replace 3 banned sessions')
ON CONFLICT DO NOTHING;

-- ============================================
-- VIEWS FOR ANALYTICS
-- ============================================

-- View: Active adbots count per user
CREATE OR REPLACE VIEW user_active_adbots AS
SELECT 
  user_id,
  COUNT(*) as active_adbots_count
FROM adbots
WHERE status = 'RUNNING'
GROUP BY user_id;

-- View: Revenue by product
CREATE OR REPLACE VIEW revenue_by_product AS
SELECT 
  p.id as product_id,
  p.name as product_name,
  p.type as product_type,
  COUNT(o.id) as total_orders,
  SUM(o.amount) as total_revenue
FROM products p
LEFT JOIN orders o ON o.product_id = p.id AND o.status = 'PAID'
GROUP BY p.id, p.name, p.type;

-- View: Stock availability
CREATE OR REPLACE VIEW stock_availability AS
SELECT 
  status,
  COUNT(*) as count
FROM sessions
GROUP BY status;

-- View: User statistics
CREATE OR REPLACE VIEW user_statistics AS
SELECT 
  u.id as user_id,
  u.email,
  u.role,
  COUNT(DISTINCT o.id) as total_orders,
  SUM(CASE WHEN o.status = 'PAID' THEN o.amount ELSE 0 END) as total_spent,
  COUNT(DISTINCT a.id) as total_adbots,
  COUNT(DISTINCT CASE WHEN a.status = 'RUNNING' THEN a.id END) as active_adbots
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
LEFT JOIN adbots a ON a.user_id = u.id
GROUP BY u.id, u.email, u.role;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function: Get available stock count
CREATE OR REPLACE FUNCTION get_available_stock_count()
RETURNS INTEGER AS $$
BEGIN
  RETURN (SELECT COUNT(*) FROM sessions WHERE status = 'UNUSED');
END;
$$ LANGUAGE plpgsql;

-- Function: Check if stock is sufficient for order
CREATE OR REPLACE FUNCTION check_stock_availability(required_sessions INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (SELECT COUNT(*) FROM sessions WHERE status = 'UNUSED') >= required_sessions;
END;
$$ LANGUAGE plpgsql;

-- Function: Auto-assign sessions to adbot
CREATE OR REPLACE FUNCTION auto_assign_sessions(
  p_adbot_id UUID,
  p_required_sessions INTEGER
)
RETURNS JSONB AS $$
DECLARE
  v_session_ids UUID[];
  v_session_id UUID;
  v_assigned_sessions JSONB := '[]'::jsonb;
BEGIN
  -- Check if enough sessions available
  IF NOT check_stock_availability(p_required_sessions) THEN
    RAISE EXCEPTION 'Insufficient stock: % sessions required', p_required_sessions;
  END IF;
  
  -- Get available sessions
  SELECT ARRAY_AGG(id)
  INTO v_session_ids
  FROM (
    SELECT id 
    FROM sessions 
    WHERE status = 'UNUSED' 
    ORDER BY created_at 
    LIMIT p_required_sessions
  ) s;
  
  -- Assign each session
  FOREACH v_session_id IN ARRAY v_session_ids
  LOOP
    UPDATE sessions
    SET 
      status = 'ASSIGNED',
      assigned_to_adbot_id = p_adbot_id,
      assigned_to_user_id = (SELECT user_id FROM adbots WHERE id = p_adbot_id),
      assigned_at = NOW()
    WHERE id = v_session_id;
    
    v_assigned_sessions := v_assigned_sessions || jsonb_build_object('session_id', v_session_id);
  END LOOP;
  
  -- Update adbot with assigned sessions
  UPDATE adbots
  SET sessions_assigned = v_assigned_sessions
  WHERE id = p_adbot_id;
  
  RETURN v_assigned_sessions;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE users IS 'Core users table - supports ADMIN, USER, and RESELLER roles';
COMMENT ON TABLE admins IS 'Admin-specific data and permissions';
COMMENT ON TABLE resellers IS 'Reseller accounts with commission tracking';
COMMENT ON TABLE products IS 'Products catalog - Adbot plans, session packs, replacement packs';
COMMENT ON TABLE orders IS 'Order records with payment tracking';
COMMENT ON TABLE adbots IS 'Active adbot instances with configuration and statistics';
COMMENT ON TABLE sessions IS 'Telegram session stock management';
COMMENT ON TABLE payments IS 'Payment records from NowPayments';
COMMENT ON TABLE notifications IS 'User notifications and broadcasts';
COMMENT ON TABLE activity_logs IS 'Audit trail for user actions';

