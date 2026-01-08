"""
Bot Control API - Start/Stop/Status endpoints
Auth: Extract user_id ONLY from JWT (never trust X-User-Id header)
"""

from fastapi import APIRouter, HTTPException, Header, Depends, Body
from typing import Dict, Any, Optional
from pydantic import BaseModel
import jwt
import os
import re

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from bot.data_manager import get_user_data, update_user_data, get_user_stats, is_read_only_mode, get_read_only_reason, load_users, load_stats
from bot.session_manager import assign_sessions_to_user, get_banned_sessions
from bot.api_pairs import assign_pair_to_sessions, load_api_pairs, get_pair_usage
from bot.scheduler import get_scheduler
from bot.engine import parse_post_link
from bot.heartbeat_manager import get_status_from_heartbeat, clear_heartbeat

router = APIRouter()

JWT_SECRET = os.getenv("JWT_SECRET", "your-secret-key")


# Pydantic models for request bodies
class RegisterUserRequest(BaseModel):
    email: Optional[str] = None
    plan_status: Optional[str] = None  # Store plan_status for scheduler expiration checks
    plan_limits: Optional[Dict[str, Any]] = None  # Store plan limits (e.g., max_sessions)


class StartBotRequest(BaseModel):
    execution_mode: Optional[str] = None  # "starter" or "enterprise"
    total_cycle_minutes: Optional[int] = None  # For starter mode only


class UpdatePostRequest(BaseModel):
    post_type: Optional[str] = None
    post_content: Optional[str] = None


class UpdateGroupsRequest(BaseModel):
    groups: list


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


