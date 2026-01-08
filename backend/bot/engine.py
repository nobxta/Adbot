"""
Shared AdBot Engine - Core forwarding logic
Used by all users (no duplication)
"""

import asyncio
import random
import re
from pathlib import Path
from typing import List, Dict, Tuple, Optional, Any
from telethon import TelegramClient
from telethon.errors import FloodWaitError, UserBannedInChannelError, ChatWriteForbiddenError
from telethon.tl.types import InputReplyToMessage


def parse_post_link(post_link: str) -> Tuple[str, int]:
    """
    Parse Telegram post link to extract channel and message ID
    Format: t.me/channel/123 or https://t.me/channel/123
    """
    link = post_link.replace('https://', '').replace('http://', '').strip()
    parts = link.split('/')
    if len(parts) >= 3:
        channel = parts[1]
        message_id = int(parts[2])
        return channel, message_id
    raise ValueError(f"Invalid post link format: {post_link}")


def extract_short_reason(error: Exception, max_length: int = 50) -> str:
    """Extract short error reason from exception"""
    error_str = str(error)
    if len(error_str) > max_length:
        return error_str[:max_length] + "..."
    return error_str


def distribute_groups_enterprise(groups: List[str], num_sessions: int) -> List[List[str]]:
    """
    ENTERPRISE MODE: Partition groups evenly across sessions
    Each session gets a UNIQUE subset, no overlap
    """
    if num_sessions == 0:
        return []
    
    groups_per_session = len(groups) // num_sessions
    remainder = len(groups) % num_sessions
    
    distribution = []
    start_idx = 0
    
    for i in range(num_sessions):
        count = groups_per_session + (1 if i < remainder else 0)
        distribution.append(groups[start_idx:start_idx + count])
        start_idx += count
    
    return distribution


def distribute_groups_starter(groups: List[str], num_sessions: int) -> List[List[str]]:
    """
    STARTER MODE: Each session gets ALL groups
    Groups are not partitioned, all sessions forward to all groups
    """
    if num_sessions == 0:
        return []
    
    # Each session gets the complete groups list
    return [groups.copy() for _ in range(num_sessions)]


def distribute_groups(groups: List[str], num_sessions: int, execution_mode: str = "enterprise") -> List[List[str]]:
    """
    Distribute groups based on execution mode
    
    Args:
        groups: List of group identifiers
        num_sessions: Number of sessions
        execution_mode: "starter" | "enterprise"
    
    Returns:
        List of group lists, one per session
    """
    if execution_mode == "starter":
        return distribute_groups_starter(groups, num_sessions)
    elif execution_mode == "enterprise":
        return distribute_groups_enterprise(groups, num_sessions)
    else:
        raise ValueError(f"Invalid execution_mode: {execution_mode}. Must be 'starter' or 'enterprise'")


def parse_group_with_topic(group: str) -> Tuple[str, Optional[int]]:
    """
    Parse group string to extract group_id and topic_id (if forum)
    Format: -1001234567890 or -1001234567890#123
    """
    if '#' in group:
        parts = group.split('#')
        group_id = parts[0].strip()
        try:
            topic_id = int(parts[1].strip())
            return group_id, topic_id
        except (ValueError, IndexError):
            return group_id, None
    return group.strip(), None


