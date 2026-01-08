"""
Admin Session Management - REAL FILE VERIFICATION
Source of truth: Physical .session files on VPS
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from typing import Dict, Any, List
from pathlib import Path
import os
import sys

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from api.core.auth import require_admin

router = APIRouter()

# Session directory - where physical .session files live
SESSIONS_DIR = Path(__file__).parent.parent.parent / "sessions"
SESSIONS_DIR.mkdir(exist_ok=True)


@router.post("/verify")
async def verify_session(
    body: Dict[str, str],
    admin: dict = Depends(require_admin)
) -> Dict[str, Any]:
    """
    Verify a session file exists and is valid
    This is the SOURCE OF TRUTH for stock availability
    
    Returns:
    - exists: file physically exists
    - readable: file can be opened
    - valid: file appears to be valid session
    - reason: detailed status
    """
    filename = body.get("filename")
    
    if not filename:
        raise HTTPException(status_code=400, detail="filename required")
    
    # Security: prevent directory traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        return {
            "exists": False,
            "readable": False,
            "valid": False,
            "reason": "invalid_filename"
        }
    
    file_path = SESSIONS_DIR / filename
    
    # Check 1: File exists
    if not file_path.exists():
        return {
            "exists": False,
            "readable": False,
            "valid": False,
            "reason": "missing"
        }
    
    # Check 2: File is readable
    try:
        with open(file_path, 'rb') as f:
            content = f.read(100)  # Read first 100 bytes
            
            # Check 3: File has content
            if len(content) == 0:
                return {
                    "exists": True,
                    "readable": True,
                    "valid": False,
                    "reason": "empty_file"
                }
    except Exception as e:
        return {
            "exists": True,
            "readable": False,
            "valid": False,
            "reason": f"unreadable: {str(e)}"
        }
    
    # Check 4: Attempt basic SQLite validation (sessions are SQLite DBs)
    try:
        import sqlite3
        conn = sqlite3.connect(str(file_path))
        cursor = conn.cursor()
        
        # Check if it's a valid SQLite database
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        conn.close()
        
        # Telethon sessions have specific tables
        table_names = [t[0] for t in tables]
        if 'sessions' not in table_names and 'entities' not in table_names:
            return {
                "exists": True,
                "readable": True,
                "valid": False,
                "reason": "corrupt_not_telethon_session"
            }
        
    except Exception as e:
        return {
            "exists": True,
            "readable": True,
            "valid": False,
            "reason": f"corrupt: {str(e)}"
        }
    
    # All checks passed
    return {
        "exists": True,
        "readable": True,
        "valid": True,
        "reason": "ok",
        "file_size": file_path.stat().st_size
    }


@router.post("/upload")
async def upload_session(
    file: UploadFile = File(...),
    admin: dict = Depends(require_admin)
) -> Dict[str, Any]:
    """
    Upload a REAL .session file to the VPS
    Performs verification before accepting
    
    Returns the verification result
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    # Security: validate filename
    if not file.filename.endswith(".session"):
        raise HTTPException(status_code=400, detail="Only .session files allowed")
    
    if ".." in file.filename or "/" in file.filename or "\\" in file.filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    # Extract phone number from filename (e.g., +123456789.session)
    filename = file.filename
    
    # Check if file already exists
    file_path = SESSIONS_DIR / filename
    if file_path.exists():
        raise HTTPException(
            status_code=409,
            detail=f"Session {filename} already exists. Delete it first or use a different phone number."
        )
    
    try:
        # Save the uploaded file
        contents = await file.read()
        
        if len(contents) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        
        # Write to disk
        with open(file_path, 'wb') as f:
            f.write(contents)
        
        # Immediately verify the uploaded file
        verification = await verify_session(
            {"filename": filename},
            admin=admin
        )
        
        if not verification["valid"]:
            # Verification failed - delete the file
            try:
                file_path.unlink()
            except:
                pass
            
            raise HTTPException(
                status_code=400,
                detail=f"Uploaded file failed verification: {verification['reason']}"
            )
        
        return {
            "success": True,
            "message": f"Session {filename} uploaded and verified successfully",
            "filename": filename,
            "verification": verification
        }
        
    except HTTPException:
        raise
    except Exception as e:
        # Clean up on error
        if file_path.exists():
            try:
                file_path.unlink()
            except:
                pass
        
        raise HTTPException(
            status_code=500,
            detail=f"Upload failed: {str(e)}"
        )


@router.get("/list")
async def list_sessions_on_disk(
    admin: dict = Depends(require_admin)
) -> Dict[str, Any]:
    """
    List all physical .session files on the VPS
    This shows what ACTUALLY exists, not just DB metadata
    """
    try:
        session_files = []
        
        for file_path in SESSIONS_DIR.glob("*.session"):
            try:
                stat = file_path.stat()
                session_files.append({
                    "filename": file_path.name,
                    "size": stat.st_size,
                    "modified": stat.st_mtime,
                })
            except Exception as e:
                session_files.append({
                    "filename": file_path.name,
                    "size": 0,
                    "error": str(e)
                })
        
        return {
            "success": True,
            "count": len(session_files),
            "sessions": session_files
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list sessions: {str(e)}"
        )


@router.delete("/{filename}")
async def delete_session(
    filename: str,
    admin: dict = Depends(require_admin)
) -> Dict[str, Any]:
    """
    Delete a physical session file from VPS
    WARNING: This is irreversible
    """
    # Security: validate filename
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    if not filename.endswith(".session"):
        raise HTTPException(status_code=400, detail="Only .session files can be deleted")
    
    file_path = SESSIONS_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Session file not found")
    
    try:
        file_path.unlink()
        
        return {
            "success": True,
            "message": f"Session {filename} deleted from VPS"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete session: {str(e)}"
        )

