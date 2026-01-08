/**
 * Python Backend API Client
 * Proxies requests to Python backend with JWT authentication
 * Includes plan_status in JWT for backend enforcement
 */

const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';

import { generateBackendJWT } from './backend-jwt';
import { getUserById } from './db';

/**
 * Make authenticated request to Python backend
 * Fetches user plan status to include in JWT for backend enforcement
 */
async function fetchBackend(
  endpoint: string,
  options: RequestInit = {},
  userId: string
): Promise<any> {
  // Fetch user plan status for JWT claims (enables backend plan enforcement)
  let planStatus: string | undefined;
  let planLimits: { max_sessions?: number } | undefined;
  
  try {
    const user = await getUserById(userId);
    if (user) {
      planStatus = user.plan_status || undefined;
      // Set plan limits based on plan type (default: 1 session, can be extended)
      planLimits = {
        max_sessions: user.plan_type === 'enterprise' ? 3 : 1,
      };
    }
  } catch (error) {
    // If user lookup fails, proceed without plan info (backend will handle)
    console.warn('Failed to fetch user plan status for JWT:', error);
  }

  const token = generateBackendJWT(userId, planStatus, planLimits);

  const response = await fetch(`${BACKEND_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Backend request failed' }));
    throw new Error(error.detail || `Backend request failed: ${response.statusText}`);
  }

  return response.json();
}

export const backendApi = {
  /**
   * Register user in Python backend (idempotent)
   * Includes plan_status and plan_limits for scheduler expiration checks
   */
  registerUser: async (userId: string, email?: string) => {
    // Fetch user plan info to include in registration
    let planStatus: string | undefined;
    let planLimits: { max_sessions?: number } | undefined;
    
    try {
      const user = await getUserById(userId);
      if (user) {
        planStatus = user.plan_status || undefined;
        planLimits = {
          max_sessions: user.plan_type === 'enterprise' ? 3 : 1,
        };
      }
    } catch (error) {
      console.warn('Failed to fetch user plan info for registration:', error);
    }

    return fetchBackend(
      '/api/bot/register-user',
      {
        method: 'POST',
        body: JSON.stringify({ 
          email,
          plan_status: planStatus,
          plan_limits: planLimits,
        }),
      },
      userId
    );
  },

  /**
   * Start bot for user
   */
  startBot: async (userId: string) =>
    fetchBackend('/api/bot/start', { method: 'POST' }, userId),

  /**
   * Stop bot for user
   */
  stopBot: async (userId: string) =>
    fetchBackend('/api/bot/stop', { method: 'POST' }, userId),

  /**
   * Update post content for user
   */
  updatePost: async (userId: string, postType: 'link' | 'text', postContent: string) =>
    fetchBackend(
      '/api/bot/update-post',
      {
        method: 'POST',
        body: JSON.stringify({ post_type: postType, post_content: postContent }),
      },
      userId
    ),

  /**
   * Update groups list for user
   */
  updateGroups: async (userId: string, groups: string[]) =>
    fetchBackend(
      '/api/bot/update-groups',
      {
        method: 'POST',
        body: JSON.stringify({ groups }),
      },
      userId
    ),

  /**
   * Get complete bot state for user
   */
  getState: async (userId: string) =>
    fetchBackend('/api/bot/state', { method: 'GET' }, userId),
};

