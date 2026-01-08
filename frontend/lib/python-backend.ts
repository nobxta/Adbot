// ============================================
// PYTHON BACKEND SERVICE CLIENT
// ============================================
// This file handles communication with the Python Telethon backend

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

export interface PythonBackendResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AdbotConfig {
  adbot_id: string;
  user_id: string;
  post_link: string;
  target_groups: string[];
  posting_interval_minutes: number;
  sessions: {
    phone_number: string;
    api_id: string;
    api_hash: string;
    session_file_path: string;
  }[];
}

export interface AdbotStatus {
  adbot_id: string;
  status: 'running' | 'stopped' | 'error';
  messages_sent: number;
  groups_reached: number;
  last_run?: string;
  error?: string;
}

export interface AdbotLogs {
  adbot_id: string;
  logs: string[];
}

/**
 * Start an Adbot on the Python backend
 * Note: The Python backend uses /api/bot/start endpoint
 */
export async function startAdbot(config: AdbotConfig, authToken?: string): Promise<PythonBackendResponse> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Add auth token if provided
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${PYTHON_BACKEND_URL}/api/bot/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `HTTP error! status: ${response.status}` }));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error starting adbot:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start adbot',
    };
  }
}

/**
 * Stop an Adbot on the Python backend
 * Note: The Python backend uses /api/bot/stop endpoint
 */
export async function stopAdbot(adbotId: string, authToken?: string): Promise<PythonBackendResponse> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Add auth token if provided
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${PYTHON_BACKEND_URL}/api/bot/stop`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ adbot_id: adbotId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `HTTP error! status: ${response.status}` }));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error stopping adbot:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop adbot',
    };
  }
}

/**
 * Get Adbot status from Python backend
 * Note: The Python backend uses /api/bot/status endpoint
 */
export async function getAdbotStatus(adbotId: string, authToken?: string): Promise<PythonBackendResponse<AdbotStatus>> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${PYTHON_BACKEND_URL}/api/bot/status/${adbotId}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `HTTP error! status: ${response.status}` }));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting adbot status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get adbot status',
    };
  }
}

/**
 * Get Adbot logs from Python backend
 * Note: The Python backend uses /api/bot/logs endpoint
 */
export async function getAdbotLogs(adbotId: string, lines: number = 100, authToken?: string): Promise<PythonBackendResponse<AdbotLogs>> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${PYTHON_BACKEND_URL}/api/bot/logs/${adbotId}?lines=${lines}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `HTTP error! status: ${response.status}` }));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting adbot logs:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get adbot logs',
    };
  }
}

/**
 * Check Python backend health
 */
export async function checkPythonBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${PYTHON_BACKEND_URL}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Python backend health check failed:', error);
    return false;
  }
}

/**
 * Sync Adbot configuration with Python backend
 * Note: The Python backend uses /api/sync/state endpoint
 */
export async function syncAdbotConfig(config: AdbotConfig, authToken?: string): Promise<PythonBackendResponse> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${PYTHON_BACKEND_URL}/api/sync/state`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `HTTP error! status: ${response.status}` }));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error syncing adbot config:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync adbot config',
    };
  }
}

/**
 * Register user in Python backend (idempotent - safe to call multiple times)
 * This must be called before starting a bot for the first time
 */
export async function registerUserInBackend(authToken: string, planStatus?: string, planLimits?: Record<string, any>): Promise<PythonBackendResponse> {
  try {
    const response = await fetch(`${PYTHON_BACKEND_URL}/api/bot/register-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        plan_status: planStatus || 'active',
        plan_limits: planLimits || {},
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `HTTP error! status: ${response.status}` }));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error registering user in backend:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to register user in backend',
    };
  }
}

/**
 * Sync execution_mode to Python backend user_data
 * CRITICAL: This must be called before starting a bot to ensure execution_mode is set
 */
export async function syncExecutionMode(userId: string, executionMode: 'starter' | 'enterprise', authToken: string): Promise<PythonBackendResponse> {
  try {
    // Use the update-state endpoint or create a dedicated endpoint
    // For now, we'll use a direct API call to update user_data
    const response = await fetch(`${PYTHON_BACKEND_URL}/api/bot/update-execution-mode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        execution_mode: executionMode,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `HTTP error! status: ${response.status}` }));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error syncing execution_mode:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync execution_mode',
    };
  }
}


