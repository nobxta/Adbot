"""
Minimal HTTP API Wrapper for Python Telethon Adbot Engine
This provides a simple REST API for the Next.js frontend to control adbots.

NO DATABASE LOGIC
NO AUTH LOGIC
NO PAYMENT LOGIC
NO USER LOGIC

This is a DUMB EXECUTION ENGINE that only:
- Starts adbots
- Stops adbots
- Returns status
- Returns logs
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
import subprocess
import os
import json
import signal
from pathlib import Path
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="HQAdz Python Backend", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this to your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store running adbot processes
running_processes: Dict[str, subprocess.Popen] = {}

# Paths
BASE_DIR = Path(__file__).parent
SESSIONS_DIR = BASE_DIR / "sessions"
LOGS_DIR = BASE_DIR / "logs"
DATA_DIR = BASE_DIR / "data"
ADBOT_DIR = BASE_DIR / "Adbot"

# Ensure directories exist
SESSIONS_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)
DATA_DIR.mkdir(exist_ok=True)

# ============================================
# REQUEST/RESPONSE MODELS
# ============================================

class SessionConfig(BaseModel):
    phone_number: str
    api_id: str
    api_hash: str
    session_file_path: str

class AdbotConfig(BaseModel):
    adbot_id: str
    user_id: str
    post_link: str
    target_groups: List[str]
    posting_interval_minutes: int
    sessions: List[SessionConfig]

class StopRequest(BaseModel):
    adbot_id: str

class StatusResponse(BaseModel):
    adbot_id: str
    status: str  # 'running', 'stopped', 'error'
    messages_sent: int
    groups_reached: int
    last_run: Optional[str]
    error: Optional[str]

class LogsResponse(BaseModel):
    adbot_id: str
    logs: List[str]

# ============================================
# HELPER FUNCTIONS
# ============================================

def save_adbot_config(adbot_id: str, config: AdbotConfig):
    """Save adbot configuration to JSON file"""
    config_path = DATA_DIR / f"adbot_{adbot_id}.json"
    with open(config_path, 'w') as f:
        json.dump(config.dict(), f, indent=2)
    logger.info(f"Saved config for adbot {adbot_id}")

def load_adbot_config(adbot_id: str) -> Optional[Dict]:
    """Load adbot configuration from JSON file"""
    config_path = DATA_DIR / f"adbot_{adbot_id}.json"
    if config_path.exists():
        with open(config_path, 'r') as f:
            return json.load(f)
    return None

def get_adbot_stats(adbot_id: str) -> Dict:
    """Get adbot statistics from stats file"""
    stats_path = DATA_DIR / f"stats_{adbot_id}.json"
    if stats_path.exists():
        with open(stats_path, 'r') as f:
            return json.load(f)
    return {"messages_sent": 0, "groups_reached": 0, "last_run": None}

def get_adbot_logs(adbot_id: str, lines: int = 100) -> List[str]:
    """Get last N lines from adbot log file"""
    log_path = LOGS_DIR / f"adbot_{adbot_id}.log"
    if not log_path.exists():
        return []
    
    with open(log_path, 'r') as f:
        all_lines = f.readlines()
        return [line.strip() for line in all_lines[-lines:]]

# ============================================
# API ENDPOINTS
# ============================================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "HQAdz Python Backend",
        "running_adbots": len(running_processes)
    }

@app.post("/api/adbot/start")
async def start_adbot(config: AdbotConfig):
    """Start an adbot"""
    try:
        adbot_id = config.adbot_id
        
        # Check if already running
        if adbot_id in running_processes:
            process = running_processes[adbot_id]
            if process.poll() is None:  # Still running
                return {
                    "success": False,
                    "error": "Adbot is already running"
                }
            else:
                # Process died, remove it
                del running_processes[adbot_id]
        
        # Save configuration
        save_adbot_config(adbot_id, config)
        
        # Prepare environment for the adbot process
        env = os.environ.copy()
        env['ADBOT_ID'] = adbot_id
        env['POST_LINK'] = config.post_link
        env['POSTING_INTERVAL'] = str(config.posting_interval_minutes)
        env['TARGET_GROUPS'] = json.dumps(config.target_groups)
        
        # Create sessions config file
        sessions_config = []
        for session in config.sessions:
            sessions_config.append({
                "phone": session.phone_number,
                "api_id": session.api_id,
                "api_hash": session.api_hash,
                "session_file": session.session_file_path
            })
        
        sessions_config_path = DATA_DIR / f"sessions_{adbot_id}.json"
        with open(sessions_config_path, 'w') as f:
            json.dump(sessions_config, f, indent=2)
        
        # Start the adbot process
        # Assuming there's a main.py in Adbot folder that can be run with config
        log_file_path = LOGS_DIR / f"adbot_{adbot_id}.log"
        log_file = open(log_file_path, 'a')
        
        process = subprocess.Popen(
            ['python', str(ADBOT_DIR / 'main.py'), '--config', str(sessions_config_path)],
            stdout=log_file,
            stderr=log_file,
            env=env,
            cwd=str(ADBOT_DIR)
        )
        
        running_processes[adbot_id] = process
        
        logger.info(f"Started adbot {adbot_id} with PID {process.pid}")
        
        return {
            "success": True,
            "message": f"Adbot {adbot_id} started successfully",
            "pid": process.pid
        }
        
    except Exception as e:
        logger.error(f"Error starting adbot {config.adbot_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/adbot/stop")
async def stop_adbot(request: StopRequest):
    """Stop an adbot"""
    try:
        adbot_id = request.adbot_id
        
        if adbot_id not in running_processes:
            return {
                "success": False,
                "error": "Adbot is not running"
            }
        
        process = running_processes[adbot_id]
        
        # Try graceful shutdown first
        process.terminate()
        
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            # Force kill if graceful shutdown fails
            process.kill()
            process.wait()
        
        del running_processes[adbot_id]
        
        logger.info(f"Stopped adbot {adbot_id}")
        
        return {
            "success": True,
            "message": f"Adbot {adbot_id} stopped successfully"
        }
        
    except Exception as e:
        logger.error(f"Error stopping adbot {request.adbot_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/adbot/status/{adbot_id}")
async def get_adbot_status(adbot_id: str):
    """Get adbot status"""
    try:
        # Check if process is running
        is_running = False
        if adbot_id in running_processes:
            process = running_processes[adbot_id]
            if process.poll() is None:
                is_running = True
            else:
                # Process died, clean up
                del running_processes[adbot_id]
        
        # Get stats
        stats = get_adbot_stats(adbot_id)
        
        return {
            "success": True,
            "data": {
                "adbot_id": adbot_id,
                "status": "running" if is_running else "stopped",
                "messages_sent": stats.get("messages_sent", 0),
                "groups_reached": stats.get("groups_reached", 0),
                "last_run": stats.get("last_run"),
                "error": None
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting status for adbot {adbot_id}: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

@app.get("/api/adbot/logs/{adbot_id}")
async def get_logs(adbot_id: str, lines: int = 100):
    """Get adbot logs"""
    try:
        logs = get_adbot_logs(adbot_id, lines)
        
        return {
            "success": True,
            "data": {
                "adbot_id": adbot_id,
                "logs": logs
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting logs for adbot {adbot_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/adbot/sync")
async def sync_adbot_config(config: AdbotConfig):
    """Sync adbot configuration (update without restarting)"""
    try:
        adbot_id = config.adbot_id
        
        # Save updated configuration
        save_adbot_config(adbot_id, config)
        
        logger.info(f"Synced config for adbot {adbot_id}")
        
        return {
            "success": True,
            "message": f"Configuration synced for adbot {adbot_id}"
        }
        
    except Exception as e:
        logger.error(f"Error syncing config for adbot {config.adbot_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# STARTUP/SHUTDOWN
# ============================================

@app.on_event("startup")
async def startup_event():
    """Startup tasks"""
    logger.info("Python backend started")
    logger.info(f"Base directory: {BASE_DIR}")
    logger.info(f"Sessions directory: {SESSIONS_DIR}")
    logger.info(f"Logs directory: {LOGS_DIR}")
    logger.info(f"Data directory: {DATA_DIR}")

@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown tasks - stop all running adbots"""
    logger.info("Shutting down, stopping all adbots...")
    for adbot_id, process in running_processes.items():
        try:
            process.terminate()
            process.wait(timeout=5)
        except:
            process.kill()
        logger.info(f"Stopped adbot {adbot_id}")
    running_processes.clear()

# ============================================
# RUN SERVER
# ============================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")


