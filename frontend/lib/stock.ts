// ============================================
// STOCK MANAGEMENT UTILITIES
// ============================================

import {
  createSession,
  listUnusedSessions,
  assignSessionToAdbot,
  getSessionStockOverview,
  createNotification,
} from './queries';
import { Session } from '@/types';

const LOW_STOCK_THRESHOLD = parseInt(process.env.LOW_STOCK_THRESHOLD || '10');

/**
 * Upload session to stock
 */
export async function uploadSession(data: {
  phone_number: string;
  api_id: string;
  api_hash: string;
  session_file_path: string;
}): Promise<Session> {
  try {
    const session = await createSession(data);
    console.log(`Session uploaded: ${session.phone_number}`);
    return session;
  } catch (error) {
    console.error('Error uploading session:', error);
    throw error;
  }
}

/**
 * Auto-assign sessions to an Adbot
 * Returns partial results if not enough sessions available
 * Does NOT throw - returns assigned sessions and missing count
 */
export async function autoAssignSessions(adbotId: string, count: number): Promise<{
  assigned: Session[];
  assignedCount: number;
  requiredCount: number;
  missingCount: number;
  hasEnough: boolean;
}> {
  try {
    // Get unused sessions
    const unusedSessions = await listUnusedSessions(count);
    const availableCount = unusedSessions.length;

    // Assign available sessions (even if less than required)
    const assignedSessions: Session[] = [];
    const sessionsToAssign = Math.min(availableCount, count);
    
    for (let i = 0; i < sessionsToAssign; i++) {
      try {
        const session = await assignSessionToAdbot(unusedSessions[i].id, adbotId);
        assignedSessions.push(session);
      } catch (assignError) {
        console.error(`Failed to assign session ${unusedSessions[i]?.id}:`, assignError);
        // Continue with next session
      }
    }

    const assignedCount = assignedSessions.length;
    const missingCount = Math.max(0, count - assignedCount);
    const hasEnough = missingCount === 0;

    console.log(`Session assignment result for adbot ${adbotId}:`, {
      required: count,
      available: availableCount,
      assigned: assignedCount,
      missing: missingCount,
      hasEnough,
    });

    // Check if stock is low after assignment
    await checkLowStock();

    return {
      assigned: assignedSessions,
      assignedCount,
      requiredCount: count,
      missingCount,
      hasEnough,
    };
  } catch (error) {
    console.error('Error auto-assigning sessions:', error);
    // Return empty result instead of throwing
    return {
      assigned: [],
      assignedCount: 0,
      requiredCount: count,
      missingCount: count,
      hasEnough: false,
    };
  }
}

/**
 * Check if stock is low and send alert
 */
export async function checkLowStock(): Promise<void> {
  try {
    const overview = await getSessionStockOverview();

    if (overview.unused <= LOW_STOCK_THRESHOLD) {
      // Send notification to admins
      await createNotification({
        type: 'WARNING',
        title: 'Low Stock Alert',
        message: `Session stock is low! Only ${overview.unused} unused sessions remaining.`,
      });

      console.warn(`Low stock alert: ${overview.unused} unused sessions`);
    }
  } catch (error) {
    console.error('Error checking low stock:', error);
  }
}

/**
 * Get stock overview
 */
export async function getStockOverview() {
  return await getSessionStockOverview();
}

/**
 * Check if there's enough stock for a purchase
 */
export async function hasEnoughStock(requiredCount: number): Promise<boolean> {
  try {
    const overview = await getSessionStockOverview();
    return overview.unused >= requiredCount;
  } catch (error) {
    console.error('Error checking stock availability:', error);
    return false;
  }
}

/**
 * Block purchase if stock is too low
 */
export async function validateStockForPurchase(requiredCount: number): Promise<void> {
  const hasStock = await hasEnoughStock(requiredCount);
  
  if (!hasStock) {
    const overview = await getSessionStockOverview();
    throw new Error(
      `Insufficient stock. Required: ${requiredCount}, Available: ${overview.unused}. Please contact support.`
    );
  }
}