async def forward_to_group(
    client: TelegramClient,
    channel_username: str,
    message_id: int,
    group_identifier: str,
    logger
) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Forward a message to a specific group
    Returns: (success, group_name, error_reason)
    """
    group_name = None
    error_reason = None
    
    try:
        # Parse group to extract group_id and topic_id
        group_id_str, topic_id = parse_group_with_topic(group_identifier)
        
        # Ensure client is connected
        if not client.is_connected():
            await client.connect()
            if not await client.is_user_authorized():
                return (False, None, "Session not authorized")
        
        # Forward using raw ID (matches forwarder.py pattern)
        # Only -100xxxxx format is supported (Telegram supergroup IDs)
        if group_id_str.startswith('-100') and len(group_id_str) > 4 and group_id_str[4:].isdigit():
            group_id = int(group_id_str)
            
            # Try to get entity for logging
            try:
                target_entity = await client.get_entity(group_id)
                if hasattr(target_entity, 'title'):
                    group_name = target_entity.title
                elif hasattr(target_entity, 'username'):
                    group_name = f"@{target_entity.username}"
            except:
                pass
            
            # Forward message
            try:
                if topic_id is not None:
                    # Forum topic
                    result = await client.forward_messages(
                        entity=group_id,
                        messages=message_id,
                        from_peer=channel_username,
                        reply_to=InputReplyToMessage(
                            reply_to_top_id=topic_id,
                            reply_to_msg_id=0
                        )
                    )
                else:
                    # Normal group
                    result = await client.forward_messages(
                        entity=group_id,
                        messages=message_id,
                        from_peer=channel_username
                    )
                
                return (True, group_name or str(group_id), None)
                
            except FloodWaitError as fw_error:
                error_reason = f"FLOODWAIT ({fw_error.seconds}s)"
                raise
            except UserBannedInChannelError:
                error_reason = "ACCOUNT_BANNED"
                raise
            except ChatWriteForbiddenError:
                error_reason = "WRITE_FORBIDDEN"
                raise
            except Exception as e:
                error_str = str(e).lower()
                if "banned" in error_str:
                    error_reason = "Account is banned"
                elif "write" in error_str and "permission" in error_str:
                    error_reason = "No write permission"
                elif "entity" in error_str and "not found" in error_str:
                    error_reason = "Group not found"
                else:
                    error_reason = extract_short_reason(e)
                raise
        else:
            # Username format - resolve entity first
            try:
                target_entity = await client.get_entity(group_identifier)
                if hasattr(target_entity, 'title'):
                    group_name = target_entity.title
                elif hasattr(target_entity, 'username'):
                    group_name = f"@{target_entity.username}"
                
                message = await client.get_messages(channel_username, ids=message_id)
                if not message:
                    return (False, group_name, "Message not found")
                
                result = await client.forward_messages(target_entity, message)
                return (True, group_name or group_identifier, None)
            except Exception as e:
                error_reason = extract_short_reason(e)
                return (False, group_name or group_identifier, error_reason)
        
    except FloodWaitError as fw_error:
        error_reason = error_reason or f"FLOODWAIT ({fw_error.seconds}s)"
        if logger:
            logger.warning(f"FloodWait for {group_identifier}: {fw_error.seconds}s")
        return (False, group_name, error_reason)
    except UserBannedInChannelError:
        error_reason = error_reason or "ACCOUNT_BANNED"
        if logger:
            logger.error(f"Account banned while forwarding to {group_identifier}")
        return (False, group_name, error_reason)
    except ChatWriteForbiddenError:
        error_reason = error_reason or "WRITE_FORBIDDEN"
        if logger:
            logger.warning(f"Write forbidden for {group_identifier}")
        return (False, group_name, error_reason)
    except Exception as e:
        error_reason = error_reason or extract_short_reason(e)
        if logger:
            logger.error(f"Failed to forward to {group_identifier}: {error_reason}")
        return (False, group_name, error_reason)


async def execute_forwarding_cycle(
    client: TelegramClient,
    session_name: str,
    post_link: str,
    assigned_groups: List[str],
    delay_between_posts: float,
    logger,
    is_running: callable,
    execution_mode: str = "enterprise",
    cycle_number: int = 0,
    error_tracker=None,
    on_success: callable = None,
    on_failure: callable = None
) -> Dict[str, Any]:
    """
    Execute one forwarding cycle for a user's session
    Implements plan-specific behavior:
    - STARTER: All sessions post to all groups, duplicates allowed
    - ENTERPRISE: Each session posts only to assigned groups, no duplicates
    - Error tracking: Skip groups after 2+ errors for that session
    
    Args:
        client: Telethon client
        session_name: Session identifier
        post_link: Telegram post link
        assigned_groups: Groups assigned to this session
        delay_between_posts: Delay in seconds (already calculated based on plan)
        logger: Logger instance
        is_running: Callable to check if still running
        execution_mode: "starter" | "enterprise"
        cycle_number: Current cycle number for this session
        error_tracker: ErrorTracker instance for per-session error tracking
        on_success: Optional callback on success
        on_failure: Optional callback on failure
    
    Returns: cycle stats
    """
    from bot.error_tracker import get_error_tracker
    
    if error_tracker is None:
        error_tracker = get_error_tracker()
    
    stats = {
        "success": 0,
        "failures": 0,
        "flood_waits": 0,
        "errors": [],
        "skipped_groups": 0
    }
    
    try:
        # Parse post link
        channel_username, message_id = parse_post_link(post_link)
        
        if logger:
            logger.info(
                f"[{session_name}] Starting cycle #{cycle_number} ({execution_mode.upper()} mode): "
                f"{len(assigned_groups)} groups"
            )
        
        # Filter out skipped groups
        active_groups = []
        for group in assigned_groups:
            if error_tracker.should_skip_group(session_name, group, cycle_number):
                stats["skipped_groups"] += 1
                if logger:
                    logger.debug(f"[{session_name}] Skipping group {group} (2+ errors, retry after N cycles)")
                continue
            active_groups.append(group)
        
        if stats["skipped_groups"] > 0:
            logger.info(
                f"[{session_name}] Cycle #{cycle_number}: Skipping {stats['skipped_groups']} groups "
                f"due to errors, processing {len(active_groups)} active groups"
            )
        
        # Forward to each active group
        for group_idx, group in enumerate(active_groups, 1):
            if not is_running():
                break
            
            try:
                # Forward message
                success, group_name, error_reason = await forward_to_group(
                    client, channel_username, message_id, group, logger
                )
                
                if success:
                    stats["success"] += 1
                    # Record success - reset error count
                    error_tracker.record_success(session_name, group)
                    
                    if logger:
                        logger.info(
                            f"[{session_name}] Cycle #{cycle_number} [{group_idx}/{len(active_groups)}] "
                            f"✓ Forwarded to {group_name or group}"
                        )
                    if on_success:
                        on_success(session_name, group, group_name)
                else:
                    stats["failures"] += 1
                    # Record error
                    error_tracker.record_error(session_name, group)
                    error_count = error_tracker.get_error_count(session_name, group)
                    
                    if "FLOODWAIT" in (error_reason or ""):
                        stats["flood_waits"] += 1
                    
                    if logger:
                        logger.warning(
                            f"[{session_name}] Cycle #{cycle_number} [{group_idx}/{len(active_groups)}] "
                            f"✗ Failed to {group_name or group}: {error_reason} "
                            f"(errors: {error_count}/2)"
                        )
                    
                    # If 2+ errors, mark for skipping
                    if error_count >= 2:
                        error_tracker.mark_group_skipped(session_name, group, retry_after_cycles=3)
                        if logger:
                            logger.warning(
                                f"[{session_name}] Group {group_name or group} marked for skipping "
                                f"(2+ errors). Will retry after 3 cycles."
                            )
                    
                    if on_failure:
                        on_failure(session_name, group, group_name, error_reason)
                    
                    # Handle specific errors
                    if error_reason == "ACCOUNT_BANNED":
                        # Stop immediately if banned
                        raise Exception("Account banned")
                
                # Delay between posts (plan-specific delay already calculated)
                await asyncio.sleep(delay_between_posts)
                
            except Exception as e:
                if "banned" in str(e).lower():
                    raise  # Re-raise banned errors
                
                stats["failures"] += 1
                error_tracker.record_error(session_name, group)
                error_count = error_tracker.get_error_count(session_name, group)
                
                error_str = str(e)
                stats["errors"].append(error_str)
                
                if logger:
                    logger.error(
                        f"[{session_name}] Cycle #{cycle_number} [{group_idx}/{len(active_groups)}] "
                        f"Error forwarding to {group}: {error_str} (errors: {error_count}/2)"
                    )
                
                # If 2+ errors, mark for skipping
                if error_count >= 2:
                    error_tracker.mark_group_skipped(session_name, group, retry_after_cycles=3)
                
                continue
        
        if logger:
            logger.info(
                f"[{session_name}] Cycle #{cycle_number} complete: "
                f"{stats['success']} success, {stats['failures']} failures, "
                f"{stats['skipped_groups']} skipped"
            )
        
    except Exception as e:
        if logger:
            logger.error(f"[{session_name}] Cycle #{cycle_number} error: {e}")
        stats["errors"].append(str(e))
    
    return stats

