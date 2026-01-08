"""
Sessions Routes - Manage AdBot Telegram sessions
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
from pathlib import Path
import os
from backend.api.core.auth import AuthDep

router = APIRouter()

def _get_sessions_dir() -> Path:
    """Get AdBot sessions directory"""
    base = Path(__file__).parent.parent.parent.parent  # Project root
    sessions_dir = base / "backend" / "Adbot" / "sessions"
    return sessions_dir.absolute()

@router.get("/")
async def list_sessions(user: dict = AuthDep) -> Dict[str, Any]:
    """List all session files"""
    try:
        sessions_dir = _get_sessions_dir()
        
        if not sessions_dir.exists():
            return {"success": True, "sessions": [], "count": 0}
        
        sessions = []
        for session_file in sorted(sessions_dir.glob("*.session")):
            stat = session_file.stat()
            sessions.append({
                "filename": session_file.name,
                "size": stat.st_size,
                "modified": stat.st_mtime,
                "path": str(session_file.relative_to(sessions_dir))
            })
        
        return {"success": True, "sessions": sessions, "count": len(sessions)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{filename}")
async def remove_session(filename: str, user: dict = AuthDep) -> Dict[str, Any]:
    """Remove a session file"""
    try:
        sessions_dir = _get_sessions_dir()
        session_file = sessions_dir / filename
        
        # Security: prevent directory traversal
        if not session_file.is_relative_to(sessions_dir):
            raise HTTPException(status_code=403, detail="Invalid session file path")
        
        # Only allow .session files
        if not filename.endswith(".session"):
            raise HTTPException(status_code=400, detail="Only .session files can be removed")
        
        if not session_file.exists():
            raise HTTPException(status_code=404, detail="Session file not found")
        
        # Remove session file and journal if exists
        session_file.unlink()
        journal_file = session_file.with_suffix(".session-journal")
        if journal_file.exists():
            journal_file.unlink()
        
        return {"success": True, "message": f"Session {filename} removed"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status")
async def get_sessions_status(user: dict = AuthDep) -> Dict[str, Any]:
    """Get sessions status (from stats.json)"""
    try:
        # Read stats.json to get session status
        base = Path(__file__).parent.parent.parent.parent  # Project root
        stats_file = base / "backend" / "Adbot" / "stats.json"
        
        if not stats_file.exists():
            return {"success": True, "sessions": []}
        
        import json
        with open(stats_file, "r", encoding="utf-8") as f:
            stats = json.load(f)
        
        accounts = stats.get("accounts", {})
        
        sessions_status = []
        for account_num, account_data in accounts.items():
            sessions_status.append({
                "account_num": account_num,
                "banned": account_data.get("banned", False),
                "frozen": account_data.get("frozen", False),
                "success": account_data.get("success", 0),
                "failures": account_data.get("failures", 0),
                "last_activity": account_data.get("last_activity"),
                "last_error": account_data.get("last_error")
            })
        
        return {"success": True, "sessions": sessions_status}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

