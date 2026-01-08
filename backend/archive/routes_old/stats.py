"""
Statistics Routes - Access AdBot stats.json
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any
from pathlib import Path
import json
from backend.api.core.auth import AuthDep

router = APIRouter()

def _get_stats_file() -> Path:
    """Get AdBot stats.json file"""
    base = Path(__file__).parent.parent.parent.parent  # Project root
    stats_file = base / "backend" / "Adbot" / "stats.json"
    return stats_file.absolute()

@router.get("/")
async def get_stats(user: dict = AuthDep) -> Dict[str, Any]:
    """Get full statistics"""
    try:
        stats_file = _get_stats_file()
        
        if not stats_file.exists():
            return {
                "success": True,
                "stats": {
                    "bot_start_time": None,
                    "bot_stop_time": None,
                    "uptime_start": None,
                    "total_uptime_seconds": 0,
                    "accounts": {},
                    "groups": {},
                    "total_posts": 0,
                    "total_success": 0,
                    "total_failures": 0,
                    "total_flood_waits": 0,
                    "total_messages_sent": 0,
                    "session_history": []
                }
            }
        
        with open(stats_file, "r", encoding="utf-8") as f:
            stats = json.load(f)
        
        return {"success": True, "stats": stats}
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Invalid JSON in stats file: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/summary")
async def get_stats_summary(user: dict = AuthDep) -> Dict[str, Any]:
    """Get statistics summary"""
    try:
        stats_file = _get_stats_file()
        
        if not stats_file.exists():
            return {
                "success": True,
                "summary": {
                    "total_posts": 0,
                    "total_success": 0,
                    "total_failures": 0,
                    "success_rate": 0.0,
                    "total_messages_sent": 0,
                    "total_flood_waits": 0,
                    "active_accounts": 0,
                    "banned_accounts": 0,
                    "frozen_accounts": 0,
                    "total_groups": 0
                }
            }
        
        with open(stats_file, "r", encoding="utf-8") as f:
            stats = json.load(f)
        
        accounts = stats.get("accounts", {})
        groups = stats.get("groups", {})
        
        total_success = stats.get("total_success", 0)
        total_failures = stats.get("total_failures", 0)
        total_posts = stats.get("total_posts", 0)
        
        success_rate = (total_success / total_posts * 100) if total_posts > 0 else 0.0
        
        active_accounts = sum(1 for acc in accounts.values() if not acc.get("banned", False) and not acc.get("frozen", False))
        banned_accounts = sum(1 for acc in accounts.values() if acc.get("banned", False))
        frozen_accounts = sum(1 for acc in accounts.values() if acc.get("frozen", False))
        
        return {
            "success": True,
            "summary": {
                "total_posts": total_posts,
                "total_success": total_success,
                "total_failures": total_failures,
                "success_rate": round(success_rate, 2),
                "total_messages_sent": stats.get("total_messages_sent", 0),
                "total_flood_waits": stats.get("total_flood_waits", 0),
                "active_accounts": active_accounts,
                "banned_accounts": banned_accounts,
                "frozen_accounts": frozen_accounts,
                "total_groups": len(groups),
                "total_accounts": len(accounts)
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

