// ============================================
// AUTHENTICATION UTILITIES
// ============================================

import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { User, UserRole } from '@/types';

// ============================================
// JWT UTILITIES
// ============================================

// IMPORTANT: JWT_SECRET must be the same value used when tokens were created
// If you get "signature verification failed", the secret has changed or doesn't match
const JWT_SECRET_STRING = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_REFRESH_SECRET_STRING = process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key-change-in-production';

// Convert to Uint8Array for jose library
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);
const JWT_REFRESH_SECRET = new TextEncoder().encode(JWT_REFRESH_SECRET_STRING);

// Debug: Log first few chars of secret (for debugging only - remove in production)
if (process.env.NODE_ENV === 'development') {
  console.log('JWT_SECRET loaded, length:', JWT_SECRET_STRING.length, 'first 10 chars:', JWT_SECRET_STRING.substring(0, 10));
}

// ============================================
// JWT PAYLOAD (BOT-CENTRIC)
// ============================================
export interface JWTPayload {
  botId: string; // PRIMARY: Bot ID (replaces userId)
  userId?: string; // OPTIONAL: User ID (for admin/CRM purposes only)
  role: UserRole; // Role determined from bot plan or admin status
  email?: string; // Optional email from owner_user
  iat?: number;
  exp?: number;
}

// ============================================
// LEGACY JWT PAYLOAD (DEPRECATED)
// ============================================
// Kept for backward compatibility during migration
export interface LegacyJWTPayload {
  userId: string;
  role: UserRole;
  email?: string;
  iat?: number;
  exp?: number;
}

/**
 * Generate access token (short-lived)
 * Uses botId as primary identifier
 */
export async function generateAccessToken(payload: JWTPayload | LegacyJWTPayload): Promise<string> {
  // Handle legacy payload (userId) by converting to botId
  const normalizedPayload: JWTPayload = 'botId' in payload 
    ? payload as JWTPayload
    : {
        botId: (payload as LegacyJWTPayload).userId, // Convert userId to botId
        userId: (payload as LegacyJWTPayload).userId, // Keep for backward compatibility
        role: payload.role,
        email: payload.email,
      };
  
  // 30 days expiration for both development and production
  return await new SignJWT({ ...normalizedPayload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d') // 30 days
    .sign(JWT_SECRET);
}

/**
 * Generate refresh token (long-lived)
 * Uses botId as primary identifier
 */
export async function generateRefreshToken(payload: JWTPayload | LegacyJWTPayload): Promise<string> {
  // Handle legacy payload (userId) by converting to botId
  const normalizedPayload: JWTPayload = 'botId' in payload 
    ? payload as JWTPayload
    : {
        botId: (payload as LegacyJWTPayload).userId, // Convert userId to botId
        userId: (payload as LegacyJWTPayload).userId, // Keep for backward compatibility
        role: payload.role,
        email: payload.email,
      };
  
  return await new SignJWT({ ...normalizedPayload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('60d') // 60 days (longer than access token for safety)
    .sign(JWT_REFRESH_SECRET);
}

/**
 * Verify access token
 * Returns JWTPayload with botId (handles legacy userId tokens)
 */
export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  try {
    if (!token || token.trim().length === 0) {
      throw new Error('Token is empty');
    }
    
    // Always use current JWT_SECRET from environment (in case it changed)
    const currentSecret = new TextEncoder().encode(
      process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production'
    );
    
    const { payload } = await jwtVerify(token, currentSecret);
    const rawPayload = payload as any;
    
    // Validate required fields
    if (!rawPayload.role) {
      throw new Error('Token missing role');
    }
    
    // Handle legacy tokens (userId) by converting to botId
    if (rawPayload.userId && !rawPayload.botId) {
      return {
        botId: rawPayload.userId,
        userId: rawPayload.userId,
        role: rawPayload.role,
        email: rawPayload.email,
        iat: rawPayload.iat,
        exp: rawPayload.exp,
      } as JWTPayload;
    }
    
    // Ensure botId exists
    if (!rawPayload.botId) {
      throw new Error('Token missing botId');
    }
    
    return rawPayload as JWTPayload;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // More specific error for signature verification
    if (errorMessage.includes('signature') || errorMessage.includes('verification')) {
      console.error('JWT signature verification failed.');
      console.error('This means the JWT_SECRET used to create the token is different from the one used to verify it.');
      console.error('Solution:');
      console.error('1. Make sure JWT_SECRET is set in your .env.local file');
      console.error('2. Restart your Next.js development server');
      console.error('3. Log out and log back in to get a new token');
      throw new Error('Token signature verification failed. The JWT_SECRET may have changed. Please log out and log back in.');
    }
    
    console.error('Token verification failed:', errorMessage);
    throw new Error(`Invalid or expired token: ${errorMessage}`);
  }
}

/**
 * Verify refresh token
 * Returns JWTPayload with botId (handles legacy userId tokens)
 */
export async function verifyRefreshToken(token: string): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, JWT_REFRESH_SECRET);
    const rawPayload = payload as any;
    
    // Handle legacy tokens (userId) by converting to botId
    if (rawPayload.userId && !rawPayload.botId) {
      return {
        botId: rawPayload.userId,
        userId: rawPayload.userId,
        role: rawPayload.role,
        email: rawPayload.email,
        iat: rawPayload.iat,
        exp: rawPayload.exp,
      } as JWTPayload;
    }
    
    return rawPayload as JWTPayload;
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
}

/**
 * Decode token without verification (for debugging)
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload;
  } catch {
    return null;
  }
}

// ============================================
// PASSWORD UTILITIES
// ============================================

/**
 * Hash password
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

/**
 * Compare password with hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

/**
 * Generate random access code (for users)
 */
export function generateAccessCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
    if ((i + 1) % 4 === 0 && i < 11) code += '-';
  }
  return code;
}

