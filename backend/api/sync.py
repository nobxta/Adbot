"""
Sync API - Full dashboard state for frontend
Returns EVERYTHING frontend needs in ONE call
"""

from fastapi import APIRouter, HTTPException, Header, Depends
from typing import Dict, Any, Optional
import jwt
import os

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from bot.data_manager import get_user_data, get_user_stats
from bot.scheduler import get_scheduler
from bot.log_saver import get_user_logs

router = APIRouter()

JWT_SECRET = os.getenv("JWT_SECRET", "your-secret-key")


def verify_auth_and_get_user_id(authorization: Optional[str] = Header(None)) -> str:
    """
    Verify JWT and extract user_id
    NEVER trust X-User-Id header - only extract from JWT
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")
    
    try:
        token = authorization.replace("Bearer ", "")
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("user_id") or payload.get("sub")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: no user_id")
        
        return str(user_id)
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")


@router.get("/state")
async def get_sync_state(
    user_id: str = Depends(verify_auth_and_get_user_id)
) -> Dict[str, Any]:
    """Get full dashboard state for user (EVERYTHING in ONE call)"""
    user_data = get_user_data(user_id)
    
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")
    
    stats = get_user_stats(user_id)
    scheduler = get_scheduler()
    is_active = scheduler.is_user_active(user_id) if scheduler else False
    
    # Get latest logs (last 100 lines)
    logs = get_user_logs(user_id, lines=100)
    
    # Calculate success rate
    total_posts = stats.get("total_posts", 0)
    total_success = stats.get("total_success", 0)
    success_rate = (total_success / total_posts * 100) if total_posts > 0 else 0.0
    
    return {
        "success": True,
        "user": {
            "bot_status": user_data.get("bot_status", "stopped"),
            "is_active": is_active,
            "assigned_sessions": user_data.get("assigned_sessions", []),
            "api_pairs": user_data.get("api_pairs", []),
            "groups": user_data.get("groups", []),
            "post_type": user_data.get("post_type", "link"),
            "post_content": user_data.get("post_content", ""),
            "delay_between_posts": user_data.get("delay_between_posts", 5),
            "delay_between_cycles": user_data.get("delay_between_cycles", 300),
            "banned_sessions": user_data.get("banned_sessions", []),
        },
        "stats": {
            "total_posts": total_posts,
            "total_success": total_success,
            "total_failures": stats.get("total_failures", 0),
            "total_flood_waits": stats.get("total_flood_waits", 0),
            "total_messages_sent": stats.get("total_messages_sent", 0),
            "success_rate": round(success_rate, 2),
            "last_activity": stats.get("last_activity"),
        },
        "logs": logs
    }
