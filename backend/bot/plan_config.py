"""
Plan Configuration - Timing constraints and behavior rules based on plan type
Defines how STARTER and ENTERPRISE plans differ in forwarding behavior
"""

from typing import Tuple, Dict, Any
import random


def get_plan_timing_constraints(execution_mode: str, num_sessions: int, num_groups: int) -> Dict[str, Any]:
    """
    Get timing constraints based on plan type and configuration
    
    Args:
        execution_mode: "starter" | "enterprise"
        num_sessions: Number of sessions
        num_groups: Number of groups
    
    Returns:
        Dictionary with timing constraints
    """
    if execution_mode == "starter":
        return get_starter_constraints(num_sessions, num_groups)
    elif execution_mode == "enterprise":
        return get_enterprise_constraints(num_sessions, num_groups)
    else:
        raise ValueError(f"Invalid execution_mode: {execution_mode}")


def get_starter_constraints(num_sessions: int, num_groups: int) -> Dict[str, Any]:
    """
    STARTER PLAN timing constraints:
    - Per-message delay: 30-60 seconds
    - Cycle gap: 60-120 minutes (randomized per cycle)
    - Total window: 60 minutes (for random start offsets)
    - Single session >100 groups: Increase delays and cycle gap
    """
    # Single session edge case handling
    if num_sessions == 1 and num_groups > 100:
        return {
            "per_message_delay_min": 45,  # Increased delay
            "per_message_delay_max": 90,  # Increased delay
            "cycle_gap_min": 120 * 60,  # 2 hours (increased)
            "cycle_gap_max": 180 * 60,  # 3 hours (increased)
            "total_window_minutes": 60,  # Window for random offsets
            "high_load_warning": True,  # Flag for logging
        }
    
    return {
        "per_message_delay_min": 30,
        "per_message_delay_max": 60,
        "cycle_gap_min": 60 * 60,  # 60 minutes in seconds
        "cycle_gap_max": 120 * 60,  # 120 minutes in seconds
        "total_window_minutes": 60,  # Total window for random start offsets
        "high_load_warning": False,
    }


def get_enterprise_constraints(num_sessions: int, num_groups: int) -> Dict[str, Any]:
    """
    ENTERPRISE PLAN timing constraints:
    - Per-message delay: 15-30 seconds (faster)
    - Cycle gap: 20-45 minutes (shorter)
    - Each session can have slightly different gap (+5 minutes variance)
    - No startup stagger needed (groups are partitioned)
    """
    base_cycle_gap = random.randint(20 * 60, 45 * 60)  # Base gap in seconds
    
    return {
        "per_message_delay_min": 15,
        "per_message_delay_max": 30,
        "cycle_gap_min": 20 * 60,  # 20 minutes in seconds
        "cycle_gap_max": 45 * 60,  # 45 minutes in seconds
        "base_cycle_gap": base_cycle_gap,  # Fixed base for this calculation
        "cycle_gap_variance": 5 * 60,  # ±5 minutes variance per session
        "startup_stagger_min": 0,  # No stagger needed (groups partitioned)
        "startup_stagger_max": 0,
        "high_load_warning": False,
    }


def calculate_per_session_cycle_gap(
    execution_mode: str, 
    session_index: int, 
    num_sessions: int
) -> int:
    """
    Calculate cycle gap for a specific session
    
    Args:
        execution_mode: "starter" | "enterprise"
        session_index: Index of the session (0-based)
        num_sessions: Total number of sessions
    
    Returns:
        Cycle gap in seconds
    """
    if execution_mode == "starter":
        constraints = get_starter_constraints(num_sessions, 0)  # num_groups not needed for gap calculation
        # Starter: Same gap for all sessions (randomized)
        return random.randint(constraints["cycle_gap_min"], constraints["cycle_gap_max"])
    
    elif execution_mode == "enterprise":
        constraints = get_enterprise_constraints(num_sessions, 0)
        # Enterprise: Base gap with variance per session
        variance = random.randint(
            -constraints["cycle_gap_variance"],
            constraints["cycle_gap_variance"]
        )
        base_gap = constraints["base_cycle_gap"]
        # Ensure gap stays within min/max bounds
        gap = base_gap + variance
        gap = max(constraints["cycle_gap_min"], min(constraints["cycle_gap_max"], gap))
        return gap
    
    else:
        raise ValueError(f"Invalid execution_mode: {execution_mode}")


def calculate_per_message_delay(
    execution_mode: str,
    num_sessions: int,
    num_groups: int
) -> float:
    """
    Calculate per-message delay based on plan type
    
    Args:
        execution_mode: "starter" | "enterprise"
        num_sessions: Number of sessions
        num_groups: Number of groups
    
    Returns:
        Delay in seconds
    """
    constraints = get_plan_timing_constraints(execution_mode, num_sessions, num_groups)
    delay = random.uniform(
        constraints["per_message_delay_min"],
        constraints["per_message_delay_max"]
    )
    return delay


def calculate_random_start_offset(
    execution_mode: str,
    session_index: int,
    num_sessions: int,
    num_groups: int
) -> float:
    """
    Calculate RANDOM start offset for a session within the total window (starter mode only)
    
    STARTER PLAN: Each session chooses a RANDOM offset within the total window
    This ensures sessions do NOT post in synchronized patterns
    
    Args:
        execution_mode: "starter" | "enterprise"
        session_index: Index of the session (0-based)
        num_sessions: Total number of sessions
        num_groups: Number of groups
    
    Returns:
        Random offset in seconds (0 for enterprise)
    """
    if execution_mode != "starter":
        return 0.0
    
    constraints = get_starter_constraints(num_sessions, num_groups)
    total_window_seconds = constraints["total_window_minutes"] * 60
    
    # Each session gets a RANDOM offset within the window
    # This ensures no synchronized posting patterns
    random_offset = random.uniform(0, total_window_seconds)
    
    return random_offset

