/**
 * JWT Generation for Python Backend
 * Generates JWT tokens for authenticating with Python backend API
 * Includes plan_status and plan_limits for backend enforcement
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET: string = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || 'your-secret-key';

/**
 * Generate JWT token for Python backend
 * @param userId - User ID from Supabase
 * @param planStatus - User's plan status ('active' | 'inactive' | 'expired')
 * @param planLimits - Plan limits (e.g., max_sessions)
 * @param expiresIn - Token expiration time (default: 30 days)
 * @returns JWT token string
 */
export function generateBackendJWT(
  userId: string,
  planStatus?: string,
  planLimits?: { max_sessions?: number },
  expiresIn: string = '30d'
): string {
  const payload: any = {
    user_id: userId,
    iat: Math.floor(Date.now() / 1000),
  };

  // Include plan_status for backend enforcement (prevents expired users from running bots)
  if (planStatus) {
    payload.plan_status = planStatus;
  }

  // Include plan_limits for future use (e.g., session limits per plan)
  if (planLimits) {
    payload.plan_limits = planLimits;
  }

  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn,
  } as jwt.SignOptions);
}