// ============================================
// PERMISSION UTILITIES
// ============================================

export const PERMISSIONS = {
  // Admin permissions
  MANAGE_USERS: ['ADMIN'],
  MANAGE_RESELLERS: ['ADMIN'],
  MANAGE_PRODUCTS: ['ADMIN'],
  MANAGE_STOCK: ['ADMIN'],
  VIEW_ALL_ADBOTS: ['ADMIN'],
  SEND_NOTIFICATIONS: ['ADMIN'],
  VIEW_SYSTEM_HEALTH: ['ADMIN'],
  
  // Reseller permissions
  CREATE_CLIENT_ADBOT: ['ADMIN', 'RESELLER'],
  VIEW_CLIENTS: ['ADMIN', 'RESELLER'],
  VIEW_COMMISSION: ['ADMIN', 'RESELLER'],
  
  // User permissions
  MANAGE_OWN_ADBOTS: ['ADMIN', 'USER', 'RESELLER'],
  VIEW_OWN_ORDERS: ['ADMIN', 'USER', 'RESELLER'],
  VIEW_OWN_PROFILE: ['ADMIN', 'USER', 'RESELLER'],
} as const;

/**
 * Check if user has permission
 */
export function hasPermission(userRole: UserRole, permission: keyof typeof PERMISSIONS): boolean {
  const allowedRoles = PERMISSIONS[permission];
  return allowedRoles.includes(userRole as any);
}

/**
 * Check if user has any of the specified roles
 */
export function hasRole(userRole: UserRole, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(userRole);
}

// ============================================
// MIDDLEWARE HELPERS
// ============================================

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Get bot/user from request (for Next.js API routes)
 * Returns JWTPayload with botId (primary) and optional userId
 */
export async function getUserFromRequest(request: Request): Promise<JWTPayload | null> {
  const authHeader = request.headers.get('Authorization');
  const token = extractTokenFromHeader(authHeader);
  
  if (!token) {
    console.log('No token found in Authorization header');
    return null;
  }
  
  // Trim whitespace from token
  const trimmedToken = token.trim();
  
  if (!trimmedToken) {
    console.log('Token is empty after trimming');
    return null;
  }
  
  try {
    return await verifyAccessToken(trimmedToken);
  } catch (error) {
    console.error('Token verification failed in getUserFromRequest:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Get botId from request (primary identifier)
 */
export async function getBotIdFromRequest(request: Request): Promise<string | null> {
  const payload = await getUserFromRequest(request);
  return payload?.botId || null;
}

/**
 * Require authentication (throws if not authenticated)
 */
export async function requireAuth(request: Request): Promise<JWTPayload> {
  const user = await getUserFromRequest(request);
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

/**
 * Require specific role (throws if not authorized)
 * Works with botId-based authentication
 */
export async function requireRole(request: Request, allowedRoles: UserRole[]): Promise<JWTPayload> {
  const user = await requireAuth(request);
  // Normalize roles to uppercase for comparison
  const userRoleUpper = user.role.toUpperCase() as UserRole;
  const allowedRolesUpper = allowedRoles.map(r => r.toUpperCase() as UserRole);
  
  // Debug logging - always log to help diagnose issues
  if (process.env.NODE_ENV === 'development') {
    console.log('[requireRole] Role check:', {
      userRole: user.role,
      userRoleUpper,
      allowedRoles,
      allowedRolesUpper,
      hasRole: hasRole(userRoleUpper, allowedRolesUpper),
      botId: user.botId,
      userId: user.userId,
    });
  }
  
  if (!hasRole(userRoleUpper, allowedRolesUpper)) {
    const errorDetails = {
      userRole: user.role,
      userRoleUpper,
      allowedRoles,
      allowedRolesUpper,
      botId: user.botId,
      userId: user.userId,
    };
    console.error('[requireRole] Forbidden: User role does not match allowed roles', errorDetails);
    throw new Error('Forbidden');
  }
  return user;
}

/**
 * Get botId from JWT payload (primary identifier)
 */
export function getBotIdFromPayload(payload: JWTPayload): string {
  return payload.botId;
}

/**
 * Get userId from JWT payload (optional, for CRM/admin purposes)
 */
export function getUserIdFromPayload(payload: JWTPayload): string | undefined {
  return payload.userId;
}

/**
 * Generate a token for backend-to-backend communication
 * This creates a simple token for calling the Python backend
 */
export async function generateToken(payload: {
  userId: string;
  role?: string;
  plan_status?: string;
  plan_limits?: Record<string, any>;
}): Promise<string> {
  return await new SignJWT({
    user_id: payload.userId,
    sub: payload.userId,
    role: payload.role || 'USER',
    plan_status: payload.plan_status || 'active',
    plan_limits: payload.plan_limits || {},
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h') // Short-lived for backend calls
    .sign(JWT_SECRET);
}


