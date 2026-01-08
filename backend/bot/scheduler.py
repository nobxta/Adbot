"""
Scheduler - Loops through active users and executes cycles
ONE Python process handles all users
Fast loop (1-5s tick) with next_run_at timestamps
"""

import asyncio
import random
from typing import Dict, Optional, Any
from datetime import datetime, timedelta

from bot.data_manager import get_active_users, get_user_data
from bot.worker import execute_user_cycle
from bot.heartbeat_manager import emit_heartbeat, clear_heartbeat

# Per-user concurrency limit
MAX_CONCURRENT_SESSIONS_PER_USER = 7


class UserScheduler:
    """
    Schedules and executes cycles for active users
    Each user's cycle gap is calculated based on their plan type
    """
    
    def __init__(self, delay_between_cycles: int = 300):
        # Default delay (fallback for legacy/unknown plans)
        self.default_delay_between_cycles = delay_between_cycles
        self.running = False
        self.active_tasks: Dict[str, asyncio.Task] = {}
        self.user_locks: Dict[str, asyncio.Lock] = {}
        self.next_run_at: Dict[str, datetime] = {}
        # Per-user semaphore for concurrent session limits
        self.user_semaphores: Dict[str, asyncio.Semaphore] = {}
        # Per-user cycle gaps (plan-specific)
        self.user_cycle_gaps: Dict[str, int] = {}
    
    async def start(self):
        """Start the scheduler with fast loop"""
        self.running = True
        
        while self.running:
            try:
                # Fast tick (1-2 seconds)
                await asyncio.sleep(2)
                
                # Get active users
                active_user_ids = get_active_users()
                now = datetime.now()
                
                # Remove completed tasks and reset next_run_at with plan-specific cycle gaps
                completed_users = []
                for user_id, task in list(self.active_tasks.items()):
                    if task.done():
                        completed_users.append(user_id)
                        
                        # Calculate plan-specific cycle gap
                        user_data = get_user_data(user_id)
                        cycle_gap = self._calculate_user_cycle_gap(user_id, user_data)
                        
                        # Schedule next run with plan-specific gap
                        self.next_run_at[user_id] = now + timedelta(seconds=cycle_gap)
                        
                        # Emit heartbeat: cycle completed, now sleeping
                        emit_heartbeat(user_id, cycle_state="sleeping")
                
                for user_id in completed_users:
                    del self.active_tasks[user_id]
                
                # Check each active user for next run (exception-safe per user)
                for user_id in active_user_ids:
                    try:
                        # Check if user is still running
                        user_data = get_user_data(user_id)
                        if not user_data or user_data.get("bot_status") != "running":
                            # User stopped, clean up
                            if user_id in self.active_tasks:
                                self.active_tasks[user_id].cancel()
                                del self.active_tasks[user_id]
                            if user_id in self.next_run_at:
                                del self.next_run_at[user_id]
                            # Clear heartbeat when user stops
                            clear_heartbeat(user_id)
                            continue
                        
                        # CRITICAL: Check plan expiration - auto-stop bots with expired/inactive plans
                        # This prevents bots from running after plan expiration during runtime
                        stored_plan_status = user_data.get("plan_status")
                        if stored_plan_status in ["expired", "inactive"]:
                            # Plan expired/inactive - stop bot automatically
                            from bot.data_manager import update_user_data
                            try:
                                update_user_data(user_id, {"bot_status": "stopped"})
                                print(f"INFO: Auto-stopped bot for user {user_id} - plan status: {stored_plan_status}")
                            except Exception as e:
                                print(f"WARNING: Failed to auto-stop bot for user {user_id}: {e}")
                            
                            # Clean up scheduler state
                            if user_id in self.active_tasks:
                                self.active_tasks[user_id].cancel()
                                del self.active_tasks[user_id]
                            if user_id in self.next_run_at:
                                del self.next_run_at[user_id]
                            # Clear heartbeat when auto-stopped
                            clear_heartbeat(user_id)
                            continue
                        
                        # Check if it's time to run
                        next_run = self.next_run_at.get(user_id)
                        if next_run and now < next_run:
                            # Emit heartbeat during sleep period (keep it fresh)
                            emit_heartbeat(user_id, cycle_state="sleeping")
                            continue  # Not yet time
                        
                        # Check if already running
                        if user_id in self.active_tasks and not self.active_tasks[user_id].done():
                            continue  # Already running
                        
                        # Create lock for this user if not exists
                        if user_id not in self.user_locks:
                            self.user_locks[user_id] = asyncio.Lock()
                        
                        # Create semaphore for this user if not exists
                        if user_id not in self.user_semaphores:
                            self.user_semaphores[user_id] = asyncio.Semaphore(MAX_CONCURRENT_SESSIONS_PER_USER)
                        
                        # Emit heartbeat: starting cycle
                        emit_heartbeat(user_id, cycle_state="running")
                        
                        # Create task for this user
                        task = asyncio.create_task(
                            self._execute_user_with_lock(user_id)
                        )
                        self.active_tasks[user_id] = task
                    except Exception as e:
                        # Isolate per-user failures - log and continue with other users
                        print(f"ERROR: Failed to process user {user_id} in scheduler loop: {e}")
                        # Clean up this user's task if exists
                        if user_id in self.active_tasks:
                            try:
                                self.active_tasks[user_id].cancel()
                            except:
                                pass
                            del self.active_tasks[user_id]
                        continue  # Continue with next user
                
            except Exception as e:
                print(f"Error in scheduler loop: {e}")
                await asyncio.sleep(5)  # Wait a bit before retrying
    
    def _calculate_user_cycle_gap(self, user_id: str, user_data: Optional[Dict[str, Any]]) -> int:
        """
        Calculate cycle gap for a user based on their plan type
        Uses plan-specific timing constraints
        
        STARTER PLAN: All sessions wait the same gap (60-120 minutes)
        ENTERPRISE PLAN: Use base gap with variance (20-45 minutes)
        
        Args:
            user_id: User identifier
            user_data: User data dictionary (can be None)
        
        Returns:
            Cycle gap in seconds
        """
        if not user_data:
            return self.default_delay_between_cycles
        
        execution_mode = user_data.get("execution_mode", "enterprise")
        assigned_sessions = user_data.get("assigned_sessions", [])
        num_sessions = len(assigned_sessions)
        
        # Load groups from file based on plan type
        plan_type = "STARTER" if execution_mode == "starter" else "ENTERPRISE"
        try:
            from bot.group_file_manager import get_group_cache
            group_cache = get_group_cache()
            if execution_mode == "starter":
                groups = group_cache.get_starter_groups()
            else:
                groups = group_cache.get_enterprise_groups()
            num_groups = len(groups)
        except Exception as e:
            # Fallback to user_data groups if file loading fails
            groups = user_data.get("groups", [])
            num_groups = len(groups)
            if not groups:
                print(f"WARNING: Failed to load groups from file for user {user_id}: {e}")
        
        if num_sessions == 0:
            return self.default_delay_between_cycles
        
        # Import here to avoid circular imports
        from bot.plan_config import get_plan_timing_constraints
        
        try:
            # Get plan-specific constraints
            constraints = get_plan_timing_constraints(execution_mode, num_sessions, num_groups)
            
            if execution_mode == "starter":
                # Starter: Random gap within range (60-120 minutes)
                cycle_gap = random.randint(constraints["cycle_gap_min"], constraints["cycle_gap_max"])
            elif execution_mode == "enterprise":
                # Enterprise: Base gap (already randomized in get_enterprise_constraints)
                # Add slight variance to avoid synchronized cycles
                base_gap = constraints.get("base_cycle_gap", constraints["cycle_gap_min"])
                variance = random.randint(-constraints["cycle_gap_variance"], constraints["cycle_gap_variance"])
                cycle_gap = max(constraints["cycle_gap_min"], min(constraints["cycle_gap_max"], base_gap + variance))
            else:
                cycle_gap = self.default_delay_between_cycles
            
            # Cache the gap for this user
            self.user_cycle_gaps[user_id] = cycle_gap
            
            return cycle_gap
        except Exception as e:
            print(f"WARNING: Failed to calculate cycle gap for user {user_id}: {e}. Using default.")
            import traceback
            traceback.print_exc()
            return self.default_delay_between_cycles
    
    async def _execute_user_with_lock(self, user_id: str):
        """Execute user cycle with lock (prevents concurrent cycles for same user)
        Exception-safe: one user crash does NOT stop other users
        """
        lock = self.user_locks.get(user_id)
        if not lock:
            self.user_locks[user_id] = asyncio.Lock()
            lock = self.user_locks[user_id]
        
        try:
            async with lock:
                # Check if still running
                user_data = get_user_data(user_id)
                if not user_data or user_data.get("bot_status") != "running":
                    # Clear heartbeat if stopped
                    clear_heartbeat(user_id)
                    # Clean up cycle gap cache
                    if user_id in self.user_cycle_gaps:
                        del self.user_cycle_gaps[user_id]
                    return
                
                # Emit heartbeat: cycle running
                emit_heartbeat(user_id, cycle_state="running")
                
                # Execute cycle
                def is_running():
                    try:
                        user_data = get_user_data(user_id)
                        return user_data and user_data.get("bot_status") == "running"
                    except Exception:
                        return False
                
                try:
                    # Calculate cycle gap for this user (plan-specific)
                    cycle_gap = self._calculate_user_cycle_gap(user_id, user_data)
                    
                    # Scheduler triggers cycles - worker owns per-session timing
                    # The cycle_gap here is used as fallback/estimate, but worker
                    # calculates actual per-session gaps based on plan type
                    await execute_user_cycle(
                        user_id, 
                        is_running, 
                        cycle_gap,  # Pass plan-specific gap
                        self.user_semaphores.get(user_id)
                    )
                    # Emit heartbeat: cycle completed successfully
                    emit_heartbeat(user_id, cycle_state="idle")
                except Exception as e:
                    # Log and isolate - do NOT propagate to scheduler loop
                    print(f"ERROR: User {user_id} cycle failed: {e}")
                    import traceback
                    traceback.print_exc()
                    # Emit heartbeat even on error (worker is still alive)
                    emit_heartbeat(user_id, cycle_state="idle")
        except Exception as e:
            # Catch any lock-related or other errors - isolate this user
            print(f"ERROR: User {user_id} execution failed (lock/state error): {e}")
            import traceback
            traceback.print_exc()
            # Clear heartbeat on fatal error
            clear_heartbeat(user_id)
            # Clean up cycle gap cache
            if user_id in self.user_cycle_gaps:
                del self.user_cycle_gaps[user_id]
    
    async def stop(self):
        """Stop the scheduler gracefully"""
        self.running = False
        
        # Clear all heartbeats (all workers stopping)
        for user_id in list(self.active_tasks.keys()):
            clear_heartbeat(user_id)
        
        # Cancel all active tasks
        for task in self.active_tasks.values():
            task.cancel()
        
        # Wait for tasks to complete (with timeout)
        if self.active_tasks:
            await asyncio.wait(
                self.active_tasks.values(),
                timeout=30.0,
                return_when=asyncio.ALL_COMPLETED
            )
        
        self.active_tasks.clear()
        self.next_run_at.clear()
    
    def is_user_active(self, user_id: str) -> bool:
        """Check if user has an active task"""
        return user_id in self.active_tasks and not self.active_tasks[user_id].done()


# Global scheduler instance
_scheduler: Optional[UserScheduler] = None


async def start_scheduler(delay_between_cycles: int = 300):
    """Start the global scheduler"""
    global _scheduler
    
    if _scheduler and _scheduler.running:
        return
    
    _scheduler = UserScheduler(delay_between_cycles)
    await _scheduler.start()


async def stop_scheduler():
    """Stop the global scheduler"""
    global _scheduler
    
    if _scheduler:
        await _scheduler.stop()


def get_scheduler() -> Optional[UserScheduler]:
    """Get the global scheduler instance"""
    return _scheduler