def verify_auth_and_get_plan_status(authorization: Optional[str] = Header(None)) -> tuple[str, Optional[str], Optional[Dict[str, Any]]]:
    """
    Verify JWT and extract user_id, plan_status, and plan_limits
    Returns: (user_id, plan_status, plan_limits)
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")
    
    try:
        token = authorization.replace("Bearer ", "")
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("user_id") or payload.get("sub")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: no user_id")
        
        plan_status = payload.get("plan_status")
        plan_limits = payload.get("plan_limits")
        
        return (str(user_id), plan_status, plan_limits)
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")


@router.post("/start")
async def start_bot(
    auth_data: tuple[str, Optional[str], Optional[Dict[str, Any]]] = Depends(verify_auth_and_get_plan_status),
    request: Optional[StartBotRequest] = Body(None)
) -> Dict[str, Any]:
    """
    Start bot for user
    Enforces plan_status check: bots cannot run if plan is inactive or expired
    """
    user_id, plan_status, plan_limits = auth_data
    
    # Check read-only mode
    if is_read_only_mode():
        reason = get_read_only_reason()
        raise HTTPException(
            status_code=503,
            detail=f"Backend is in read-only mode due to data corruption ({reason}). Cannot start bot. Please contact administrator."
        )
    
    # CRITICAL: Enforce plan status - prevent bots from running with expired/inactive plans
    if plan_status not in ["active", None]:
        # None means plan_status not in JWT (backward compatibility), allow but log warning
        if plan_status == "expired":
            raise HTTPException(
                status_code=403,
                detail="Your plan has expired. Please renew your subscription to start the bot."
            )
        elif plan_status == "inactive":
            raise HTTPException(
                status_code=403,
                detail="Your plan is inactive. Please activate your subscription to start the bot."
            )
        else:
            # Unknown status - be conservative and reject
            raise HTTPException(
                status_code=403,
                detail=f"Invalid plan status: {plan_status}. Please contact support."
            )
    
    user_data = get_user_data(user_id)
    
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user_data.get("bot_status") == "running":
        return {"success": True, "message": "Bot already running", "status": "running"}
    
    # Assign sessions if needed (lazy assignment on first start)
    assigned_sessions = user_data.get("assigned_sessions", [])
    if not assigned_sessions:
        # Get session count from plan limits (JWT claim) or default to 1
        num_sessions = 1
        if plan_limits and isinstance(plan_limits, dict):
            max_sessions = plan_limits.get("max_sessions")
            if isinstance(max_sessions, int) and max_sessions > 0:
                num_sessions = max_sessions
        
        # CRITICAL: Check session availability BEFORE assignment
        # Prevents "running but doing nothing" state
        from bot.session_manager import get_unused_sessions, get_banned_sessions
        unused_sessions = get_unused_sessions()
        banned_sessions = get_banned_sessions()
        available_sessions = [s for s in unused_sessions if s not in banned_sessions]
        
        if not available_sessions:
            raise HTTPException(
                status_code=409,
                detail="No sessions available. Please contact support to add sessions to the pool."
            )
        
        if len(available_sessions) < num_sessions:
            # Not enough sessions, use what's available
            num_sessions = len(available_sessions)
        
        # Get all users for API pair usage calculation
        from bot.data_manager import load_users
        all_users = load_users()
        
        assigned_sessions = assign_sessions_to_user(user_id, num_sessions)
        
        # CRITICAL: Verify sessions were actually assigned
        if not assigned_sessions:
            raise HTTPException(
                status_code=409,
                detail="Failed to assign sessions. No sessions available in the pool."
            )
        
        # Assign API pairs (respecting 7-session limit)
        api_pairs = assign_pair_to_sessions(all_users, user_id, num_sessions)
        
        try:
            update_user_data(user_id, {
                "assigned_sessions": assigned_sessions,
                "api_pairs": api_pairs
            })
        except RuntimeError as e:
            # Read-only mode error
            raise HTTPException(status_code=503, detail=str(e))
    
    # CRITICAL: Final check - ensure assigned_sessions is not empty before setting status to "running"
    # This prevents the misleading "running but doing nothing" state
    if not assigned_sessions:
        raise HTTPException(
            status_code=409,
            detail="Cannot start bot: no sessions assigned. Please contact support."
        )
    
    # CRITICAL: execution_mode MUST come from user_data (set during adbot creation)
    # NO DEFAULT FALLBACKS - fail hard if missing
    user_execution_mode = user_data.get("execution_mode")
    
    # Get plan_type from plan_limits (for validation only)
    plan_type = None
    if plan_limits and isinstance(plan_limits, dict):
        plan_type = plan_limits.get("plan_type")
    
    # RUNTIME SAFETY GUARD: execution_mode MUST exist in user_data
    if not user_execution_mode or user_execution_mode not in ["starter", "enterprise"]:
        raise HTTPException(
            status_code=400,
            detail=f"CRITICAL: execution_mode missing or invalid in user_data. Current value: {user_execution_mode}. "
                   f"execution_mode must be set during adbot creation from product.plan_type. "
                   f"Refusing to start bot without valid execution_mode."
        )
    
    execution_mode = user_execution_mode
    total_cycle_minutes = None
    
    # VALIDATION: Ensure execution_mode matches plan_type from JWT (if provided)
    # This is a consistency check, not the source of truth
    if plan_type:
        expected_mode = "starter" if plan_type == "STARTER" else "enterprise"
        if execution_mode != expected_mode:
            raise HTTPException(
                status_code=400,
                detail=f"execution_mode mismatch: user_data has '{execution_mode}' but plan_type is '{plan_type}'. "
                       f"Expected execution_mode: '{expected_mode}'. Data inconsistency detected."
            )
    
    # Request body CANNOT override execution_mode - it's set from product.plan_type
    if request and request.execution_mode and request.execution_mode != execution_mode:
        raise HTTPException(
            status_code=403,
            detail=f"execution_mode cannot be overridden. Current value '{execution_mode}' is set from product.plan_type. "
                   f"Requested value '{request.execution_mode}' is rejected."
        )
    
    # Validate and set total_cycle_minutes for starter mode
    if execution_mode == "starter":
        if request and request.total_cycle_minutes:
            total_cycle_minutes = request.total_cycle_minutes
        else:
            # Default cycle time for starter (frontend should pass this)
            total_cycle_minutes = 60  # Default 60 minutes
        
        if total_cycle_minutes is None or total_cycle_minutes <= 0:
            raise HTTPException(
                status_code=400,
                detail="Starter mode requires total_cycle_minutes > 0"
            )
    
    # Update status (INTENT - system wants bot to run)
    try:
        update_data = {"bot_status": "running"}
        if execution_mode:
            update_data["execution_mode"] = execution_mode
        if total_cycle_minutes:
            update_data["total_cycle_minutes"] = total_cycle_minutes
        update_user_data(user_id, update_data)
    except RuntimeError as e:
        # Read-only mode error
        raise HTTPException(status_code=503, detail=str(e))
    
    # Heartbeat will be emitted by scheduler when cycle starts
    # Don't emit here - let worker emit it naturally
    
    return {
        "success": True,
        "message": "Bot started",
        "status": "running",  # Intent status
        "sessions": len(assigned_sessions),
        "execution_mode": execution_mode
    }


@router.post("/stop")
async def stop_bot(
    user_id: str = Depends(verify_auth_and_get_user_id)
) -> Dict[str, Any]:
    """Stop bot for user (graceful stop - finishes current cycle)"""
    user_data = get_user_data(user_id)
    
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user_data.get("bot_status") == "stopped":
        # Clear heartbeat if it exists (cleanup)
        clear_heartbeat(user_id)
        # Clean up error tracking
        from bot.error_tracker import get_error_tracker
        error_tracker = get_error_tracker()
        assigned_sessions = user_data.get("assigned_sessions", [])
        for session_filename in assigned_sessions:
            error_tracker.reset_session(session_filename)
        return {"success": True, "message": "Bot already stopped", "status": "stopped"}
    
    # Update status (INTENT - system wants bot to stop)
    try:
        update_user_data(user_id, {"bot_status": "stopped"})
    except RuntimeError as e:
        # Read-only mode - but stop is safe to ignore if we can't write
        # User will see stopped status on next read
        pass
    
    # Clear heartbeat (worker will stop naturally, but clear immediately)
    clear_heartbeat(user_id)
    
    # Clean up error tracking for this user's sessions
    from bot.error_tracker import get_error_tracker
    error_tracker = get_error_tracker()
    assigned_sessions = user_data.get("assigned_sessions", [])
    for session_filename in assigned_sessions:
        error_tracker.reset_session(session_filename)
    
    # Cancel scheduler task for this user (if running)
    scheduler = get_scheduler()
    if scheduler and scheduler.is_user_active(user_id):
        # Task will check bot_status and exit gracefully
        pass
    
    return {
        "success": True,
        "message": "Bot stopped",
        "status": "stopped"
    }


@router.post("/register-user")
async def register_user(
    user_id: str = Depends(verify_auth_and_get_user_id),
    request: Optional[RegisterUserRequest] = Body(None)
) -> Dict[str, Any]:
    """Register user in Python backend (idempotent)"""
    # Check read-only mode
    if is_read_only_mode():
        reason = get_read_only_reason()
        raise HTTPException(
            status_code=503,
            detail=f"Backend is in read-only mode due to data corruption ({reason}). Cannot register user. Please contact administrator."
        )
    
    email = request.email if request and request.email else None
    
    # Check if user already exists
    user_data = get_user_data(user_id)
    
    if user_data:
        # User already exists - return success (idempotent)
        return {
            "success": True,
            "message": "User already registered",
            "user_id": user_id,
            "status": "existing"
        }
    
    # Create new user entry with defaults
    # Store plan_status and plan_limits for scheduler expiration checks
    user_defaults = {
        "assigned_sessions": [],
        "api_pairs": [],
        "groups": [],
        "post_type": "link",
        "post_content": "",
        "bot_status": "stopped",
        "delay_between_posts": 5,
        "delay_between_cycles": 300,
    }
    
    # Store plan info if provided (enables scheduler to check expiration)
    if request and request.plan_status:
        user_defaults["plan_status"] = request.plan_status
    if request and request.plan_limits:
        user_defaults["plan_limits"] = request.plan_limits
        # CRITICAL: If plan_limits has plan_type, derive execution_mode
        # This ensures execution_mode is set during user registration
        plan_type = request.plan_limits.get("plan_type")
        if plan_type:
            execution_mode = "starter" if plan_type == "STARTER" else "enterprise"
            user_defaults["execution_mode"] = execution_mode
    
    try:
        update_user_data(user_id, user_defaults)
    except RuntimeError as e:
        # Read-only mode error
        raise HTTPException(status_code=503, detail=str(e))
    
    return {
        "success": True,
        "message": "User registered",
        "user_id": user_id,
        "status": "new"
    }


@router.post("/update-execution-mode")
async def update_execution_mode(
    user_id: str = Depends(verify_auth_and_get_user_id),
    request: Optional[Dict[str, Any]] = Body(None)
) -> Dict[str, Any]:
    """Update execution_mode in user_data (CRITICAL: Must be called before starting bot)"""
    # Check read-only mode
    if is_read_only_mode():
        reason = get_read_only_reason()
        raise HTTPException(
            status_code=503,
            detail=f"Backend is in read-only mode due to data corruption ({reason}). Cannot update execution_mode. Please contact administrator."
        )
    
    if not request or "execution_mode" not in request:
        raise HTTPException(
            status_code=400,
            detail="execution_mode is required in request body"
        )
    
    execution_mode = request["execution_mode"]
    if execution_mode not in ["starter", "enterprise"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid execution_mode: {execution_mode}. Must be 'starter' or 'enterprise'"
        )
    
    # Update user_data with execution_mode
    try:
        update_user_data(user_id, {"execution_mode": execution_mode})
    except RuntimeError as e:
        # Read-only mode error
        raise HTTPException(status_code=503, detail=str(e))
    
    return {
        "success": True,
        "message": "execution_mode updated",
        "execution_mode": execution_mode
    }


@router.post("/update-post")
async def update_post(
    user_id: str = Depends(verify_auth_and_get_user_id),
    request: UpdatePostRequest = Body(...)
) -> Dict[str, Any]:
    """Update post content for user"""
    # Check read-only mode
    if is_read_only_mode():
        reason = get_read_only_reason()
        raise HTTPException(
            status_code=503,
            detail=f"Backend is in read-only mode due to data corruption ({reason}). Cannot update post. Please contact administrator."
        )
    
    user_data = get_user_data(user_id)
    
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found. Please register user first.")
    
    # Validate post_type
    if request.post_type and request.post_type not in ["link", "text"]:
        raise HTTPException(status_code=400, detail="post_type must be 'link' or 'text'")
    
    # Determine effective post_type (use existing if not provided)
    effective_post_type = request.post_type if request.post_type is not None else user_data.get("post_type", "link")
    
    # Validate post_content if provided
    if request.post_content is not None:
        # Check for empty content
        post_content = request.post_content.strip()
        if not post_content:
            raise HTTPException(status_code=400, detail="post_content cannot be empty")
        
        # Validate link format if post_type is "link"
        if effective_post_type == "link":
            try:
                # Validate using parse_post_link from bot.engine
                parse_post_link(post_content)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=f"Invalid post link format: {str(e)}. Expected format: t.me/channel/123 or https://t.me/channel/123")
    
    # Build update dict
    updates = {}
    if request.post_type is not None:
        updates["post_type"] = request.post_type
    if request.post_content is not None:
        updates["post_content"] = request.post_content.strip()
    
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    # Update user data
    try:
        update_user_data(user_id, updates)
    except RuntimeError as e:
        # Read-only mode error
        raise HTTPException(status_code=503, detail=str(e))
    
    return {
        "success": True,
        "message": "Post content updated",
        "post_type": updates.get("post_type", user_data.get("post_type")),
        "post_content": updates.get("post_content", user_data.get("post_content"))
    }


@router.post("/update-groups")
async def update_groups(
    user_id: str = Depends(verify_auth_and_get_user_id),
    request: UpdateGroupsRequest = Body(...)
) -> Dict[str, Any]:
    """Update groups list for user"""
    # Check read-only mode
    if is_read_only_mode():
        reason = get_read_only_reason()
        raise HTTPException(
            status_code=503,
            detail=f"Backend is in read-only mode due to data corruption ({reason}). Cannot update groups. Please contact administrator."
        )
    
    user_data = get_user_data(user_id)
    
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found. Please register user first.")
    
    if not isinstance(request.groups, list):
        raise HTTPException(status_code=400, detail="groups must be an array")
    
    # Validate group count (reasonable limit)
    MAX_GROUPS = 1000
    if len(request.groups) > MAX_GROUPS:
        raise HTTPException(status_code=400, detail=f"Too many groups. Maximum {MAX_GROUPS} groups allowed")
    
    # Validate group format (Telegram group IDs or usernames)
    # Group IDs: -1001234567890 (negative integer as string)
    # Usernames: @groupname or groupname (optional @ prefix)
    import re
    for group in request.groups:
        if not isinstance(group, str):
            raise HTTPException(status_code=400, detail=f"Invalid group format: {group}. Groups must be strings")
        
        group = group.strip()
        if not group:
            raise HTTPException(status_code=400, detail="Groups cannot be empty strings")
        
        # Check if it's a group ID (starts with -100 and is numeric)
        if group.startswith('-100') and group[1:].isdigit():
            # Valid group ID format
            continue
        # Check if it's a username (starts with @ or is alphanumeric/underscore)
        elif group.startswith('@'):
            # Remove @ and validate
            username = group[1:]
            if not re.match(r'^[a-zA-Z0-9_]{5,32}$', username):
                raise HTTPException(status_code=400, detail=f"Invalid group username format: {group}. Usernames must be 5-32 characters, alphanumeric or underscore")
        elif re.match(r'^[a-zA-Z0-9_]{5,32}$', group):
            # Valid username without @ prefix (normalize by adding @)
            continue
        else:
            raise HTTPException(status_code=400, detail=f"Invalid group format: {group}. Expected format: -1001234567890 (group ID) or @groupname (username)")
    
    # Update user data
    try:
        update_user_data(user_id, {"groups": request.groups})
    except RuntimeError as e:
        # Read-only mode error
        raise HTTPException(status_code=503, detail=str(e))
    
    return {
        "success": True,
        "message": "Groups updated",
        "groups_count": len(request.groups)
    }


@router.get("/health")
async def get_bot_health() -> Dict[str, Any]:
    """Get backend health metrics (no authentication required for monitoring)"""
    try:
        # Count active sessions (sessions assigned to users with bot_status="running")
        users = load_users()
        active_sessions_count = 0
        for user_id, user_data in users.items():
            if user_data.get("bot_status") == "running":
                assigned_sessions = user_data.get("assigned_sessions", [])
                active_sessions_count += len(assigned_sessions)
        
        # Count banned sessions
        banned_sessions_set = get_banned_sessions()
        banned_sessions_count = len(banned_sessions_set)
        
        # Get last cycle time (most recent last_activity from stats)
        stats = load_stats()
        last_cycle_time = None
        if stats:
            # Find most recent last_activity across all users
            for user_id, user_stats in stats.items():
                user_last_activity = user_stats.get("last_activity")
                if user_last_activity:
                    if last_cycle_time is None or user_last_activity > last_cycle_time:
                        last_cycle_time = user_last_activity
        
        # Last error: Not currently tracked (would require scheduler/worker changes)
        # Return None to indicate not available
        last_error = None
        
        return {
            "success": True,
            "health": {
                "active_sessions": active_sessions_count,
                "banned_sessions": banned_sessions_count,
                "last_cycle_time": last_cycle_time,
                "last_error": last_error
            }
        }
    except Exception as e:
        # Return error in health response
        return {
            "success": False,
            "health": {
                "active_sessions": 0,
                "banned_sessions": 0,
                "last_cycle_time": None,
                "last_error": str(e)
            },
            "error": str(e)
        }


@router.get("/status")
async def get_bot_status(
    user_id: str = Depends(verify_auth_and_get_user_id)
) -> Dict[str, Any]:
    """
    Get bot status for user (WORKER-BASED - SOURCE OF TRUTH)
    Status is derived from heartbeat, not JSON or Supabase
    """
    user_data = get_user_data(user_id)
    
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get intent from users.json (what the system wants)
    intent_status = user_data.get("bot_status", "stopped")
    
    # Get REAL status from heartbeat (what is actually happening)
    heartbeat_status = get_status_from_heartbeat(user_id, intent_status)
    
    stats = get_user_stats(user_id)
    scheduler = get_scheduler()
    is_active = scheduler.is_user_active(user_id) if scheduler else False
    
    # Return REAL status (from heartbeat), not intent
    return {
        "success": True,
        "status": heartbeat_status["status"],  # RUNNING | STOPPED | CRASHED
        "intent": intent_status,  # What system wants (for debugging)
        "is_active": is_active,
        "is_fresh": heartbeat_status["is_fresh"],
        "last_heartbeat": heartbeat_status["last_heartbeat"],
        "cycle_state": heartbeat_status["cycle_state"],
        "sessions": len(user_data.get("assigned_sessions", [])),
        "groups": len(user_data.get("groups", [])),
        "messages_sent": stats.get("total_messages_sent", 0),
        "total_success": stats.get("total_success", 0),
        "total_failures": stats.get("total_failures", 0)
    }


@router.get("/state")
async def get_bot_state(
    user_id: str = Depends(verify_auth_and_get_user_id)
) -> Dict[str, Any]:
    """
    Get complete bot state for user (WORKER-BASED STATUS)
    Status is derived from heartbeat, not JSON or Supabase
    """
    user_data = get_user_data(user_id)
    
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get intent from users.json (what the system wants)
    intent_status = user_data.get("bot_status", "stopped")
    
    # Get REAL status from heartbeat (what is actually happening)
    heartbeat_status = get_status_from_heartbeat(user_id, intent_status)
    
    stats = get_user_stats(user_id)
    scheduler = get_scheduler()
    is_active = scheduler.is_user_active(user_id) if scheduler else False
    
    assigned_sessions = user_data.get("assigned_sessions", [])
    groups = user_data.get("groups", [])
    post_content = user_data.get("post_content", "")
    
    # Health signals: detect when bot is running but cannot actually execute
    # is_idle: true if bot is RUNNING but missing critical resources (sessions/groups/content)
    is_idle = False
    if heartbeat_status["status"] == "RUNNING":
        if not assigned_sessions or not groups or not post_content:
            is_idle = True
    
    # last_error_reason: derive from recent worker failures if available
    # Check stats for recent failures (simplified - in production could check logs)
    last_error_reason = None
    if heartbeat_status["status"] == "CRASHED":
        last_error_reason = "Worker crashed or stopped unexpectedly"
    elif stats.get("total_failures", 0) > 0:
        # If we have failures but no success, likely a configuration issue
        if stats.get("total_success", 0) == 0 and stats.get("total_failures", 0) > 0:
            if not assigned_sessions:
                last_error_reason = "No sessions assigned"
            elif not groups:
                last_error_reason = "No groups configured"
            elif not post_content:
                last_error_reason = "No post content configured"
            else:
                last_error_reason = "Execution failures detected"
    
    return {
        "success": True,
        "status": heartbeat_status["status"],  # RUNNING | STOPPED | CRASHED (REAL status)
        "intent": intent_status,  # What system wants (for debugging)
        "is_active": is_active,
        "is_fresh": heartbeat_status["is_fresh"],
        "last_heartbeat": heartbeat_status["last_heartbeat"],
        "cycle_state": heartbeat_status["cycle_state"],
        "is_idle": is_idle,  # Health signal: running but cannot execute
        "last_error_reason": last_error_reason,  # Health signal: recent error reason
        "post_type": user_data.get("post_type", "link"),
        "post_content": post_content,
        "groups": groups,
        "sessions": len(assigned_sessions),
        "stats": {
            "total_messages_sent": stats.get("total_messages_sent", 0),
            "total_success": stats.get("total_success", 0),
            "total_failures": stats.get("total_failures", 0),
            "total_flood_waits": stats.get("total_flood_waits", 0)
        }
    }
