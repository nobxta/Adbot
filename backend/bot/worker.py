"""
Worker - Per-user execution logic
Executes forwarding cycles for a single user
With per-user concurrency limits (semaphore)
"""

import asyncio
import random
from pathlib import Path
from typing import Dict, Any, List, Optional, Callable
from telethon import TelegramClient

from bot.engine import execute_forwarding_cycle, parse_post_link, distribute_groups
from bot.session_manager import get_session_path, ban_session, replace_banned_session
from bot.api_pairs import load_api_pairs
from bot.data_manager import get_user_data, update_user_stats, update_user_data, get_user_stats
from bot.log_saver import get_user_logger
from bot.heartbeat_manager import emit_heartbeat
from bot.plan_config import (
    calculate_per_message_delay,
    calculate_random_start_offset,
    get_plan_timing_constraints
)
from bot.error_tracker import get_error_tracker
from bot.group_file_manager import get_group_cache, get_groups_for_plan


async def execute_user_cycle(
    user_id: str,
    is_running: Callable[[], bool],
    delay_between_cycles: int = 300,
    user_semaphore: Optional[asyncio.Semaphore] = None
) -> Dict[str, Any]:
    """
    Execute one cycle for a user
    Each session runs independently with its own cycle gap
    Worker owns timing authority: offsets, delays, alignment
    
    Args:
        user_id: User identifier
        is_running: Callable to check if still running
        delay_between_cycles: Estimated delay between cycles (scheduler reference, not enforced)
        user_semaphore: Semaphore for concurrency control
    
    Returns: cycle stats
    
    Note: The actual cycle gaps are calculated per-session based on plan type.
    This delay_between_cycles is only used as a scheduler estimate.
    """
    # Emit heartbeat: cycle starting
    emit_heartbeat(user_id, cycle_state="running")
    
    user_data = get_user_data(user_id)
    if not user_data:
        return {"error": "User data not found"}
    
    if user_data.get("bot_status") != "running":
        return {"error": "Bot not running"}
    
    # Get logger first (needed for error messages)
    logger = get_user_logger(user_id)
    
    # Get user config
    assigned_sessions = user_data.get("assigned_sessions", [])
    post_content = user_data.get("post_content", "")
    post_type = user_data.get("post_type", "link")
    api_pairs = user_data.get("api_pairs", [])
    execution_mode = user_data.get("execution_mode", "enterprise")
    total_cycle_minutes = user_data.get("total_cycle_minutes")
    
    # Determine plan type from execution_mode
    plan_type = "STARTER" if execution_mode == "starter" else "ENTERPRISE"
    
    # Load groups from file based on plan type
    group_cache = get_group_cache()
    
    # Check if file changed (for reload at cycle boundary)
    file_changed = group_cache.check_file_changed(plan_type)
    if file_changed:
        logger.info(f"User {user_id}: Group file changed, will reload at cycle completion")
    
    # Get groups from file (reload if file changed)
    if execution_mode == "starter":
        groups = group_cache.get_starter_groups(force_reload=file_changed)
    else:
        groups = group_cache.get_enterprise_groups(force_reload=file_changed)
    
    # For backward compatibility, also check user_data groups (but file takes precedence)
    if not groups:
        groups = user_data.get("groups", [])
        if groups:
            logger.warning(
                f"User {user_id}: No groups in {plan_type.lower()}_groups.txt, "
                f"using groups from user_data (legacy mode)"
            )
    
    # Validate execution_mode
    if execution_mode not in ["starter", "enterprise"]:
        logger.error(f"User {user_id}: Invalid execution_mode: {execution_mode}")
        return {"error": f"Invalid execution_mode: {execution_mode}", "success": 0, "failures": 0, "flood_waits": 0, "errors": [f"Invalid execution_mode: {execution_mode}"], "banned_sessions": []}
    
    # Get plan-specific timing constraints
    num_sessions = len(assigned_sessions)
    num_groups = len(groups)
    timing_constraints = get_plan_timing_constraints(execution_mode, num_sessions, num_groups)
    
    # Calculate per-message delay based on plan type
    delay_between_posts = calculate_per_message_delay(execution_mode, num_sessions, num_groups)
    
    # Log high load warning for single session edge case
    if timing_constraints.get("high_load_warning"):
        logger.warning(
            f"User {user_id}: HIGH LOAD on single session ({num_groups} groups). "
            f"Using increased delays and cycle gap for safety."
        )
    
    # Validate starter mode requirements
    if execution_mode == "starter":
        if total_cycle_minutes is None or total_cycle_minutes <= 0:
            logger.error(f"User {user_id}: Starter mode requires total_cycle_minutes")
            return {"error": "Starter mode requires total_cycle_minutes", "success": 0, "failures": 0, "flood_waits": 0, "errors": ["Starter mode requires total_cycle_minutes"], "banned_sessions": []}
        
        if num_sessions == 0:
            logger.error(f"User {user_id}: Starter mode requires at least one session")
            return {"error": "Starter mode requires at least one session", "success": 0, "failures": 0, "flood_waits": 0, "errors": ["Starter mode requires at least one session"], "banned_sessions": []}
        
        # Calculate session runtime with plan-specific delay
        total_cycle_seconds = total_cycle_minutes * 60
        per_session_offset = total_cycle_seconds / num_sessions
        session_runtime = num_groups * delay_between_posts
        
        # Validate feasibility: session_runtime must be < per_session_offset
        if session_runtime >= per_session_offset:
            logger.error(
                f"User {user_id}: Starter mode infeasible - "
                f"session_runtime ({session_runtime:.1f}s) >= per_session_offset ({per_session_offset:.1f}s)"
            )
            return {
                "error": f"Starter mode infeasible: session runtime ({session_runtime:.1f}s) must be less than per-session offset ({per_session_offset:.1f}s). Increase total_cycle_minutes or reduce groups.",
                "success": 0,
                "failures": 0,
                "flood_waits": 0,
                "errors": [f"Starter mode infeasible: session_runtime >= per_session_offset"],
                "banned_sessions": []
            }
    
    # CRITICAL: Validate required resources before execution
    # Return structured errors (not silent failures) to help diagnose issues
    if not assigned_sessions:
        logger.error(f"User {user_id}: Cannot execute cycle - no sessions assigned")
        return {"error": "No sessions assigned", "success": 0, "failures": 0, "flood_waits": 0, "errors": ["No sessions assigned"], "banned_sessions": []}
    
    if not groups:
        logger.error(f"User {user_id}: Cannot execute cycle - no groups configured")
        return {"error": "No groups configured", "success": 0, "failures": 0, "flood_waits": 0, "errors": ["No groups configured"], "banned_sessions": []}
    
    if not post_content:
        logger.error(f"User {user_id}: Cannot execute cycle - no post content configured")
        return {"error": "No post content configured", "success": 0, "failures": 0, "flood_waits": 0, "errors": ["No post content configured"], "banned_sessions": []}
    
    if post_type != "link":
        return {"error": "Only link post type supported"}
    
    # Load API pairs
    pairs = load_api_pairs()
    
    # Get error tracker for per-session error tracking
    error_tracker = get_error_tracker()
    
    # Distribute groups based on execution mode
    groups_distribution = distribute_groups(groups, num_sessions, execution_mode)
    
    # Log group distribution for clarity
    logger.info(
        f"User {user_id} ({execution_mode.upper()} mode): "
        f"{num_groups} groups distributed across {num_sessions} sessions"
    )
    for idx, session_groups in enumerate(groups_distribution):
        logger.info(f"  Session {idx + 1}: {len(session_groups)} groups")
    
    # Calculate RANDOM start offsets for starter mode (each cycle gets new random offsets)
    cycle_start_time = asyncio.get_event_loop().time()
    session_start_offsets = []
    
    if execution_mode == "starter":
        # STARTER PLAN: Each session gets a RANDOM offset within the total window
        # This ensures sessions do NOT post in synchronized patterns
        # New random offsets are calculated for EACH cycle
        for idx in range(num_sessions):
            random_offset = calculate_random_start_offset(execution_mode, idx, num_sessions, num_groups)
            session_start_offsets.append(random_offset)
        
        if session_start_offsets:
            logger.info(
                f"User {user_id}: Starter mode RANDOM offsets (this cycle) - "
                f"offsets: {[f'{o/60:.2f}min' for o in session_start_offsets]}"
            )
    
    cycle_stats = {
        "success": 0,
        "failures": 0,
        "flood_waits": 0,
        "errors": [],
        "banned_sessions": []
    }
    
    # Execute forwarding for each session
    tasks = []
    for idx, session_filename in enumerate(assigned_sessions):
        if idx >= len(groups_distribution):
            break
        
        assigned_groups = groups_distribution[idx]
        if not assigned_groups:
            continue
        
        # Get session path
        session_path = get_session_path(user_id, session_filename)
        if not session_path:
            logger.warning(f"Session {session_filename} not found")
            continue
        
        # Get API pair for this session
        pair_idx = api_pairs[idx % len(api_pairs)] if api_pairs else 0
        if pair_idx >= len(pairs):
            pair_idx = 0
        
        pair = pairs[pair_idx]
        api_id = int(pair["api_id"])
        api_hash = pair["api_hash"]
        
        # Calculate RANDOM start offset (starter mode only - randomized per cycle)
        start_offset = None
        if execution_mode == "starter" and session_start_offsets and idx < len(session_start_offsets):
            start_offset = session_start_offsets[idx]
        
        # Get current cycle number for this session
        cycle_number = error_tracker.get_current_cycle(session_filename)
        
        # Create task for this session
        task = execute_session_cycle(
            user_id,
            session_filename,
            str(session_path),
            api_id,
            api_hash,
            post_content,
            assigned_groups,
            delay_between_posts,
            logger,
            is_running,
            user_semaphore,
            execution_mode,
            start_offset,
            cycle_start_time,
            cycle_number,
            error_tracker
        )
        tasks.append(task)
    
    # Wait for all sessions to complete
    if tasks:
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for result in results:
            if isinstance(result, dict):
                cycle_stats["success"] += result.get("success", 0)
                cycle_stats["failures"] += result.get("failures", 0)
                cycle_stats["flood_waits"] += result.get("flood_waits", 0)
                if result.get("errors"):
                    cycle_stats["errors"].extend(result["errors"])
                if result.get("banned_sessions"):
                    cycle_stats["banned_sessions"].extend(result["banned_sessions"])
            elif isinstance(result, Exception):
                cycle_stats["failures"] += 1
                cycle_stats["errors"].append(str(result))
    
    # Handle banned sessions (automatic replacement)
    if cycle_stats["banned_sessions"]:
        for banned_session in cycle_stats["banned_sessions"]:
            # Move to banned directory
            ban_session(banned_session)
            
            # Remove from user's assigned sessions
            user_data = get_user_data(user_id)
            assigned_sessions = user_data.get("assigned_sessions", [])
            if banned_session in assigned_sessions:
                assigned_sessions.remove(banned_session)
                banned_list = user_data.get("banned_sessions", [])
                if banned_session not in banned_list:
                    banned_list.append(banned_session)
                
                update_user_data(user_id, {
                    "assigned_sessions": assigned_sessions,
                    "banned_sessions": banned_list
                })
            
            # Attempt replacement
            replacement = replace_banned_session(user_id, banned_session)
            if replacement:
                assigned_sessions.append(replacement)
                update_user_data(user_id, {"assigned_sessions": assigned_sessions})
                logger.info(f"Replaced banned session {banned_session} with {replacement}")
            else:
                logger.warning(f"No replacement available for banned session {banned_session}")
    
    # Update stats
    stats = get_user_stats(user_id)
    stats["total_posts"] = stats.get("total_posts", 0) + cycle_stats["success"] + cycle_stats["failures"]
    stats["total_success"] = stats.get("total_success", 0) + cycle_stats["success"]
    stats["total_failures"] = stats.get("total_failures", 0) + cycle_stats["failures"]
    stats["total_flood_waits"] = stats.get("total_flood_waits", 0) + cycle_stats["flood_waits"]
    stats["total_messages_sent"] = stats.get("total_messages_sent", 0) + cycle_stats["success"]
    
    update_user_stats(user_id, stats)
    
    # Reload groups from file at cycle completion (if file changed)
    # This ensures file changes are applied at the next cycle start
    group_cache = get_group_cache()
    plan_type = "STARTER" if execution_mode == "starter" else "ENTERPRISE"
    if group_cache.check_file_changed(plan_type):
        logger.info(f"User {user_id}: Reloading groups from file after cycle completion")
        if execution_mode == "starter":
            group_cache.get_starter_groups(force_reload=True)
        else:
            group_cache.get_enterprise_groups(force_reload=True)
    
    # Emit heartbeat: cycle completed
    emit_heartbeat(user_id, cycle_state="idle")
    
    return cycle_stats


