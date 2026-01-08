import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createProduct } from '@/lib/queries';
import { supabase } from '@/lib/supabase';

/**
 * POST /api/admin/products/seed
 * Seed the database with default plans
 */
export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ['ADMIN']);

    // Check if products already exist
    const { data: existingProducts } = await supabase
      .from('products')
      .select('id, name')
      .eq('type', 'ADBOT_PLAN');

    if (existingProducts && existingProducts.length > 0) {
      return NextResponse.json({
        success: false,
        message: 'Products already exist. Use the admin panel to edit them.',
        existing_count: existingProducts.length,
      });
    }

    // Starter Plans
    const starterPlans = [
      {
        name: 'Bronze',
        description: 'For Solo Sellers & New Users',
        type: 'ADBOT_PLAN',
        plan_type: 'STARTER',
        price: 30,
        sessions_count: 1,
        posting_interval_minutes: 60, // 1 hour
        posting_interval_seconds: 3600,
        validity_days: 30,
        is_active: true,
      },
      {
        name: 'Silver',
        description: 'For Solo Sellers & New Users',
        type: 'ADBOT_PLAN',
        plan_type: 'STARTER',
        price: 55,
        sessions_count: 2,
        posting_interval_minutes: 30,
        posting_interval_seconds: 1800,
        validity_days: 30,
        is_active: true,
      },
      {
        name: 'Gold',
        description: 'For Solo Sellers & New Users',
        type: 'ADBOT_PLAN',
        plan_type: 'STARTER',
        price: 80,
        sessions_count: 3,
        posting_interval_minutes: 20,
        posting_interval_seconds: 1200,
        validity_days: 30,
        is_active: true,
      },
      {
        name: 'Diamond',
        description: 'For Solo Sellers & New Users',
        type: 'ADBOT_PLAN',
        plan_type: 'STARTER',
        price: 160,
        sessions_count: 6,
        posting_interval_minutes: 10,
        posting_interval_seconds: 600,
        validity_days: 30,
        is_active: true,
      },
    ];

    // Enterprise Plans
    const enterprisePlans = [
      {
        name: 'Basic',
        description: 'For High-Volume Marketing',
        type: 'ADBOT_PLAN',
        plan_type: 'ENTERPRISE',
        price: 199, // Monthly price (default)
        price_weekly: 50, // Weekly price (stored in description or separate field)
        sessions_count: 3,
        posting_interval_minutes: 15,
        posting_interval_seconds: 900,
        validity_days: 30,
        is_active: true,
      },
      {
        name: 'Pro',
        description: 'For High-Volume Marketing',
        type: 'ADBOT_PLAN',
        plan_type: 'ENTERPRISE',
        price: 450, // Monthly price (default)
        price_weekly: 150,
        sessions_count: 7,
        posting_interval_minutes: 7,
        posting_interval_seconds: 420,
        validity_days: 30,
        is_active: true,
      },
      {
        name: 'Elite',
        description: 'For High-Volume Marketing',
        type: 'ADBOT_PLAN',
        plan_type: 'ENTERPRISE',
        price: 899, // Monthly price (default)
        price_weekly: 320,
        sessions_count: 15,
        posting_interval_minutes: 2,
        posting_interval_seconds: 120,
        validity_days: 30,
        is_active: true,
      },
    ];

    const allPlans = [...starterPlans, ...enterprisePlans];
    const createdProducts = [];

    for (const plan of allPlans) {
      try {
        // Store weekly price in description for enterprise plans
        let description = plan.description;
        if (plan.price_weekly) {
          description += ` | Weekly: $${plan.price_weekly}`;
        }

        // Insert product with all fields including plan_type
        const { data: product, error: productError } = await supabase
          .from('products')
          .insert([{
            name: plan.name,
            description,
            type: plan.type,
            plan_type: plan.plan_type,
            price: plan.price,
            sessions_count: plan.sessions_count,
            posting_interval_minutes: plan.posting_interval_minutes,
            posting_interval_seconds: plan.posting_interval_seconds,
            validity_days: plan.validity_days,
            is_active: plan.is_active,
          }])
          .select()
          .single();

        if (productError) {
          throw productError;
        }

        createdProducts.push(product);
      } catch (error) {
        console.error(`Error creating product ${plan.name}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Created ${createdProducts.length} products`,
      data: createdProducts,
    });

  } catch (error) {
    console.error('Error seeding products:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

