"""
API_ID / API_HASH Pool Manager
Manages API pairs with 7-session limit per pair
"""

import json
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from threading import Lock

API_PAIRS_FILE = Path(__file__).parent.parent / "data" / "api_pairs.json"
api_pairs_lock = Lock()

# Default API pairs (loaded from config)
DEFAULT_API_PAIRS: List[Dict[str, str]] = [
    {"api_id": "24881145", "api_hash": "d625c51e93f6b7367c1ff263cb5f7c89"},
    {"api_id": "25170767", "api_hash": "d512fd74809a4ca3cd59078eef73afcd"},
    {"api_id": "25847373", "api_hash": "b7ae3644130f9d51a589c757b92c0c22"},
    {"api_id": "26481096", "api_hash": "490e357d5a2d4dae14b23fa74087f17d"},
    {"api_id": "26666259", "api_hash": "e6530f4de21f2ee9add3ecc2ae52b44a"},
]

MAX_SESSIONS_PER_PAIR = 7


def load_api_pairs() -> List[Dict[str, str]]:
    """Load API pairs from file or use defaults"""
    if API_PAIRS_FILE.exists():
        try:
            with api_pairs_lock:
                with open(API_PAIRS_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    return data.get("pairs", DEFAULT_API_PAIRS)
        except Exception:
            pass
    return DEFAULT_API_PAIRS.copy()


def save_api_pairs(pairs: List[Dict[str, str]]):
    """Save API pairs to file"""
    try:
        with api_pairs_lock:
            API_PAIRS_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(API_PAIRS_FILE, 'w', encoding='utf-8') as f:
                json.dump({"pairs": pairs}, f, indent=2)
    except Exception as e:
        print(f"Error saving API pairs: {e}")


def get_pair_usage(session_assignments: Dict[str, Dict]) -> Dict[int, int]:
    """
    Calculate current usage per API pair
    Returns: {pair_index: session_count}
    """
    usage = {}
    pairs = load_api_pairs()
    
    for user_id, user_data in session_assignments.items():
        assigned_sessions = user_data.get("assigned_sessions", [])
        api_pairs = user_data.get("api_pairs", [])
        
        for pair_idx in api_pairs:
            if pair_idx < len(pairs):
                usage[pair_idx] = usage.get(pair_idx, 0) + 1
    
    return usage


def find_available_pair(session_assignments: Dict[str, Dict], num_sessions_needed: int) -> Optional[Tuple[int, Dict[str, str]]]:
    """
    Find an API pair that can accommodate the requested number of sessions
    Returns: (pair_index, pair_dict) or None
    """
    pairs = load_api_pairs()
    usage = get_pair_usage(session_assignments)
    
    # Find pair with enough capacity
    for idx, pair in enumerate(pairs):
        current_usage = usage.get(idx, 0)
        if current_usage + num_sessions_needed <= MAX_SESSIONS_PER_PAIR:
            return (idx, pair)
    
    return None


def assign_pair_to_sessions(session_assignments: Dict[str, Dict], user_id: str, num_sessions: int) -> List[int]:
    """
    Assign API pairs to user's sessions
    Returns: List of pair indices assigned
    """
    pairs = load_api_pairs()
    usage = get_pair_usage(session_assignments)
    assigned_pairs = []
    
    # Try to fit all sessions in one pair first
    for idx, pair in enumerate(pairs):
        current_usage = usage.get(idx, 0)
        remaining_capacity = MAX_SESSIONS_PER_PAIR - current_usage
        
        if remaining_capacity > 0:
            sessions_to_assign = min(num_sessions, remaining_capacity)
            for _ in range(sessions_to_assign):
                assigned_pairs.append(idx)
            num_sessions -= sessions_to_assign
            
            if num_sessions == 0:
                break
    
    # If still need more, spread across multiple pairs
    if num_sessions > 0:
        for idx, pair in enumerate(pairs):
            if idx not in assigned_pairs:  # Try different pairs
                current_usage = usage.get(idx, 0)
                remaining_capacity = MAX_SESSIONS_PER_PAIR - current_usage
                
                if remaining_capacity > 0:
                    sessions_to_assign = min(num_sessions, remaining_capacity)
                    for _ in range(sessions_to_assign):
                        assigned_pairs.append(idx)
                    num_sessions -= sessions_to_assign
                    
                    if num_sessions == 0:
                        break
    
    return assigned_pairs


def get_pair_for_session(session_filename: str, user_data: Dict) -> Optional[Dict[str, str]]:
    """Get API pair dict for a specific session"""
    pairs = load_api_pairs()
    api_pairs = user_data.get("api_pairs", [])
    
    if not api_pairs:
        return None
    
    # Get first pair (sessions are distributed across pairs)
    pair_idx = api_pairs[0]
    if pair_idx < len(pairs):
        return pairs[pair_idx]
    
    return None