async def execute_session_cycle(
    user_id: str,
    session_filename: str,
    session_path: str,
    api_id: int,
    api_hash: str,
    post_link: str,
    assigned_groups: List[str],
    delay_between_posts: float,
    logger,
    is_running: Callable[[], bool],
    user_semaphore: Optional[asyncio.Semaphore] = None,
    execution_mode: str = "enterprise",
    start_offset: Optional[float] = None,
    cycle_start_time: Optional[float] = None,
    cycle_number: int = 0,
    error_tracker=None
) -> Dict[str, Any]:
    """
    Execute forwarding cycle for a single session
    Implements plan-specific behavior and error tracking
    
    Args:
        execution_mode: "starter" | "enterprise"
        start_offset: Offset in seconds relative to cycle_start_time (starter mode startup stagger)
        cycle_start_time: Absolute cycle start time (for alignment)
        cycle_number: Current cycle number for this session
        error_tracker: ErrorTracker instance for per-session error tracking
    """
    from bot.error_tracker import get_error_tracker
    
    if error_tracker is None:
        error_tracker = get_error_tracker()
    
    # Acquire semaphore if provided (per-user concurrency limit)
    if user_semaphore:
        await user_semaphore.acquire()
    
    try:
        # STARTER MODE: Apply RANDOM start offset (every cycle gets new random offset)
        # Enterprise mode: No offset (groups are partitioned, start immediately)
        if execution_mode == "starter" and start_offset is not None and start_offset >= 0:
            if cycle_start_time is not None:
                # Calculate absolute target time
                target_time = cycle_start_time + start_offset
                current_time = asyncio.get_event_loop().time()
                wait_time = max(0, target_time - current_time)
                
                if wait_time > 0:
                    logger.info(
                        f"Session {session_filename}: Starter mode RANDOM offset (cycle #{cycle_number}) - "
                        f"waiting {wait_time/60:.2f} minutes before starting"
                    )
                    await asyncio.sleep(wait_time)
        
        client = TelegramClient(str(session_path), api_id, api_hash)
        
        try:
            await client.connect()
            
            if not await client.is_user_authorized():
                logger.error(f"Session {session_filename} not authorized")
                return {"success": 0, "failures": 0, "flood_waits": 0, "errors": ["Session not authorized"], "banned_sessions": [], "skipped_groups": 0}
            
            # Execute forwarding cycle with plan-specific behavior
            stats = await execute_forwarding_cycle(
                client,
                session_filename,
                post_link,
                assigned_groups,
                delay_between_posts,
                logger,
                is_running,
                execution_mode,
                cycle_number,
                error_tracker
            )
            
            # Increment cycle number after completion
            error_tracker.increment_cycle(session_filename)
            
            # Check for banned errors
            banned_sessions = []
            if stats.get("errors"):
                for error in stats["errors"]:
                    if "banned" in str(error).lower() or "ACCOUNT_BANNED" in str(error):
                        banned_sessions.append(session_filename)
            
            stats["banned_sessions"] = banned_sessions
            return stats
            
        except Exception as e:
            logger.error(f"Error in session {session_filename} cycle #{cycle_number}: {e}")
            banned_sessions = []
            if "banned" in str(e).lower():
                banned_sessions.append(session_filename)
            return {"success": 0, "failures": 0, "flood_waits": 0, "errors": [str(e)], "banned_sessions": banned_sessions, "skipped_groups": 0}
        finally:
            try:
                if client.is_connected():
                    await client.disconnect()
            except:
                pass
    finally:
        # Release semaphore
        if user_semaphore:
            user_semaphore.release()
