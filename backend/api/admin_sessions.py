"""
Admin Session Management API
Handles session file upload, listing, verification, and status tracking
Sessions stored in /sessions/unused, /sessions/assigned, /sessions/banned, /sessions/frozen
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Body
from typing import Dict, Any, List
from pathlib import Path
import shutil
import sqlite3
import zipfile
import tempfile
import asyncio

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from api.admin_auth import require_admin
from bot.session_manager import (
    UNUSED_DIR, ASSIGNED_DIR, BANNED_DIR, 
    get_unused_sessions, get_banned_sessions, ensure_dirs,
    assign_sessions_to_user, unassign_sessions_from_user
)

# Import SESSIONS_BASE directly from session_manager module
from bot import session_manager
SESSIONS_BASE = session_manager.SESSIONS_BASE

router = APIRouter()

# Ensure directories exist
ensure_dirs()

FROZEN_DIR = SESSIONS_BASE / "frozen"
FROZEN_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/list")
async def list_sessions(
    admin: dict = Depends(require_admin)
) -> Dict[str, Any]:
    """
    List all sessions with file counts (source of truth from filesystem)
    Returns physical file counts, not database counts
    """
    ensure_dirs()
    
    # Count files in each directory (source of truth)
    unused_count = len(list(UNUSED_DIR.glob("*.session")))
    banned_count = len(list(BANNED_DIR.glob("*.session")))
    frozen_count = len(list(FROZEN_DIR.glob("*.session")))
    
    # Count assigned sessions (in user subdirectories)
    assigned_count = 0
    assigned_sessions = []
    if ASSIGNED_DIR.exists():
        for user_dir in ASSIGNED_DIR.iterdir():
            if user_dir.is_dir():
                user_sessions = list(user_dir.glob("*.session"))
                assigned_count += len(user_sessions)
                for session_file in user_sessions:
                    assigned_sessions.append({
                        "filename": session_file.name,
                        "user_id": user_dir.name,
                        "path": str(session_file)
                    })
    
    total_count = unused_count + assigned_count + banned_count + frozen_count
    
    return {
        "success": True,
        "counts": {
            "total": total_count,
            "unused": unused_count,
            "assigned": assigned_count,
            "banned": banned_count,
            "frozen": frozen_count,
        },
        "sessions": {
            "unused": sorted([f.name for f in UNUSED_DIR.glob("*.session")]),
            "assigned": assigned_sessions,
            "banned": sorted([f.name for f in BANNED_DIR.glob("*.session")]),
            "frozen": sorted([f.name for f in FROZEN_DIR.glob("*.session")]),
        }
    }


@router.post("/assign")
async def assign_session(
    body: Dict[str, Any] = Body(...),
    admin: dict = Depends(require_admin)
) -> Dict[str, Any]:
    """
    Move session file from unused to assigned folder
    This is called by frontend when assigning sessions to adbots
    """
    filename = body.get("filename")
    user_id = body.get("user_id")
    
    if not filename or not user_id:
        raise HTTPException(status_code=400, detail="filename and user_id are required")
    
    # Security: prevent path traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    ensure_dirs()
    
    # Check if file exists in unused
    src = UNUSED_DIR / filename
    if not src.exists():
        raise HTTPException(status_code=404, detail=f"Session file {filename} not found in unused folder")
    
    # Move to assigned folder
    user_dir = ASSIGNED_DIR / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    dst = user_dir / filename
    
    try:
        # Move session file
        shutil.move(str(src), str(dst))
        
        # Move journal file if exists
        journal_src = UNUSED_DIR / f"{filename}-journal"
        journal_dst = user_dir / f"{filename}-journal"
        if journal_src.exists():
            shutil.move(str(journal_src), str(journal_dst))
        
        return {
            "success": True,
            "message": f"Session {filename} moved to assigned folder for user {user_id}",
            "filename": filename,
            "user_id": user_id,
            "path": str(dst)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to move session file: {str(e)}")


@router.post("/unassign")
async def unassign_session(
    body: Dict[str, Any] = Body(...),
    admin: dict = Depends(require_admin)
) -> Dict[str, Any]:
    """
    Move session file from assigned back to unused folder
    This is called when revoking sessions (bot deletion, expiry, etc.)
    """
    filename = body.get("filename")
    user_id = body.get("user_id")
    
    if not filename or not user_id:
        raise HTTPException(status_code=400, detail="filename and user_id are required")
    
    # Security: prevent path traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    ensure_dirs()
    
    # Check if file exists in assigned folder
    user_dir = ASSIGNED_DIR / user_id
    src = user_dir / filename
    
    if not src.exists():
        raise HTTPException(status_code=404, detail=f"Session file {filename} not found in assigned folder for user {user_id}")
    
    # Move back to unused
    dst = UNUSED_DIR / filename
    
    try:
        # Move session file
        shutil.move(str(src), str(dst))
        
        # Move journal file if exists
        journal_src = user_dir / f"{filename}-journal"
        journal_dst = UNUSED_DIR / f"{filename}-journal"
        if journal_src.exists():
            shutil.move(str(journal_src), str(journal_dst))
        
        # Clean up empty user directory
        try:
            if user_dir.exists() and not any(user_dir.iterdir()):
                user_dir.rmdir()
        except:
            pass  # Ignore errors when removing directory
        
        return {
            "success": True,
            "message": f"Session {filename} moved back to unused folder",
            "filename": filename,
            "user_id": user_id,
            "path": str(dst)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to move session file: {str(e)}")


@router.post("/verify")
async def verify_session(
    body: Dict[str, Any] = Body(...),
    admin: dict = Depends(require_admin)
) -> Dict[str, Any]:
    """
    Verify session file exists and is valid
    """
    filename = body.get("filename")
    
    if not filename:
        raise HTTPException(status_code=400, detail="filename is required")
    
    # Security: prevent path traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    ensure_dirs()
    
    # Check in unused
    if (UNUSED_DIR / filename).exists():
        return {
            "success": True,
            "valid": True,
            "exists": True,
            "location": "unused",
            "filename": filename
        }
    
    # Check in assigned
    for user_dir in ASSIGNED_DIR.iterdir():
        if user_dir.is_dir() and (user_dir / filename).exists():
            return {
                "success": True,
                "valid": True,
                "exists": True,
                "location": "assigned",
                "user_id": user_dir.name,
                "filename": filename
            }
    
    # Check in banned
    if (BANNED_DIR / filename).exists():
        return {
            "success": True,
            "valid": False,
            "exists": True,
            "location": "banned",
            "filename": filename,
            "reason": "Session is banned"
        }
    
    # Check in frozen
    if (FROZEN_DIR / filename).exists():
        return {
            "success": True,
            "valid": False,
            "exists": True,
            "location": "frozen",
            "filename": filename,
            "reason": "Session is frozen"
        }
    
    # Not found
    return {
        "success": True,
        "valid": False,
        "exists": False,
        "location": "unknown",
        "filename": filename,
        "reason": "File not found"
    }


@router.post("/health-check")
async def health_check_sessions(
    body: Dict[str, Any] = Body(...),
    admin: dict = Depends(require_admin)
) -> Dict[str, Any]:
    """
    Check health status of sessions using Telegram spam bot
    Returns: banned, unauthorized, active, frozen, limited
    """
    session_filenames = body.get("session_filenames", [])
    
    if not session_filenames:
        return {
            "success": True,
            "results": {},
            "message": "No sessions provided"
        }
    
    results = {}
    
    # This would integrate with Telegram spam bot API
    # For now, we'll check file status and return mock health data
    # In production, this would call the spam bot service
    
    for filename in session_filenames:
        if ".." in filename or "/" in filename or "\\" in filename:
            continue
        
        # Check file location
        status = "unknown"
        if (UNUSED_DIR / filename).exists():
            status = "unused"
        elif (BANNED_DIR / filename).exists():
            status = "banned"
        elif (FROZEN_DIR / filename).exists():
            status = "frozen"
        else:
            # Check in assigned
            for user_dir in ASSIGNED_DIR.iterdir():
                if user_dir.is_dir() and (user_dir / filename).exists():
                    status = "assigned"
                    break
        
        # TODO: Integrate with Telegram spam bot API to get actual health status
        # For now, return based on file location
        health_status = "active"
        if status == "banned":
            health_status = "banned"
        elif status == "frozen":
            health_status = "frozen"
        
        results[filename] = {
            "status": health_status,  # banned, unauthorized, active, frozen, limited
            "location": status,
            "checked_at": None  # Would be timestamp from spam bot
        }
    
    return {
        "success": True,
        "results": results
    }
