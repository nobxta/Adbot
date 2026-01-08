"""
Logs Routes - Access AdBot logs
"""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from typing import Optional, Dict, Any
from pathlib import Path
import os
from datetime import datetime
from backend.api.core.auth import AuthDep

router = APIRouter()

def _get_logs_dir() -> Path:
    """Get AdBot logs directory"""
    base = Path(__file__).parent.parent.parent.parent  # Project root
    logs_dir = base / "backend" / "Adbot" / "logs"
    return logs_dir.absolute()

@router.get("/")
async def list_logs(
    limit: int = Query(10, ge=1, le=100),
    user: dict = AuthDep
) -> Dict[str, Any]:
    """List available log files"""
    try:
        logs_dir = _get_logs_dir()
        
        if not logs_dir.exists():
            return {"success": True, "logs": [], "count": 0}
        
        # Get all log files, sorted by modification time (newest first)
        log_files = []
        for log_file in sorted(logs_dir.glob("*.log"), key=lambda p: p.stat().st_mtime, reverse=True):
            stat = log_file.stat()
            log_files.append({
                "filename": log_file.name,
                "size": stat.st_size,
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "path": str(log_file.relative_to(logs_dir))
            })
        
        return {
            "success": True,
            "logs": log_files[:limit],
            "count": len(log_files)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/latest")
async def get_latest_log(
    lines: int = Query(100, ge=1, le=1000),
    user: dict = AuthDep
) -> Dict[str, Any]:
    """Get latest log file content (last N lines)"""
    try:
        logs_dir = _get_logs_dir()
        
        if not logs_dir.exists():
            return {"success": True, "log": "", "filename": None}
        
        # Find latest log file
        log_files = sorted(logs_dir.glob("*.log"), key=lambda p: p.stat().st_mtime, reverse=True)
        
        if not log_files:
            return {"success": True, "log": "", "filename": None}
        
        latest_log = log_files[0]
        
        # Read last N lines
        with open(latest_log, "r", encoding="utf-8", errors="ignore") as f:
            all_lines = f.readlines()
            last_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines
        
        return {
            "success": True,
            "log": "".join(last_lines),
            "filename": latest_log.name,
            "total_lines": len(all_lines),
            "returned_lines": len(last_lines)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{filename}")
async def get_log_file(
    filename: str,
    lines: Optional[int] = Query(None, ge=1, le=10000),
    user: dict = AuthDep
) -> Dict[str, Any]:
    """Get specific log file content"""
    try:
        logs_dir = _get_logs_dir()
        log_file = logs_dir / filename
        
        # Security: prevent directory traversal
        if not log_file.is_relative_to(logs_dir):
            raise HTTPException(status_code=403, detail="Invalid log file path")
        
        if not log_file.exists():
            raise HTTPException(status_code=404, detail="Log file not found")
        
        # Read file
        with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
            if lines:
                all_lines = f.readlines()
                content_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines
                content = "".join(content_lines)
            else:
                content = f.read()
        
        return {
            "success": True,
            "log": content,
            "filename": filename
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{filename}/download")
async def download_log_file(
    filename: str,
    user: dict = AuthDep
):
    """Download log file"""
    try:
        logs_dir = _get_logs_dir()
        log_file = logs_dir / filename
        
        # Security: prevent directory traversal
        if not log_file.is_relative_to(logs_dir):
            raise HTTPException(status_code=403, detail="Invalid log file path")
        
        if not log_file.exists():
            raise HTTPException(status_code=404, detail="Log file not found")
        
        def iterfile():
            with open(log_file, "rb") as f:
                yield from f
        
        return StreamingResponse(
            iterfile(),
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

