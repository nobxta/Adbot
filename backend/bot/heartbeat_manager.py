"""
Heartbeat Manager - Source of Truth for Worker Status
Workers emit heartbeats, status is derived from heartbeat freshness
"""

import json
import os
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from threading import Lock
import sys

# Import fcntl only on Unix systems
if sys.platform != "win32":
    import fcntl

DATA_DIR = Path(__file__).parent.parent / "data"
HEARTBEATS_FILE = DATA_DIR / "heartbeats.json"

# Global lock for thread-safe access
_heartbeats_lock = Lock()

# Heartbeat TTL (seconds) - heartbeat older than this is considered stale
HEARTBEAT_TTL = int(os.getenv("HEARTBEAT_TTL", "30"))  # Default 30 seconds


def _file_lock(file_handle):
    """Acquire file lock (Unix) or no-op (Windows)"""
    if sys.platform != "win32":
        try:
            fcntl.flock(file_handle, fcntl.LOCK_EX)
        except:
            pass


def _file_unlock(file_handle):
    """Release file lock (Unix) or no-op (Windows)"""
    if sys.platform != "win32":
        try:
            fcntl.flock(file_handle, fcntl.LOCK_UN)
        except:
            pass


def ensure_data_dir():
    """Ensure data directory exists"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def emit_heartbeat(
    adbot_id: str,
    cycle_state: str = "idle",
    worker_pid: Optional[int] = None
) -> None:
    """
    Emit heartbeat for an adbot worker
    ONLY called by workers during execution
    cycle_state: "idle" | "running" | "sleeping"
    """
    ensure_data_dir()
    
    timestamp = datetime.now().isoformat()
    
    heartbeat = {
        "adbot_id": adbot_id,
        "timestamp": timestamp,
        "cycle_state": cycle_state,
    }
    
    if worker_pid is not None:
        heartbeat["worker_pid"] = worker_pid
    
    with _heartbeats_lock:
        try:
            # Load existing heartbeats
            heartbeats = {}
            if HEARTBEATS_FILE.exists():
                with open(HEARTBEATS_FILE, 'r', encoding='utf-8') as f:
                    _file_lock(f)
                    try:
                        data = json.load(f)
                        heartbeats = data.get("heartbeats", {})
                    finally:
                        _file_unlock(f)
            
            # Update heartbeat for this adbot
            heartbeats[adbot_id] = heartbeat
            
            # Write atomically (temp file + rename)
            temp_file = HEARTBEATS_FILE.with_suffix('.json.tmp')
            with open(temp_file, 'w', encoding='utf-8') as f:
                _file_lock(f)
                try:
                    json.dump({"heartbeats": heartbeats}, f, indent=2, ensure_ascii=False)
                    f.flush()
                    if sys.platform != "win32":
                        os.fsync(f.fileno())
                finally:
                    _file_unlock(f)
            
            # Atomic rename
            temp_file.replace(HEARTBEATS_FILE)
        except Exception as e:
            print(f"ERROR: Failed to emit heartbeat for {adbot_id}: {e}")


def clear_heartbeat(adbot_id: str) -> None:
    """
    Clear heartbeat for an adbot (when worker stops)
    """
    ensure_data_dir()
    
    with _heartbeats_lock:
        try:
            heartbeats = {}
            if HEARTBEATS_FILE.exists():
                with open(HEARTBEATS_FILE, 'r', encoding='utf-8') as f:
                    _file_lock(f)
                    try:
                        data = json.load(f)
                        heartbeats = data.get("heartbeats", {})
                    finally:
                        _file_unlock(f)
            
            # Remove heartbeat for this adbot
            if adbot_id in heartbeats:
                del heartbeats[adbot_id]
            
            # Write atomically
            temp_file = HEARTBEATS_FILE.with_suffix('.json.tmp')
            with open(temp_file, 'w', encoding='utf-8') as f:
                _file_lock(f)
                try:
                    json.dump({"heartbeats": heartbeats}, f, indent=2, ensure_ascii=False)
                    f.flush()
                    if sys.platform != "win32":
                        os.fsync(f.fileno())
                finally:
                    _file_unlock(f)
            
            temp_file.replace(HEARTBEATS_FILE)
        except Exception as e:
            print(f"ERROR: Failed to clear heartbeat for {adbot_id}: {e}")


def get_heartbeat(adbot_id: str) -> Optional[Dict[str, Any]]:
    """
    Get heartbeat for an adbot
    Returns None if no heartbeat exists
    """
    if not HEARTBEATS_FILE.exists():
        return None
    
    with _heartbeats_lock:
        try:
            with open(HEARTBEATS_FILE, 'r', encoding='utf-8') as f:
                _file_lock(f)
                try:
                    data = json.load(f)
                    heartbeats = data.get("heartbeats", {})
                    return heartbeats.get(adbot_id)
                finally:
                    _file_unlock(f)
        except Exception as e:
            print(f"ERROR: Failed to read heartbeat for {adbot_id}: {e}")
            return None


def is_heartbeat_fresh(heartbeat: Dict[str, Any], ttl: int = None) -> bool:
    """
    Check if heartbeat is fresh (within TTL)
    Returns True if heartbeat exists and is fresh, False otherwise
    """
    if not heartbeat:
        return False
    
    if ttl is None:
        ttl = HEARTBEAT_TTL
    
    try:
        timestamp_str = heartbeat.get("timestamp")
        if not timestamp_str:
            return False
        
        timestamp = datetime.fromisoformat(timestamp_str)
        now = datetime.now()
        age = (now - timestamp).total_seconds()
        
        return age < ttl
    except Exception as e:
        print(f"ERROR: Failed to check heartbeat freshness: {e}")
        return False


def get_status_from_heartbeat(adbot_id: str, intent_status: Optional[str] = None) -> Dict[str, Any]:
    """
    Derive runtime status from heartbeat (SOURCE OF TRUTH)
    
    Returns:
    {
        "status": "RUNNING" | "STOPPED" | "CRASHED",
        "heartbeat": {...} | None,
        "is_fresh": bool,
        "last_heartbeat": str | None,
        "cycle_state": str | None
    }
    
    Rules:
    - RUNNING: heartbeat exists AND is fresh
    - STOPPED: no heartbeat OR heartbeat stale (and intent is not RUNNING)
    - CRASHED: intent = RUNNING BUT heartbeat missing or stale
    """
    heartbeat = get_heartbeat(adbot_id)
    is_fresh = is_heartbeat_fresh(heartbeat) if heartbeat else False
    
    # Determine status
    if heartbeat and is_fresh:
        status = "RUNNING"
    elif intent_status == "RUNNING" or intent_status == "running":
        # Intent says RUNNING but heartbeat is missing or stale = CRASHED
        status = "CRASHED"
    else:
        # No heartbeat or stale, and intent is not RUNNING = STOPPED
        status = "STOPPED"
    
    return {
        "status": status,
        "heartbeat": heartbeat,
        "is_fresh": is_fresh,
        "last_heartbeat": heartbeat.get("timestamp") if heartbeat else None,
        "cycle_state": heartbeat.get("cycle_state") if heartbeat else None,
        "worker_pid": heartbeat.get("worker_pid") if heartbeat else None
    }

