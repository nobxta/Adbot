"""
Data Manager - Reads/writes users.json and stats.json
Single source of truth for user runtime data
GLOBAL FILE LOCKING to prevent race conditions
"""

import json
import os
from pathlib import Path
from typing import Dict, Any, Optional, List
from threading import Lock
from datetime import datetime
import sys

# Import fcntl only on Unix systems
if sys.platform != "win32":
    import fcntl

DATA_DIR = Path(__file__).parent.parent / "data"
USERS_FILE = DATA_DIR / "users.json"
STATS_FILE = DATA_DIR / "stats.json"

# Global locks for thread-safe access
_users_lock = Lock()
_stats_lock = Lock()

# Read-only mode flag (set to True if data corruption detected)
_read_only_mode = False
_read_only_reason = None


def ensure_data_dir():
    """Ensure data directory exists"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)


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


def load_users() -> Dict[str, Dict[str, Any]]:
    """Load users.json with file locking"""
    global _read_only_mode, _read_only_reason
    
    ensure_data_dir()
    
    if not USERS_FILE.exists():
        return {}
    
    with _users_lock:
        try:
            with open(USERS_FILE, 'r', encoding='utf-8') as f:
                _file_lock(f)
                try:
                    data = json.load(f)
                    # Reset read-only mode on successful load
                    if _read_only_mode and _read_only_reason == "users":
                        _read_only_mode = False
                        _read_only_reason = None
                    return data.get("users", {})
                finally:
                    _file_unlock(f)
        except json.JSONDecodeError as e:
            # Data corruption detected
            _read_only_mode = True
            _read_only_reason = "users"
            print(f"ERROR: users.json corruption detected: {e}. Backend entering read-only mode.")
            return {}
        except Exception as e:
            print(f"ERROR: Failed to load users.json: {e}")
            return {}


def save_users(users: Dict[str, Dict[str, Any]]):
    """Save users.json with file locking"""
    global _read_only_mode
    
    if _read_only_mode:
        raise RuntimeError("Backend is in read-only mode due to data corruption. Cannot save users.json")
    
    ensure_data_dir()
    
    with _users_lock:
        try:
            # Write to temp file first, then rename (atomic on Unix)
            temp_file = USERS_FILE.with_suffix('.json.tmp')
            with open(temp_file, 'w', encoding='utf-8') as f:
                _file_lock(f)
                try:
                    json.dump({"users": users}, f, indent=2, ensure_ascii=False)
                    f.flush()
                    if sys.platform != "win32":
                        os.fsync(f.fileno())
                finally:
                    _file_unlock(f)
            
            # Atomic rename
            temp_file.replace(USERS_FILE)
        except Exception as e:
            print(f"Error saving users.json: {e}")
            if temp_file.exists():
                temp_file.unlink()
            raise


def load_stats() -> Dict[str, Dict[str, Any]]:
    """Load stats.json with file locking"""
    global _read_only_mode, _read_only_reason
    
    ensure_data_dir()
    
    if not STATS_FILE.exists():
        return {}
    
    with _stats_lock:
        try:
            with open(STATS_FILE, 'r', encoding='utf-8') as f:
                _file_lock(f)
                try:
                    data = json.load(f)
                    # Reset read-only mode on successful load (if it was stats-related)
                    if _read_only_mode and _read_only_reason == "stats":
                        _read_only_mode = False
                        _read_only_reason = None
                    return data.get("users", {})
                finally:
                    _file_unlock(f)
        except json.JSONDecodeError as e:
            # Data corruption detected (stats corruption doesn't block reads)
            print(f"WARNING: stats.json corruption detected: {e}. Stats will be empty.")
            return {}
        except Exception as e:
            print(f"WARNING: Failed to load stats.json: {e}")
            return {}


def save_stats(stats: Dict[str, Dict[str, Any]]):
    """Save stats.json with file locking"""
    ensure_data_dir()
    
    with _stats_lock:
        try:
            # Write to temp file first, then rename (atomic on Unix)
            temp_file = STATS_FILE.with_suffix('.json.tmp')
            with open(temp_file, 'w', encoding='utf-8') as f:
                _file_lock(f)
                try:
                    json.dump({"users": stats}, f, indent=2, ensure_ascii=False)
                    f.flush()
                    if sys.platform != "win32":
                        os.fsync(f.fileno())
                finally:
                    _file_unlock(f)
            
            # Atomic rename
            temp_file.replace(STATS_FILE)
        except Exception as e:
            print(f"Error saving stats.json: {e}")
            if temp_file.exists():
                temp_file.unlink()


def get_user_data(user_id: str) -> Optional[Dict[str, Any]]:
    """Get user data from users.json"""
    users = load_users()
    return users.get(user_id)


def update_user_data(user_id: str, updates: Dict[str, Any]):
    """Update user data in users.json (atomic)"""
    global _read_only_mode
    
    if _read_only_mode:
        raise RuntimeError("Backend is in read-only mode due to data corruption. Cannot update user data.")
    
    with _users_lock:
        users = load_users()
        
        if user_id not in users:
            users[user_id] = {
                "assigned_sessions": [],
                "api_pairs": [],
                "groups": [],
                "post_type": "link",
                "post_content": "",
                "bot_status": "stopped",
                "delay_between_posts": 5,
                "delay_between_cycles": 300,
            }
        
        users[user_id].update(updates)
        save_users(users)


def is_read_only_mode() -> bool:
    """Check if backend is in read-only mode"""
    return _read_only_mode


def get_read_only_reason() -> Optional[str]:
    """Get reason for read-only mode"""
    return _read_only_reason


def get_user_stats(user_id: str) -> Dict[str, Any]:
    """Get user stats from stats.json"""
    stats = load_stats()
    
    if user_id not in stats:
        return {
            "total_posts": 0,
            "total_success": 0,
            "total_failures": 0,
            "total_flood_waits": 0,
            "total_messages_sent": 0,
            "last_activity": None
        }
    
    return stats[user_id]


def update_user_stats(user_id: str, updates: Dict[str, Any]):
    """Update user stats in stats.json (atomic)"""
    with _stats_lock:
        stats = load_stats()
        
        if user_id not in stats:
            stats[user_id] = {
                "total_posts": 0,
                "total_success": 0,
                "total_failures": 0,
                "total_flood_waits": 0,
                "total_messages_sent": 0,
                "last_activity": None
            }
        
        stats[user_id].update(updates)
        stats[user_id]["last_activity"] = datetime.now().isoformat()
        save_stats(stats)


def get_active_users() -> List[str]:
    """Get list of user IDs with bot_status='running'"""
    users = load_users()
    active = []
    for user_id, user_data in users.items():
        if user_data.get("bot_status") == "running":
            active.append(user_id)
    return active
