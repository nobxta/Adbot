"""
Session Manager - Handles session pool, assignment, and replacement
Sessions are exclusive per user
"""

import json
import shutil
from pathlib import Path
from typing import List, Dict, Optional, Set
from threading import Lock

SESSIONS_BASE = Path(__file__).parent.parent / "sessions"
UNUSED_DIR = SESSIONS_BASE / "unused"
ASSIGNED_DIR = SESSIONS_BASE / "assigned"
BANNED_DIR = SESSIONS_BASE / "banned"

session_lock = Lock()


def ensure_dirs():
    """Ensure session directories exist"""
    UNUSED_DIR.mkdir(parents=True, exist_ok=True)
    ASSIGNED_DIR.mkdir(parents=True, exist_ok=True)
    BANNED_DIR.mkdir(parents=True, exist_ok=True)


def get_unused_sessions() -> List[str]:
    """Get list of unused session filenames"""
    ensure_dirs()
    sessions = []
    for session_file in UNUSED_DIR.glob("*.session"):
        sessions.append(session_file.name)
    return sorted(sessions)


def get_assigned_sessions(user_id: str) -> List[str]:
    """Get list of assigned session filenames for a user"""
    ensure_dirs()
    user_dir = ASSIGNED_DIR / user_id
    if not user_dir.exists():
        return []
    
    sessions = []
    for session_file in user_dir.glob("*.session"):
        sessions.append(session_file.name)
    return sorted(sessions)


def get_banned_sessions() -> Set[str]:
    """Get set of banned session filenames"""
    ensure_dirs()
    banned = set()
    for session_file in BANNED_DIR.glob("*.session"):
        banned.add(session_file.name)
    return banned


def assign_sessions_to_user(user_id: str, num_sessions: int, existing_sessions: List[str] = None) -> List[str]:
    """
    Assign sessions from unused pool to user
    Returns: List of assigned session filenames
    """
    ensure_dirs()
    existing_sessions = existing_sessions or []
    
    # Get available unused sessions
    unused = get_unused_sessions()
    banned = get_banned_sessions()
    
    # Filter out banned sessions
    available = [s for s in unused if s not in banned]
    
    # Calculate how many we need
    already_assigned = len(existing_sessions)
    needed = max(0, num_sessions - already_assigned)
    
    if needed == 0:
        return existing_sessions
    
    # Assign new sessions
    assigned = existing_sessions.copy()
    user_dir = ASSIGNED_DIR / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    
    for session_file in available[:needed]:
        src = UNUSED_DIR / session_file
        dst = user_dir / session_file
        
        # Move session file
        if src.exists():
            shutil.move(str(src), str(dst))
            
            # Move journal file if exists
            journal_src = UNUSED_DIR / f"{session_file}-journal"
            journal_dst = user_dir / f"{session_file}-journal"
            if journal_src.exists():
                shutil.move(str(journal_src), str(journal_dst))
            
            assigned.append(session_file)
    
    return assigned


def unassign_sessions_from_user(user_id: str, session_filenames: List[str]) -> bool:
    """Move sessions from user back to unused pool"""
    ensure_dirs()
    user_dir = ASSIGNED_DIR / user_id
    
    if not user_dir.exists():
        return False
    
    moved = False
    for session_file in session_filenames:
        src = user_dir / session_file
        dst = UNUSED_DIR / session_file
        
        if src.exists():
            shutil.move(str(src), str(dst))
            
            # Move journal file if exists
            journal_src = user_dir / f"{session_file}-journal"
            journal_dst = UNUSED_DIR / f"{session_file}-journal"
            if journal_src.exists():
                shutil.move(str(journal_src), str(journal_dst))
            
            moved = True
    
    return moved


def ban_session(session_filename: str) -> bool:
    """Move session to banned directory"""
    ensure_dirs()
    
    # Check in unused
    src = UNUSED_DIR / session_filename
    if src.exists():
        dst = BANNED_DIR / session_filename
        shutil.move(str(src), str(dst))
        
        # Move journal if exists
        journal_src = UNUSED_DIR / f"{session_filename}-journal"
        journal_dst = BANNED_DIR / f"{session_filename}-journal"
        if journal_src.exists():
            shutil.move(str(journal_src), str(journal_dst))
        
        return True
    
    # Check in assigned (find which user)
    for user_dir in ASSIGNED_DIR.iterdir():
        if user_dir.is_dir():
            src = user_dir / session_filename
            if src.exists():
                dst = BANNED_DIR / session_filename
                shutil.move(str(src), str(dst))
                
                # Move journal if exists
                journal_src = user_dir / f"{session_filename}-journal"
                journal_dst = BANNED_DIR / f"{session_filename}-journal"
                if journal_src.exists():
                    shutil.move(str(journal_src), str(journal_dst))
                
                return True
    
    return False


def get_session_path(user_id: str, session_filename: str) -> Optional[Path]:
    """Get full path to a session file"""
    ensure_dirs()
    user_dir = ASSIGNED_DIR / user_id
    session_path = user_dir / session_filename
    
    if session_path.exists():
        return session_path
    
    return None


def replace_banned_session(user_id: str, banned_session: str) -> Optional[str]:
    """Replace a banned session with a new one from unused pool"""
    ensure_dirs()
    
    # Remove banned session from user's assigned
    user_dir = ASSIGNED_DIR / user_id
    banned_path = user_dir / banned_session
    if banned_path.exists():
        ban_session(banned_session)  # Move to banned
    
    # Get a replacement from unused pool
    unused = get_unused_sessions()
    banned_set = get_banned_sessions()
    available = [s for s in unused if s not in banned_set]
    
    if not available:
        return None
    
    # Assign replacement
    replacement = available[0]
    assigned = assign_sessions_to_user(user_id, 1, [])
    
    if assigned and replacement in assigned:
        return replacement
    
    return None

