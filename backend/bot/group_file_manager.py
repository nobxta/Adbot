"""
Group File Manager - Loads groups from .txt files
Supports STARTER and ENTERPRISE plan group files
"""

from pathlib import Path
from typing import List, Optional
import os
from datetime import datetime


# Group file paths
GROUPS_DIR = Path(__file__).parent.parent / "data" / "groups"
STARTER_GROUPS_FILE = GROUPS_DIR / "starter_groups.txt"
ENTERPRISE_GROUPS_FILE = GROUPS_DIR / "enterprise_groups.txt"


def ensure_groups_dir():
    """Ensure groups directory exists"""
    GROUPS_DIR.mkdir(parents=True, exist_ok=True)
    
    # Create empty files if they don't exist
    if not STARTER_GROUPS_FILE.exists():
        STARTER_GROUPS_FILE.write_text("", encoding="utf-8")
    
    if not ENTERPRISE_GROUPS_FILE.exists():
        ENTERPRISE_GROUPS_FILE.write_text("", encoding="utf-8")


def parse_group_file(file_path: Path) -> List[str]:
    """
    Parse group file - one numeric group ID per line
    
    Args:
        file_path: Path to group file
    
    Returns:
        List of numeric group IDs (as strings)
    
    Raises:
        ValueError: If file contains invalid group IDs
    """
    if not file_path.exists():
        return []
    
    groups = []
    with open(file_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            
            # Skip empty lines and comments
            if not line or line.startswith('#'):
                continue
            
            # Validate: Must be -100xxxxx format (Telegram supergroup ID)
            # Format: -1001234567890 (must start with -100 and be followed by digits)
            if not line.startswith('-100'):
                raise ValueError(
                    f"Invalid group ID at line {line_num} in {file_path.name}: "
                    f"'{line}' - must start with -100 (e.g., -1001234567890)"
                )
            
            # Check that after -100, there are only digits
            numeric_part = line[4:]  # Everything after -100
            if not numeric_part or not numeric_part.isdigit():
                raise ValueError(
                    f"Invalid group ID at line {line_num} in {file_path.name}: "
                    f"'{line}' - must be in format -100 followed by digits (e.g., -1001234567890)"
                )
            
            # Ensure minimum length (at least -100 + some digits)
            if len(line) < 7:  # -100 + at least 3 digits
                raise ValueError(
                    f"Invalid group ID at line {line_num} in {file_path.name}: "
                    f"'{line}' - too short, must be at least -100xxx"
                )
            
            groups.append(line)
    
    return groups


def get_groups_for_plan(plan_type: str) -> List[str]:
    """
    Get groups for a specific plan type
    
    Args:
        plan_type: "STARTER" | "ENTERPRISE"
    
    Returns:
        List of numeric group IDs
    """
    ensure_groups_dir()
    
    if plan_type == "STARTER":
        return parse_group_file(STARTER_GROUPS_FILE)
    elif plan_type == "ENTERPRISE":
        return parse_group_file(ENTERPRISE_GROUPS_FILE)
    else:
        raise ValueError(f"Invalid plan_type: {plan_type}. Must be 'STARTER' or 'ENTERPRISE'")


def get_file_modification_time(file_path: Path) -> Optional[float]:
    """Get file modification time"""
    if not file_path.exists():
        return None
    return os.path.getmtime(file_path)


class GroupFileCache:
    """
    Cache for group files with modification time tracking
    Enables reloading when files change
    """
    
    def __init__(self):
        self._starter_groups: List[str] = []
        self._enterprise_groups: List[str] = []
        self._starter_mtime: Optional[float] = None
        self._enterprise_mtime: Optional[float] = None
    
    def get_starter_groups(self, force_reload: bool = False) -> List[str]:
        """Get starter groups, reloading if file changed"""
        ensure_groups_dir()
        
        current_mtime = get_file_modification_time(STARTER_GROUPS_FILE)
        
        if force_reload or current_mtime != self._starter_mtime:
            self._starter_groups = parse_group_file(STARTER_GROUPS_FILE)
            self._starter_mtime = current_mtime
        
        return self._starter_groups.copy()
    
    def get_enterprise_groups(self, force_reload: bool = False) -> List[str]:
        """Get enterprise groups, reloading if file changed"""
        ensure_groups_dir()
        
        current_mtime = get_file_modification_time(ENTERPRISE_GROUPS_FILE)
        
        if force_reload or current_mtime != self._enterprise_mtime:
            self._enterprise_groups = parse_group_file(ENTERPRISE_GROUPS_FILE)
            self._enterprise_mtime = current_mtime
        
        return self._enterprise_groups.copy()
    
    def check_file_changed(self, plan_type: str) -> bool:
        """Check if group file has been modified"""
        ensure_groups_dir()
        
        if plan_type == "STARTER":
            current_mtime = get_file_modification_time(STARTER_GROUPS_FILE)
            return current_mtime != self._starter_mtime
        elif plan_type == "ENTERPRISE":
            current_mtime = get_file_modification_time(ENTERPRISE_GROUPS_FILE)
            return current_mtime != self._enterprise_mtime
        else:
            return False


# Global cache instance
_global_cache = GroupFileCache()


def get_group_cache() -> GroupFileCache:
    """Get the global group file cache"""
    return _global_cache

