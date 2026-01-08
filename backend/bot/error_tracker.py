"""
Error Tracker - Track errors per (session, group) pair
Implements skipping logic: skip group after 2+ errors for that session
"""

from typing import Dict, Set, Tuple
from collections import defaultdict
import threading


class ErrorTracker:
    """
    Track errors per (session, group) pair
    Thread-safe for concurrent session execution
    """
    
    def __init__(self):
        # Structure: {(session_name, group_id): error_count}
        self._error_counts: Dict[Tuple[str, str], int] = {}
        self._lock = threading.Lock()
        # Structure: {(session_name, group_id): skip_until_cycle}
        self._skipped_groups: Dict[Tuple[str, str], int] = {}
        # Current cycle number per session
        self._session_cycles: Dict[str, int] = {}
    
    def record_error(self, session_name: str, group_id: str) -> None:
        """Record an error for a (session, group) pair"""
        key = (session_name, group_id)
        with self._lock:
            self._error_counts[key] = self._error_counts.get(key, 0) + 1
    
    def record_success(self, session_name: str, group_id: str) -> None:
        """Record a success - reset error count (but don't unskip if already skipped)"""
        key = (session_name, group_id)
        with self._lock:
            # Reset error count on success
            if key in self._error_counts:
                self._error_counts[key] = 0
    
    def should_skip_group(self, session_name: str, group_id: str, current_cycle: int) -> bool:
        """
        Check if a group should be skipped for this session
        
        Args:
            session_name: Session identifier
            group_id: Group identifier
            current_cycle: Current cycle number for this session
        
        Returns:
            True if group should be skipped
        """
        key = (session_name, group_id)
        with self._lock:
            error_count = self._error_counts.get(key, 0)
            
            # If 2+ errors, skip this group
            if error_count >= 2:
                # Check if it's still in skip period (retry after N cycles)
                skip_until = self._skipped_groups.get(key, 0)
                if current_cycle < skip_until:
                    return True
                
                # Retry period expired - reset and allow retry
                if skip_until > 0:
                    # Reset error count and allow retry
                    self._error_counts[key] = 0
                    del self._skipped_groups[key]
                    return False
            
            return False
    
    def mark_group_skipped(self, session_name: str, group_id: str, retry_after_cycles: int = 3) -> None:
        """
        Mark a group as skipped for this session
        
        Args:
            session_name: Session identifier
            group_id: Group identifier
            retry_after_cycles: Number of cycles to wait before retrying (default: 3)
        """
        key = (session_name, group_id)
        with self._lock:
            current_cycle = self._session_cycles.get(session_name, 0)
            self._skipped_groups[key] = current_cycle + retry_after_cycles
    
    def get_current_cycle(self, session_name: str) -> int:
        """Get current cycle number for a session"""
        with self._lock:
            return self._session_cycles.get(session_name, 0)
    
    def increment_cycle(self, session_name: str) -> None:
        """Increment cycle number for a session"""
        with self._lock:
            self._session_cycles[session_name] = self._session_cycles.get(session_name, 0) + 1
    
    def get_error_count(self, session_name: str, group_id: str) -> int:
        """Get error count for a (session, group) pair"""
        key = (session_name, group_id)
        with self._lock:
            return self._error_counts.get(key, 0)
    
    def reset_session(self, session_name: str) -> None:
        """Reset all tracking for a session (when bot stops)"""
        with self._lock:
            # Remove all entries for this session
            keys_to_remove = [k for k in self._error_counts.keys() if k[0] == session_name]
            for key in keys_to_remove:
                del self._error_counts[key]
            
            keys_to_remove = [k for k in self._skipped_groups.keys() if k[0] == session_name]
            for key in keys_to_remove:
                del self._skipped_groups[key]
            
            if session_name in self._session_cycles:
                del self._session_cycles[session_name]


# Global error tracker instance
_global_error_tracker = ErrorTracker()


def get_error_tracker() -> ErrorTracker:
    """Get the global error tracker instance"""
    return _global_error_tracker

