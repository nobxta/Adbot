"""
Health API - Backend health check
"""

from fastapi import APIRouter
from typing import Dict, Any

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from bot.scheduler import get_scheduler
from bot.data_manager import get_active_users, is_read_only_mode, get_read_only_reason

router = APIRouter()


@router.get("/")
async def health() -> Dict[str, Any]:
    """Health check endpoint (works even in read-only mode)"""
    scheduler = get_scheduler()
    active_users = get_active_users()
    read_only = is_read_only_mode()
    read_only_reason = get_read_only_reason() if read_only else None
    
    return {
        "status": "healthy" if not read_only else "read_only",
        "scheduler_running": scheduler.running if scheduler else False,
        "active_users": len(active_users),
        "read_only_mode": read_only,
        "read_only_reason": read_only_reason
    }

