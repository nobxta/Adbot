"""
Bot Control Routes - Start, Stop, Restart, Status
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
from backend.api.core.process_manager import ProcessManager
from backend.api.core.auth import AuthDep

router = APIRouter()
process_manager = ProcessManager()

@router.post("/start")
async def start_bot(user: dict = AuthDep) -> Dict[str, Any]:
    """Start AdBot process"""
    result = process_manager.start()
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    
    return {
        "success": True,
        "message": result["message"],
        "pid": result["pid"],
        "status": "running"
    }

@router.post("/stop")
async def stop_bot(user: dict = AuthDep) -> Dict[str, Any]:
    """Stop AdBot process"""
    result = process_manager.stop()
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    
    return {
        "success": True,
        "message": result["message"],
        "status": "stopped"
    }

@router.post("/restart")
async def restart_bot(user: dict = AuthDep) -> Dict[str, Any]:
    """Restart AdBot process"""
    result = process_manager.restart()
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    
    return {
        "success": True,
        "message": "AdBot restarted successfully",
        "pid": result.get("pid"),
        "status": "running" if result["success"] else "stopped"
    }

@router.get("/status")
async def get_bot_status(user: dict = AuthDep) -> Dict[str, Any]:
    """Get AdBot status"""
    status = process_manager.get_status()
    return {
        "success": True,
        **status
    }

@router.get("/health")
async def bot_health() -> Dict[str, Any]:
    """Check bot health (public endpoint, no auth required)"""
    return {
        "running": process_manager.is_running(),
        "pid": process_manager.get_pid()
    }

