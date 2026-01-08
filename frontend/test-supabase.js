// Quick diagnostic test for Supabase connection
// Run with: node test-supabase.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('\n🔍 Supabase Configuration Check\n');
console.log('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ Set' : '❌ Missing');
console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✅ Set' : '❌ Missing');

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  console.log('\n❌ Missing Supabase credentials in .env.local');
  console.log('\nYou need to create frontend/.env.local with:');
  console.log('NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co');
  console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key');
  console.log('SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
  process.exit(1);
}

async function testConnection() {
  console.log('\n🧪 Testing Supabase Connection...\n');

  // Test with service role key (admin)
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    // Test 1: Check if users table exists
    console.log('Test 1: Checking if users table exists...');
    const { data, error, count } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: false });

    if (error) {
      console.log('❌ Error accessing users table:', error.message);
      console.log('\n🔧 Fix: Run the SQL migration in Supabase dashboard');
      console.log('   File: frontend/supabase/schema.sql');
      return;
    }

    console.log(`✅ Users table exists with ${count} rows`);

    if (count === 0) {
      console.log('\n⚠️  Users table is empty!');
      console.log('🔧 Fix: The SQL migration was not run or failed to seed data');
      console.log('   Re-run the SQL from frontend/supabase/schema.sql');
      console.log('   Make sure you see the INSERT statements at the end');
      return;
    }

    // Test 2: Check for admin user
    console.log('\nTest 2: Looking for admin user with code ADMIN123...');
    const { data: adminUser, error: adminError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('access_code', 'ADMIN123')
      .single();

    if (adminError || !adminUser) {
      console.log('❌ Admin user not found');
      console.log('\n🔧 Fix: Insert admin user manually:');
      console.log(`
INSERT INTO users (email, role, access_code, license_key, plan_status)
VALUES ('admin@hqadz.com', 'admin', 'ADMIN123', 'ADMIN-LICENSE-KEY-001', 'active')
ON CONFLICT (access_code) DO NOTHING;
      `);
      return;
    }

    console.log('✅ Admin user found:', adminUser.email);
    console.log('   Role:', adminUser.role);
    console.log('   Access Code:', adminUser.access_code);

    console.log('\n✅ All tests passed! You should be able to log in now.');
    console.log('   Go to: http://localhost:3000/access');
    console.log('   Use code: ADMIN123');

  } catch (err) {
    console.log('❌ Unexpected error:', err.message);
  }
}

testConnection();






