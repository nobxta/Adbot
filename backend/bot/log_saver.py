"""
Log Saver - Per-user logging
Logs stored in logs/{user_id}/YYYY-MM-DD.log
"""

import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any
from threading import Lock

LOGS_BASE = Path(__file__).parent.parent / "logs"
log_lock = Lock()


def get_user_logger(user_id: str) -> logging.Logger:
    """Get logger for a specific user"""
    ensure_user_log_dir(user_id)
    
    logger_name = f"adbot_user_{user_id}"
    logger = logging.getLogger(logger_name)
    
    # Avoid adding handlers multiple times
    if logger.handlers:
        return logger
    
    logger.setLevel(logging.INFO)
    
    # Get today's log file
    today = datetime.now().strftime("%Y-%m-%d")
    log_file = LOGS_BASE / user_id / f"{today}.log"
    
    # File handler
    file_handler = logging.FileHandler(log_file, encoding='utf-8')
    file_handler.setLevel(logging.INFO)
    
    # Format
    formatter = logging.Formatter(
        '%(asctime)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(formatter)
    
    logger.addHandler(file_handler)
    logger.propagate = False  # Don't propagate to root logger
    
    return logger


def ensure_user_log_dir(user_id: str):
    """Ensure user's log directory exists"""
    user_log_dir = LOGS_BASE / user_id
    user_log_dir.mkdir(parents=True, exist_ok=True)


def get_user_logs(user_id: str, date: Optional[str] = None, lines: int = 100) -> str:
    """Get user's logs for a specific date (default: today)"""
    if date is None:
        date = datetime.now().strftime("%Y-%m-%d")
    
    log_file = LOGS_BASE / user_id / f"{date}.log"
    
    if not log_file.exists():
        return ""
    
    try:
        with open(log_file, 'r', encoding='utf-8') as f:
            all_lines = f.readlines()
            last_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines
            return "".join(last_lines)
    except Exception:
        return ""


def list_user_log_files(user_id: str) -> List[Dict[str, any]]:
    """List all log files for a user"""
    user_log_dir = LOGS_BASE / user_id
    
    if not user_log_dir.exists():
        return []
    
    log_files = []
    for log_file in sorted(user_log_dir.glob("*.log"), reverse=True):
        stat = log_file.stat()
        log_files.append({
            "filename": log_file.name,
            "size": stat.st_size,
            "modified": stat.st_mtime,
            "path": str(log_file.relative_to(LOGS_BASE))
        })
    
    return log_files

