import asyncio
import json
import logging
import re
import random
import threading
import signal
import sys
import traceback
import zipfile
import shutil
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any, Union
from datetime import datetime, timedelta, time as dt_time
from collections import defaultdict
try:
    import pytz  # type: ignore[reportMissingImports]
except ImportError:
    pytz = None  # pytz is optional, only needed for timezone operations
from concurrent.futures import ThreadPoolExecutor
from multiprocessing import Process, Manager, Queue, Event as MPEvent

# Fix Windows Unicode encoding for stdout/stderr
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except (AttributeError, ValueError):
        pass

from telethon import TelegramClient, events
from telethon.errors import RPCError, UserDeactivatedError, UserDeactivatedBanError, ChatWriteForbiddenError, UserRestrictedError, FloodWaitError, AuthKeyUnregisteredError, SessionPasswordNeededError
from telethon.errors.rpcerrorlist import UserBannedInChannelError, ChatRestrictedError
from telethon.tl.types import Channel, Chat, User, PeerChannel, InputPeerChannel, InputPeerChat, InputPeerUser, InputChatlistDialogFilter, InputReplyToMessage
from telethon.tl.functions.messages import ImportChatInviteRequest
from telethon.tl.functions.channels import JoinChannelRequest, GetForumTopicsRequest
from telethon.tl.functions.chatlists import CheckChatlistInviteRequest, JoinChatlistInviteRequest, LeaveChatlistRequest
from telethon.tl.functions.messages import GetDialogFiltersRequest
from telethon.tl.types import DialogFilterDefault
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, Bot
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes, MessageHandler, filters
from telegram.error import TelegramError, RetryAfter, TimedOut
from telegram.constants import ChatAction
import os

# Global state
is_running = threading.Event()
is_running.clear()  # Not running by default
config_lock = threading.Lock()
config_data = None
clients = []
forwarding_task = None
worker_task = None
start_time = datetime.now()
controller_app = None
shutdown_event = None  # Will be created in main() after PTB Application loop is running

# Explicit conversation states
WAITING_FOR_POST_LINK = "waiting_for_post_link"
WAITING_FOR_CHATLIST_LINKS = "waiting_for_chatlist_links"

# Stats tracking
stats_lock = threading.Lock()
STATS_FILE = Path("stats.json")
stats = {
    'bot_start_time': None,
    'bot_stop_time': None,
    'uptime_start': None,
    'total_uptime_seconds': 0,
    'accounts': defaultdict(lambda: {
        'success': 0,
        'failures': 0,
        'flood_waits': 0,
        'banned': False,
        'frozen': False,
        'last_activity': None,
        'last_error': None,
        'suspicious_activity': [],
        'total_messages_sent': 0,
        'response_times': [],  # List of response times in seconds
        'avg_response_time': 0.0,
        'fastest_response': None,
        'slowest_response': None,
        'error_types': defaultdict(int)
    }),
    'groups': defaultdict(lambda: {
        'success': 0,
        'failures': 0,
        'last_post': None,
        'consecutive_failures': 0
    }),
    'total_posts': 0,
    'total_success': 0,
    'total_failures': 0,
    'total_flood_waits': 0,
    'total_messages_sent': 0,
    'session_history': []  # Track start/stop sessions
}

# Load stats from file if exists
def load_stats():
    """Load stats from file"""
    global stats
    if STATS_FILE.exists():
        try:
            with open(STATS_FILE, 'r', encoding='utf-8') as f:
                saved_stats = json.load(f)
                # Convert datetime strings back to datetime objects where needed
                if saved_stats.get('bot_start_time'):
                    saved_stats['bot_start_time'] = datetime.fromisoformat(saved_stats['bot_start_time'])
                if saved_stats.get('bot_stop_time'):
                    saved_stats['bot_stop_time'] = datetime.fromisoformat(saved_stats['bot_stop_time'])
                if saved_stats.get('uptime_start'):
                    saved_stats['uptime_start'] = datetime.fromisoformat(saved_stats['uptime_start'])
                # Merge with defaults
                for key in stats:
                    if key not in saved_stats:
                        saved_stats[key] = stats[key]
                stats.update(saved_stats)
        except Exception as e:
            logger.error(f"Error loading stats: {e}")

# Save stats to file
def save_stats():
    """Save stats to file"""
    try:
        stats_to_save = {}
        for key, value in stats.items():
            if key == 'accounts':
                stats_to_save[key] = {}
                for acc_num, acc_data in value.items():
                    acc_dict = dict(acc_data)
                    # Convert datetime to string
                    if acc_dict.get('last_activity'):
                        acc_dict['last_activity'] = acc_dict['last_activity'].isoformat()
                    stats_to_save[key][acc_num] = acc_dict
            elif key == 'groups':
                stats_to_save[key] = {}
                for group_name, group_data in value.items():
                    group_dict = dict(group_data)
                    if group_dict.get('last_post'):
                        group_dict['last_post'] = group_dict['last_post'].isoformat()
                    stats_to_save[key][group_name] = group_dict
            elif isinstance(value, datetime):
                stats_to_save[key] = value.isoformat()
            else:
                stats_to_save[key] = value
        
        with open(STATS_FILE, 'w', encoding='utf-8') as f:
            json.dump(stats_to_save, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Error saving stats: {e}")

# Load stats on startup
load_stats()

# Setup logging
log_dir = Path("logs")
log_dir.mkdir(exist_ok=True)
# Fix Windows Unicode encoding - force UTF-8 for file handler
file_handler = logging.FileHandler(
    log_dir / f"adbot_{datetime.now().strftime('%Y%m%d')}.log",
    encoding='utf-8'
)
stream_handler = logging.StreamHandler()
# Ensure StreamHandler uses UTF-8 encoding (works with reconfigured stdout/stderr)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[file_handler, stream_handler]
)
logger = logging.getLogger(__name__)
# Suppress Telethon verbose logs at startup
logging.getLogger('telethon').setLevel(logging.WARNING)


def load_config() -> dict:
    """Load configuration from config.json"""
    global config_data
    with open("config.json", "r", encoding="utf-8") as f:
        config_data = json.load(f)
    return config_data


def save_config():
    """Save configuration to config.json - SYNC function for use with asyncio.to_thread"""
    global config_data
    with config_lock:
        with open("config.json", "w", encoding="utf-8") as f:
            json.dump(config_data, f, indent=2, ensure_ascii=False)


def _save_post_links_sync(config_path: str, post_link_value) -> None:
    """Synchronous helper to save post links to config.json - runs in thread"""
    try:
        # Load current config
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
        
        # Update post_link
        config["post_link"] = post_link_value
        
        # Save immediately
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        
        # Update global config_data if it exists
        global config_data
        if config_data is not None:
            config_data["post_link"] = post_link_value
    except Exception as e:
        # Re-raise to be caught by caller
        raise


async def save_post_links_async(post_link_value) -> None:
    """Async wrapper to save post links without blocking event loop"""
    await asyncio.to_thread(_save_post_links_sync, "config.json", post_link_value)


def load_groups() -> List[str]:
    """Load groups from groups.txt (default file)"""
    groups = []
    filename = "groups.txt"
    if Path(filename).exists():
        try:
            with open(filename, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#"):
                        groups.append(line)
        except Exception as e:
            logger.error(f"Error loading {filename}: {e}")
    return groups


def save_groups(groups: List[str]) -> bool:
    """Save groups to groups.txt (default file)"""
    try:
        with open("groups.txt", "w", encoding="utf-8") as f:
            for group in groups:
                f.write(f"{group}\n")
        return True
    except Exception as e:
        logger.error(f"Error saving groups: {e}")
        return False


def get_session_files() -> List[Path]:
    """Auto-detect all .session files in sessions/ directory"""
    sessions_dir = Path("sessions")
    sessions_dir.mkdir(exist_ok=True)
    session_files = list(sessions_dir.glob("*.session"))
    logger.info(f"Found {len(session_files)} session files")
    return session_files


# Session Registry System (sessions.json)
SESSIONS_REGISTRY_FILE = Path("sessions.json")
sessions_registry_lock = threading.Lock()


def load_sessions_registry() -> Dict[str, Dict[str, Any]]:
    """Load sessions registry from sessions.json"""
    if not SESSIONS_REGISTRY_FILE.exists():
        return {}
    
    try:
        with sessions_registry_lock:
            with open(SESSIONS_REGISTRY_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # Validate structure
                if not isinstance(data, dict):
                    logger.warning("sessions.json is corrupted, recreating...")
                    return {}
                return data
    except json.JSONDecodeError:
        logger.warning("sessions.json is corrupted, recreating...")
        return {}
    except Exception as e:
        logger.error(f"Error loading sessions.json: {e}")
        return {}


def save_sessions_registry(registry: Dict[str, Dict[str, Any]]) -> bool:
    """Save sessions registry to sessions.json (atomic write)"""
    try:
        # Atomic write: write to temp file, then rename
        temp_file = SESSIONS_REGISTRY_FILE.with_suffix('.json.tmp')
        with sessions_registry_lock:
            with open(temp_file, 'w', encoding='utf-8') as f:
                json.dump(registry, f, indent=2, ensure_ascii=False)
            # Atomic rename (works on Windows too)
            temp_file.replace(SESSIONS_REGISTRY_FILE)
        return True
    except Exception as e:
        logger.error(f"Error saving sessions.json: {e}")
        try:
            if temp_file.exists():
                temp_file.unlink()
        except:
            pass
        return False


async def fetch_session_user_info(session_path: str, api_id: int, api_hash: str) -> Optional[Dict[str, Any]]:
    """
    Fetch user information from a session using Telethon.
    Returns dict with user_id, username, phone, or None if failed.
    """
    client = TelegramClient(str(session_path), api_id, api_hash)
    
    try:
        await client.connect()
        
        if not await client.is_user_authorized():
            await client.disconnect()
            return None
        
        try:
            me = await client.get_me()
            user_info = {
                "user_id": me.id,
                "username": me.username or me.first_name or None,
                "phone": me.phone or None
            }
            await client.disconnect()
            return user_info
        except Exception as e:
            await client.disconnect()
            logger.error(f"Error fetching user info from {session_path}: {e}")
            return None
            
    except Exception as e:
        try:
            await client.disconnect()
        except:
            pass
        logger.error(f"Error connecting to {session_path}: {e}")
        return None


async def sync_sessions_registry(config: dict) -> None:
    """
    Sync sessions.json with actual session files in /sessions folder.
    - Adds new sessions (fetches user info)
    - Removes deleted sessions
    - Does NOT overwrite existing user info
    """
    registry = load_sessions_registry()
    session_files = get_session_files()
    accounts = config.get("accounts", [])
    
    if not accounts:
        logger.warning("No accounts in config, cannot sync sessions")
        return
    
    # Get set of current session filenames
    current_session_names = {f.name for f in session_files}
    
    # Remove sessions that no longer exist
    removed_sessions = []
    for session_name in list(registry.keys()):
        if session_name not in current_session_names:
            removed_sessions.append(session_name)
            del registry[session_name]
    
    if removed_sessions:
        logger.info(f"Removed {len(removed_sessions)} deleted sessions from registry: {removed_sessions}")
    
    # Add new sessions
    added_sessions = []
    for session_file in session_files:
        session_name = session_file.name
        
        if session_name not in registry:
            # New session - fetch user info
            account = accounts[0]  # Use first account config
            user_info = await fetch_session_user_info(
                str(session_file),
                account["api_id"],
                account["api_hash"]
            )
            
            # Create registry entry
            registry[session_name] = {
                "session_name": session_name,
                "user_id": user_info.get("user_id") if user_info else None,
                "username": user_info.get("username") if user_info else None,
                "phone": user_info.get("phone") if user_info else None,
                "status": "UNKNOWN",  # Default status
                "last_updated": datetime.now().isoformat()
            }
            added_sessions.append(session_name)
            logger.info(f"Added new session to registry: {session_name}")
    
    # Save registry
    if removed_sessions or added_sessions:
        save_sessions_registry(registry)
        logger.info(f"Synced sessions registry: {len(added_sessions)} added, {len(removed_sessions)} removed")


def update_session_status(session_name: str, status: str) -> bool:
    """
    Update session status in sessions.json.
    Only updates status and last_updated timestamp.
    Does NOT modify other fields.
    
    Args:
        session_name: Filename of session (e.g., "4353y8523.session")
        status: One of ACTIVE, TEMP_LIMITED, HARD_LIMITED, FROZEN, LOGGED_OUT, UNKNOWN
    
    Returns:
        True if updated successfully, False otherwise
    """
    registry = load_sessions_registry()
    
    if session_name not in registry:
        logger.warning(f"Session {session_name} not found in registry, cannot update status")
        return False
    
    # Update only status and last_updated
    registry[session_name]["status"] = status
    registry[session_name]["last_updated"] = datetime.now().isoformat()
    
    return save_sessions_registry(registry)


async def accounts_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /accounts command - show session buttons with Telegram account links"""
    config = load_config()
    authorized_ids = config.get("controller_authorized_user_ids", [])
    
    # Authorization check
    if update.effective_user.id not in authorized_ids:
        await update.message.reply_text("Unauthorized. You don't have permission to use this bot.")
        return
    
    # Sync sessions registry
    try:
        await sync_sessions_registry(config)
    except Exception as e:
        logger.error(f"Error syncing sessions registry: {e}")
    
    # Load registry and filter to existing sessions
    registry = load_sessions_registry()
    session_files = get_session_files()
    existing_session_names = {f.name for f in session_files}
    
    # Filter to only existing sessions
    existing_sessions = {
        name: data for name, data in registry.items()
        if name in existing_session_names
    }
    
    if not existing_sessions:
        msg = "📋 No sessions found.\n\nAdd session files to the `sessions/` folder."
        if update.message:
            await update.message.reply_text(msg, parse_mode='Markdown', disable_web_page_preview=True)
        return
    
    # Status emoji mapping
    status_emoji_map = {
        "ACTIVE": "✅",
        "TEMP_LIMITED": "⚠️",
        "HARD_LIMITED": "⛔",
        "FROZEN": "❌",
        "LOGGED_OUT": "🔐",
        "UNKNOWN": "❓"
    }
    
    # Build keyboard with ONE button per session (all sessions, no pagination)
    keyboard = []
    sorted_sessions = sorted(existing_sessions.items(), key=lambda x: x[0])
    
    for session_name, session_data in sorted_sessions:
        status = session_data.get("status", "UNKNOWN")
        username = session_data.get("username") or session_name.replace(".session", "")
        emoji = status_emoji_map.get(status, "❓")
        user_id = session_data.get("user_id")
        
        # Button text: "✅ GQAdz | +254768741010.session"
        button_text = f"{emoji} {username} | {session_name}"
        # Truncate if too long (Telegram limit is 64 chars)
        if len(button_text) > 60:
            button_text = button_text[:57] + "..."
        
        # ONE button per session that redirects to Telegram account using URL
        if user_id:
            # Redirect button using tg:// URL (not callback_data)
            keyboard.append([InlineKeyboardButton(
                text=button_text,
                url=f"tg://user?id={user_id}"
            )])
        # If user_id missing, skip button (can't redirect without user_id)
    
    reply_markup = InlineKeyboardMarkup(keyboard) if keyboard else None
    
    # Minimal header message only - NO text reports, NO phone numbers, NO status details
    header_text = "📂 Available Sessions"
    
    # Send message
    if update.message:
        await update.message.reply_text(
            header_text,
            reply_markup=reply_markup,
            disable_web_page_preview=True
        )


def parse_post_link(post_link: str) -> Tuple[str, int]:
    """Extract channel username and message ID from post link"""
    # Pattern: t.me/channel/123 or https://t.me/channel/123
    pattern = r'(?:https?://)?t\.me/([^/]+)/(\d+)'
    match = re.search(pattern, post_link.strip())
    if not match:
        raise ValueError(f"Invalid post link format: {post_link}")
    channel_username = match.group(1)
    message_id = int(match.group(2))
    return channel_username, message_id


def get_post_links(config: dict) -> List[str]:
    """Get post links from config - supports single link or array of links"""
    post_link = config.get("post_link")
    if not post_link:
        return []
    
    # If it's a string, return as single-item list
    if isinstance(post_link, str):
        return [post_link]
    
    # If it's a list/array, return it
    if isinstance(post_link, list):
        return [link for link in post_link if link and isinstance(link, str)]
    
    return []


def has_valid_post_links(config: dict) -> bool:
    """Check if config has valid post links (not empty and not placeholder)"""
    post_links = get_post_links(config)
    if not post_links:
        return False
    # Filter out placeholder
    valid_links = [link for link in post_links if link != "t.me/channel/123"]
    return len(valid_links) > 0


async def add_post_link(link: str) -> Tuple[bool, str]:
    """Add a post link to config. Returns (success, message)"""
    try:
        config = load_config()
        current_links = get_post_links(config)
        
        # Normalize link
        normalized_link = link.strip()
        if normalized_link.startswith('http://') or normalized_link.startswith('https://'):
            match = re.search(r't\.me/[^\s]+', normalized_link)
            if match:
                normalized_link = match.group(0)
        
        if not normalized_link.startswith('t.me/'):
            return (False, "Invalid link format")
        
        # Validate link
        try:
            parse_post_link(normalized_link)
        except ValueError as e:
            return (False, f"Invalid link: {str(e)}")
        
        # Check if already exists
        if normalized_link in current_links:
            return (False, "Link already exists")
        
        # Add to list
        current_links.append(normalized_link)
        
        # Save (single string if one link, array if multiple)
        post_link_value = current_links[0] if len(current_links) == 1 else current_links
        await save_post_links_async(post_link_value)
        
        return (True, f"Link added successfully")
    except Exception as e:
        logger.error(f"Error adding post link: {e}", exc_info=True)
        return (False, f"Error: {str(e)}")


async def remove_post_link(link: str) -> Tuple[bool, str]:
    """Remove a post link from config. Returns (success, message)"""
    try:
        config = load_config()
        current_links = get_post_links(config)
        
        if link not in current_links:
            return (False, "Link not found")
        
        # Remove link
        current_links.remove(link)
        
        # Save (single string if one link, array if multiple, or empty list)
        if not current_links:
            post_link_value = "t.me/channel/123"  # Placeholder
        else:
            post_link_value = current_links[0] if len(current_links) == 1 else current_links
        
        await save_post_links_async(post_link_value)
        
        return (True, "Link removed successfully")
    except Exception as e:
        logger.error(f"Error removing post link: {e}", exc_info=True)
        return (False, f"Error: {str(e)}")


def create_post_link_menu_keyboard() -> InlineKeyboardMarkup:
    """Create keyboard for post link management menu"""
    config = load_config()
    current_links = get_post_links(config)
    # Filter out placeholder
    valid_links = [link for link in current_links if link != "t.me/channel/123"]
    
    keyboard = []
    
    # Show current links with remove buttons (max 10 for UI)
    if valid_links:
        # Map valid links to original indices for removal
        for valid_idx, link in enumerate(valid_links[:10]):
            # Find original index in current_links
            original_idx = current_links.index(link)
            # Truncate long links for button text
            display_text = link[:30] + "..." if len(link) > 30 else link
            keyboard.append([
                InlineKeyboardButton(f"❌ {display_text}", callback_data=f"remove_link_{original_idx}")
            ])
    
    # Action buttons
    keyboard.append([InlineKeyboardButton("➕ Add New Link", callback_data="add_post_link")])
    if len(valid_links) > 10:
        keyboard.append([InlineKeyboardButton("📋 View All Links", callback_data="view_all_links")])
    keyboard.append([InlineKeyboardButton("🔙 Back", callback_data="back_to_main")])
    
    return InlineKeyboardMarkup(keyboard)


def select_random_post_link(config: dict) -> Optional[str]:
    """Select a random post link from available links"""
    links = get_post_links(config)
    if not links:
        return None
    return random.choice(links)


async def send_log_to_telegram(message: str, log_group_id: int, controller_app: Optional[Application], parse_mode: str = 'Markdown'):
    """Send log message to Telegram log group via controller bot"""
    if not controller_app:
        return
    try:
        await controller_app.bot.send_message(chat_id=log_group_id, text=message, parse_mode=parse_mode)
    except Exception as e:
        # Fallback to plain text if formatting fails
        try:
            await controller_app.bot.send_message(chat_id=log_group_id, text=message, parse_mode=None)
        except Exception as e2:
            logger.error(f"Failed to send log to Telegram: {e2}")

async def telegram_log_sender(log_group_id: int, message: str):
    """Wrapper for CentralLogger to send to Telegram"""
    global controller_app
    if controller_app:
        await send_log_to_telegram(message, log_group_id, controller_app, parse_mode='Markdown')


class BatchedTelegramLogSender:
    """Batched Telegram log sender - collects logs and sends in batches of 5"""
    def __init__(self, bot_token: Optional[str] = None, log_group_id: int = None, batch_size: int = 5):
        self.bot_token = bot_token or os.getenv('TELEGRAM_BOT_TOKEN')
        if not self.bot_token:
            raise ValueError("Bot token must be provided or set in TELEGRAM_BOT_TOKEN environment variable")
        
        self.log_group_id = log_group_id
        self.batch_size = batch_size
        self.log_buffer = []
        self.bot = Bot(token=self.bot_token)
        self.running = True
        self.min_send_interval = 1.0
    
    async def add_log(self, log_text: str):
        """Add a log string to the buffer"""
        if not log_text or not self.running:
            return
        
        self.log_buffer.append(log_text)
        
        if len(self.log_buffer) >= self.batch_size:
            await self._flush_batch()
    
    async def _flush_batch(self):
        """Send buffered logs as a batch"""
        if not self.log_buffer or not self.running:
            return
        
        logs_to_send = self.log_buffer[:self.batch_size]
        self.log_buffer = self.log_buffer[self.batch_size:]
        
        if not logs_to_send:
            return
        
        message_text = "\n".join(logs_to_send)
        
        max_retries = 3
        retry_count = 0
        
        while retry_count < max_retries:
            try:
                await self.bot.send_message(
                    chat_id=self.log_group_id,
                    text=message_text,
                    parse_mode='HTML',
                    disable_web_page_preview=True
                )
                await asyncio.sleep(self.min_send_interval)
                return
            except RetryAfter as e:
                wait_time = e.retry_after
                logger.warning(f"Telegram rate limit hit, waiting {wait_time}s before retry")
                await asyncio.sleep(wait_time)
                retry_count += 1
            except TimedOut:
                logger.warning(f"Telegram request timed out, retrying...")
                await asyncio.sleep(2)
                retry_count += 1
            except TelegramError as e:
                logger.error(f"Telegram error: {e}, retrying...")
                await asyncio.sleep(2)
                retry_count += 1
            except Exception as e:
                logger.error(f"Unexpected error sending logs: {e}", exc_info=True)
                await asyncio.sleep(2)
                retry_count += 1
        
        logger.error(f"Failed to send batch after {max_retries} retries, re-adding to buffer")
        self.log_buffer = logs_to_send + self.log_buffer
    
    async def flush_all(self):
        """Flush all remaining logs"""
        while self.log_buffer:
            await self._flush_batch()
    
    async def periodic_flush(self):
        """Periodically flush logs even if batch isn't full"""
        while self.running:
            try:
                await asyncio.sleep(10)
                if self.log_buffer:
                    await self._flush_batch()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in periodic flush: {e}", exc_info=True)
    
    def stop(self):
        """Stop the sender"""
        self.running = False


# Enhanced batched logging system for high-throughput
class BatchedLogSender:
    """Batched log sender that collects logs and sends them in batches to prevent rate limiting and crashes"""
    def __init__(self, controller_app: Optional[Application], log_group_id: int):
        self.controller_app = controller_app
        self.log_group_id = log_group_id
        self.log_buffer = []  # Buffer for logs
        self.batch_size = 15  # Send batch when this many logs accumulate
        self.batch_interval = 3.0  # Send batch every N seconds
        self.last_send_time = asyncio.get_event_loop().time()
        self.lock = asyncio.Lock()
        self.running = True
        self.success_count = 0
        self.error_count = 0
        self.total_sent = 0
        
    async def add_log(self, log_type: str, message: str):
        """Add log to buffer (thread-safe)"""
        if not self.controller_app or not self.log_group_id:
            return
        
        async with self.lock:
            self.log_buffer.append((log_type, message))
            
            # Check if we should send batch immediately
            should_send = (
                len(self.log_buffer) >= self.batch_size or
                (asyncio.get_event_loop().time() - self.last_send_time) >= self.batch_interval
            )
            
            if should_send:
                # Schedule batch send (don't await to avoid blocking)
                asyncio.create_task(self._send_batch())
    
    async def _send_batch(self):
        """Send buffered logs as a batch (internal method)"""
        async with self.lock:
            if not self.log_buffer:
                return
            
            # Extract logs and clear buffer
            logs_to_send = self.log_buffer.copy()
            self.log_buffer.clear()
            self.last_send_time = asyncio.get_event_loop().time()
        
        # Send batch outside lock to avoid blocking
        try:
            # Group logs by type for better formatting
            success_logs = [msg for log_type, msg in logs_to_send if log_type == "SUCCESS"]
            error_logs = [msg for log_type, msg in logs_to_send if log_type == "ERROR"]
            info_logs = [msg for log_type, msg in logs_to_send if log_type == "INFO"]
            warning_logs = [msg for log_type, msg in logs_to_send if log_type == "WARNING"]
            
            # Build combined message (max 4096 chars per Telegram message)
            messages_to_send = []
            current_message = ""
            
            # Add success logs
            if success_logs:
                success_text = "\n".join(success_logs[:10])  # Limit to 10 per batch
                if len(success_logs) > 10:
                    success_text += f"\n... and {len(success_logs) - 10} more"
                if current_message:
                    current_message += "\n\n"
                current_message += f"✅ **Success ({len(success_logs)}):**\n{success_text}"
            
            # Add error logs
            if error_logs:
                if current_message:
                    current_message += "\n\n"
                error_text = "\n".join(error_logs[:10])  # Limit to 10 per batch
                if len(error_logs) > 10:
                    error_text += f"\n... and {len(error_logs) - 10} more"
                current_message += f"❌ **Errors ({len(error_logs)}):**\n{error_text}"
            
            # Add info/warning logs (only if space available)
            if info_logs and len(current_message) < 3000:
                if current_message:
                    current_message += "\n\n"
                info_text = "\n".join(info_logs[:5])
                current_message += f"ℹ️ **Info:**\n{info_text}"
            
            if warning_logs and len(current_message) < 3000:
                if current_message:
                    current_message += "\n\n"
                warning_text = "\n".join(warning_logs[:5])
                current_message += f"⚠️ **Warnings:**\n{warning_text}"
            
            # Split message if too long (Telegram limit is 4096 chars)
            if len(current_message) > 4000:
                # Split into chunks
                chunks = [current_message[i:i+4000] for i in range(0, len(current_message), 4000)]
                messages_to_send = chunks
            else:
                messages_to_send = [current_message] if current_message else []
            
            # Send all message chunks with rate limiting
            for msg in messages_to_send:
                try:
                    await self.controller_app.bot.send_message(
                        chat_id=self.log_group_id,
                        text=msg,
                        parse_mode='Markdown',
                        disable_web_page_preview=True
                    )
                    self.success_count += 1
                    self.total_sent += len(logs_to_send)
                    # Rate limit: 20 messages per second max (Telegram limit is 30, we use 20 for safety)
                    await asyncio.sleep(0.05)  # 50ms between messages = 20/sec
                except Exception as e:
                    self.error_count += 1
                    # Try plain text fallback
                    try:
                        await self.controller_app.bot.send_message(
                            chat_id=self.log_group_id,
                            text=msg.replace('*', '').replace('_', '').replace('`', ''),
                            parse_mode=None,
                            disable_web_page_preview=True
                        )
                        self.success_count += 1
                    except Exception as e2:
                        logger.error(f"Failed to send batched log: {e2}")
                        # Re-add logs to buffer if send failed (but limit buffer size to prevent memory issues)
                        async with self.lock:
                            if len(self.log_buffer) < 100:  # Max buffer size
                                self.log_buffer.extend(logs_to_send[-20:])  # Re-add last 20 logs
        except Exception as e:
            logger.error(f"Error in batched log sender: {e}")
            # Re-add logs to buffer on error
            async with self.lock:
                if len(self.log_buffer) < 100:
                    self.log_buffer.extend(logs_to_send[-20:])
    
    async def flush(self):
        """Force send all buffered logs immediately"""
        if self.log_buffer:
            await self._send_batch()
    
    async def periodic_flush(self):
        """Periodic task to flush logs (runs in background)"""
        while self.running:
            try:
                await asyncio.sleep(self.batch_interval)
                async with self.lock:
                    if self.log_buffer and (asyncio.get_event_loop().time() - self.last_send_time) >= self.batch_interval:
                        asyncio.create_task(self._send_batch())
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in periodic flush: {e}")
    
    def stop(self):
        """Stop the periodic flush task"""
        self.running = False


def build_message_link(entity, message_id: int) -> str:
    """Build message link using username if available, otherwise /c/ format with converted chat_id"""
    # Check if entity has username (Channel type)
    if isinstance(entity, Channel) and hasattr(entity, 'username') and entity.username:
        return f"https://t.me/{entity.username}/{message_id}"
    else:
        # Convert chat_id: remove -100 prefix only
        chat_id = abs(entity.id)
        chat_id_str = str(chat_id)
        if chat_id_str.startswith('100'):
            chat_id_str = chat_id_str[3:]  # Remove '100' prefix
        return f"https://t.me/c/{chat_id_str}/{message_id}"


def track_stats(account_num: int, group_name: str, status: str, error_reason: Optional[str] = None, response_time: Optional[float] = None):
    """Track statistics for accounts and groups"""
    with stats_lock:
        now = datetime.now()
        
        # Check for suspicious patterns
        is_flood_wait = error_reason and ('flood' in error_reason.lower() or 'wait' in error_reason.lower())
        is_banned = error_reason and ('banned' in error_reason.lower() or 'blocked' in error_reason.lower())
        is_frozen = error_reason and 'frozen' in error_reason.lower()
        is_deleted = error_reason and ('deleted' in error_reason.lower() or 'not found' in error_reason.lower())
        
        # Update account stats - ensure account entry exists (multiprocessing-safe)
        if account_num not in stats['accounts']:
            stats['accounts'][account_num] = {
                'success': 0,
                'failures': 0,
                'flood_waits': 0,
                'banned': False,
                'frozen': False,
                'last_activity': None,
                'last_error': None,
                'suspicious_activity': [],
                'total_messages_sent': 0,
                'response_times': [],
                'avg_response_time': 0.0,
                'fastest_response': None,
                'slowest_response': None,
                'error_types': defaultdict(int)
            }
        acc_stats = stats['accounts'][account_num]
        if status == 'success':
            acc_stats['success'] += 1
            stats['total_success'] += 1
            acc_stats['total_messages_sent'] += 1
            stats['total_messages_sent'] += 1
            acc_stats['last_activity'] = now
            acc_stats['last_error'] = None
            
            # Track response time
            if response_time is not None:
                acc_stats['response_times'].append(response_time)
                # Keep only last 100 response times
                if len(acc_stats['response_times']) > 100:
                    acc_stats['response_times'] = acc_stats['response_times'][-100:]
                
                # Calculate average
                if acc_stats['response_times']:
                    acc_stats['avg_response_time'] = sum(acc_stats['response_times']) / len(acc_stats['response_times'])
                
                # Track fastest/slowest
                if acc_stats['fastest_response'] is None or response_time < acc_stats['fastest_response']:
                    acc_stats['fastest_response'] = response_time
                if acc_stats['slowest_response'] is None or response_time > acc_stats['slowest_response']:
                    acc_stats['slowest_response'] = response_time
        else:
            acc_stats['failures'] += 1
            stats['total_failures'] += 1
            acc_stats['last_error'] = error_reason
            acc_stats['last_activity'] = now
            
            # Track error types
            if error_reason:
                acc_stats['error_types'][error_reason] += 1
            
            if is_flood_wait:
                acc_stats['flood_waits'] += 1
                stats['total_flood_waits'] += 1
                if acc_stats['flood_waits'] >= 3:
                    acc_stats['suspicious_activity'].append(f"Multiple flood waits detected at {now.strftime('%Y-%m-%d %H:%M:%S')}")
            
            if is_banned:
                acc_stats['banned'] = True
                acc_stats['suspicious_activity'].append(f"Account banned detected at {now.strftime('%Y-%m-%d %H:%M:%S')}")
            
            if is_frozen:
                acc_stats['frozen'] = True
                acc_stats['suspicious_activity'].append(f"Account frozen detected at {now.strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Update group stats - ensure groups dict and entry exist (multiprocessing-safe)
        # In multiprocessing, each process gets its own copy of stats, so defaultdict doesn't work
        if 'groups' not in stats:
            stats['groups'] = {}
        # Handle None or invalid group_name
        if not group_name or not isinstance(group_name, str):
            group_name = str(group_name) if group_name is not None else "Unknown"
        if group_name not in stats['groups']:
            stats['groups'][group_name] = {
                'success': 0,
                'failures': 0,
                'last_post': None,
                'consecutive_failures': 0
            }
        group_stats = stats['groups'][group_name]
        if status == 'success':
            group_stats['success'] += 1
            group_stats['last_post'] = now
            group_stats['consecutive_failures'] = 0
        else:
            group_stats['failures'] += 1
            group_stats['consecutive_failures'] += 1
            if group_stats['consecutive_failures'] >= 5:
                stats['accounts'][account_num]['suspicious_activity'].append(
                    f"Group {group_name}: {group_stats['consecutive_failures']} consecutive failures"
                )
        
        stats['total_posts'] += 1
        
        # Save stats periodically (every 10 updates)
        if stats['total_posts'] % 10 == 0:
            save_stats()
        
        # Check for critical alerts and send notifications
        if status == 'failure' and error_reason:
            # controller_app is global, get it
            controller_app_ref = globals().get('controller_app')
            check_and_send_critical_alert(account_num, error_reason, controller_app_ref)


# Notification System for Critical Alerts
async def send_critical_alert_to_users(message: str, controller_app: Optional[Application] = None):
    """Send critical alert to all authorized users"""
    if not controller_app:
        controller_app = globals().get('controller_app')
    if not controller_app:
        return
    
    config = load_config()
    authorized_ids = config.get("controller_authorized_user_ids", [])
    
    for user_id in authorized_ids:
        try:
            await controller_app.bot.send_message(
                chat_id=user_id,
                text=f"🚨 **CRITICAL ALERT** 🚨\n\n{message}",
                parse_mode='Markdown',
                disable_web_page_preview=True
            )
        except Exception as e:
            logger.error(f"Failed to send critical alert to user {user_id}: {e}")


def check_and_send_critical_alert(account_num: int, error_reason: str, controller_app: Optional[Application] = None):
    """Check if error requires critical alert and send notification"""
    error_lower = error_reason.lower() if error_reason else ""
    
    is_banned = any(term in error_lower for term in ['banned', 'userbanned', 'phonenumberbanned', 'user deactivated'])
    is_auth_error = any(term in error_lower for term in ['auth key unregistered', 'session not authorized', 'authkeyunregistered'])
    
    with stats_lock:
        acc_stats = stats['accounts'].get(account_num, {})
        total_attempts = acc_stats.get('success', 0) + acc_stats.get('failures', 0)
        
        if total_attempts > 0:
            failure_rate = (acc_stats.get('failures', 0) / total_attempts) * 100
            high_failure_rate = failure_rate >= 80.0 and total_attempts >= 10
        else:
            high_failure_rate = False
    
    if is_banned or is_auth_error:
        message = f"⚠️ **Account {account_num} BANNED/DEACTIVATED**\n\n"
        message += f"Error: {error_reason}\n"
        message += f"Action required: Check account status and remove if necessary."
        asyncio.create_task(send_critical_alert_to_users(message, controller_app))
    
    elif high_failure_rate:
        message = f"⚠️ **Account {account_num} HIGH FAILURE RATE**\n\n"
        message += f"Failure Rate: {failure_rate:.1f}% ({acc_stats.get('failures', 0)}/{total_attempts})\n"
        message += f"Last Error: {error_reason}\n"
        message += f"Action required: Review account health and consider disabling."
        asyncio.create_task(send_critical_alert_to_users(message, controller_app))


# Session Management Utilities
def get_removed_sessions_dir() -> Path:
    """Get or create removed sessions directory"""
    removed_dir = Path("removed")
    removed_dir.mkdir(exist_ok=True)
    return removed_dir


async def get_all_session_statuses() -> List[Dict[str, Any]]:
    """Get status for all sessions"""
    config = load_config()
    accounts = config["accounts"]
    num_accounts = len(accounts)
    session_files = get_session_files()
    session_statuses = []
    
    for idx, session_file in enumerate(session_files):
        account_idx = idx % num_accounts
        account = accounts[account_idx]
        
        try:
            status, details = await check_session_status(
                str(session_file),
                account["api_id"],
                account["api_hash"]
            )
            session_statuses.append({
                "filename": session_file.name,
                "path": str(session_file),
                "status": status,
                "details": details,
                "account_num": idx + 1
            })
        except Exception as e:
            session_statuses.append({
                "filename": session_file.name,
                "path": str(session_file),
                "status": "ERROR",
                "details": {"error": str(e)},
                "account_num": idx + 1
            })
    
    return session_statuses


def extract_session_from_zip(zip_path: Path, extract_to: Path) -> Tuple[int, List[str]]:
    """Extract .session files from zip and return (count, extracted_files)"""
    extracted_files = []
    count = 0
    
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            # Get list of files in zip
            file_list = zip_ref.namelist()
            
            # Extract only .session files
            for file_name in file_list:
                if file_name.endswith('.session') and not file_name.startswith('__MACOSX'):
                    # Remove any directory structure, keep only filename
                    safe_filename = Path(file_name).name
                    extract_path = extract_to / safe_filename
                    
                    # Extract file
                    with zip_ref.open(file_name) as source:
                        with open(extract_path, 'wb') as target:
                            target.write(source.read())
                    
                    extracted_files.append(safe_filename)
                    count += 1
    except Exception as e:
        raise Exception(f"Failed to extract zip: {str(e)}")
    
    return count, extracted_files


# Error Message Enhancement
def get_user_friendly_error_message(error_class: str, error_detail: str) -> Tuple[str, str, Optional[str], Optional[str]]:
    """Get user-friendly error message, explanation, suggestion, and documentation link"""
    explanations = {
        'FATAL_ACCOUNT': (
            "Account Banned or Deactivated",
            "Your account has been banned, deactivated, or the session is invalid. This account cannot be used for posting.",
            "• Check if the account is banned on Telegram\n• Try logging in again to refresh the session\n• Remove this session if permanently banned\n• Use /remove_session to remove it",
            None
        ),
        'TEMP_ACCOUNT': (
            "Rate Limit / Flood Wait",
            "Telegram has temporarily limited your account due to too many requests. This is usually temporary.",
            "• Wait for the specified time before retrying\n• The bot will automatically retry after the wait period\n• Consider increasing delay_between_posts in config\n• This is normal during high activity periods",
            "https://core.telegram.org/api/errors#420-flood-wait"
        ),
        'PERM_GROUP': (
            "Permission Denied",
            "Your account doesn't have permission to post in this group/channel. You may need admin rights or the group may have restrictions.",
            "• Ensure the account is an admin in the group\n• Check if the group allows member posting\n• Verify the group settings allow message forwarding\n• Remove the group from your list if access is lost",
            "https://core.telegram.org/api/errors#403-chat-write-forbidden"
        ),
        'BAD_GROUP': (
            "Group Not Found",
            "The group or channel doesn't exist, has been deleted, or your account no longer has access to it.",
            "• Verify the group ID is correct\n• Check if the group still exists\n• Ensure your account is still a member\n• Remove invalid groups from groups.txt",
            "https://core.telegram.org/api/errors#400-peer-id-invalid"
        ),
        'PAYWALL': (
            "Payment Required",
            "This group requires payment to join or post. Your account cannot post without payment.",
            "• Join the group through Telegram and complete payment\n• Remove the group if payment is not desired\n• This is a premium feature requirement",
            None
        ),
        'UNKNOWN': (
            "Unknown Error",
            "An unexpected error occurred. This may be a temporary network issue or an unknown Telegram API error.",
            "• Check your internet connection\n• The bot will automatically retry\n• Review logs for more details\n• Contact support if the issue persists",
            "https://core.telegram.org/api/errors"
        )
    }
    
    title, explanation, suggestion, doc_link = explanations.get(error_class, explanations['UNKNOWN'])
    return title, explanation, suggestion, doc_link


def format_user_friendly_error(error_class: str, error_detail: str) -> str:
    """Format user-friendly error message for display"""
    title, explanation, suggestion, doc_link = get_user_friendly_error_message(error_class, error_detail)
    
    message = f"**{title}**\n\n{explanation}\n\n**Suggestions:**\n{suggestion}"
    
    if doc_link:
        message += f"\n\n📖 [Documentation]({doc_link})"
    
    return message


# Group Blacklist Tracking (file-based for multiprocessing)
BLACKLIST_FILE = Path("group_blacklist.json")
blacklist_lock = threading.Lock()

def load_blacklist() -> Dict[int, List[str]]:
    """Load group blacklist from file"""
    if not BLACKLIST_FILE.exists():
        return {}
    try:
        with blacklist_lock:
            with open(BLACKLIST_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # Convert lists back to sets for internal use, but return as dict
                return {int(k): v for k, v in data.items()}
    except Exception as e:
        logger.error(f"Error loading blacklist: {e}")
        return {}

def save_blacklist(blacklist: Dict[int, List[str]]):
    """Save group blacklist to file"""
    try:
        with blacklist_lock:
            # Convert to JSON-serializable format
            data = {str(k): list(v) if isinstance(v, set) else v for k, v in blacklist.items()}
            with open(BLACKLIST_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Error saving blacklist: {e}")

def is_group_blacklisted_file(account_num: int, group_id: str) -> bool:
    """Check if a group is blacklisted for an account (file-based)"""
    blacklist = load_blacklist()
    return group_id in blacklist.get(account_num, [])

def add_to_blacklist_file(account_num: int, group_id: str):
    """Add a group to blacklist (file-based)"""
    blacklist = load_blacklist()
    if account_num not in blacklist:
        blacklist[account_num] = []
    if group_id not in blacklist[account_num]:
        blacklist[account_num].append(group_id)
        save_blacklist(blacklist)
        logger.info(f"Group {group_id} blacklisted for account {account_num}")

# Scheduled Posting Utilities
def is_in_schedule_window(config: dict) -> bool:
    """Check if current time is within scheduled posting window"""
    schedule = config.get("scheduled_posting", {})
    if not schedule.get("enabled", False):
        return True  # No schedule restriction
    
    try:
        start_str = schedule.get("start_time", "00:00")
        end_str = schedule.get("end_time", "23:59")
        timezone_str = schedule.get("timezone", "UTC")
        
        # Parse times
        start_hour, start_min = map(int, start_str.split(":"))
        end_hour, end_min = map(int, end_str.split(":"))
        start_time = dt_time(start_hour, start_min)
        end_time = dt_time(end_hour, end_min)
        
        # Get current time in specified timezone
        if pytz:
            try:
                tz = pytz.timezone(timezone_str)
                current_time = datetime.now(tz).time()
            except Exception:
                # Fallback to local time if timezone fails
                current_time = datetime.now().time()
        else:
            # Fallback to local time if pytz not available
            current_time = datetime.now().time()
        
        # Check if current time is within window
        if start_time <= end_time:
            # Normal case: start < end (e.g., 09:00 to 17:00)
            return start_time <= current_time <= end_time
        else:
            # Wraps around midnight (e.g., 22:00 to 06:00)
            return current_time >= start_time or current_time <= end_time
    except Exception as e:
        logger.error(f"Error checking schedule window: {e}")
        return True  # Default to allow posting if schedule check fails


# Auto-adjust Posting Speed (Group Slowdown Mode)
def get_group_delay(group_id: str, default_delay: int, config: dict) -> int:
    """Get delay for a specific group based on slowdown mode"""
    slowdown_modes = config.get("group_slowdown_modes", {})
    group_slowdown = slowdown_modes.get(group_id)
    
    if group_slowdown and isinstance(group_slowdown, dict):
        delay = group_slowdown.get("delay", default_delay)
        return max(delay, 3)  # Minimum 3 seconds
    
    return default_delay


def get_stats_summary() -> str:
    """Generate comprehensive stats summary"""
    with stats_lock:
        # Calculate uptime
        if stats.get('uptime_start'):
            if stats.get('bot_stop_time'):
                # Bot is stopped, use saved uptime
                uptime_seconds = stats.get('total_uptime_seconds', 0)
            else:
                # Bot is running, calculate current uptime
                current_uptime = (datetime.now() - stats['uptime_start']).total_seconds()
                uptime_seconds = stats.get('total_uptime_seconds', 0) + current_uptime
        else:
            uptime_seconds = stats.get('total_uptime_seconds', 0)
        
        # Format uptime
        hours = int(uptime_seconds // 3600)
        minutes = int((uptime_seconds % 3600) // 60)
        seconds = int(uptime_seconds % 60)
        uptime_str = f"{hours}h {minutes}m {seconds}s"
        
        summary = f"📊 **Adbot Statistics**\n\n"
        summary += f"⏱️ **Uptime:** {uptime_str}\n"
        summary += f"📈 **Total Messages Sent:** {stats['total_messages_sent']}\n"
        summary += f"📊 **Total Posts:** {stats['total_posts']}\n"
        summary += f"✅ **Success:** {stats['total_success']}\n"
        summary += f"❌ **Failures:** {stats['total_failures']}\n"
        
        if stats['total_posts'] > 0:
            success_rate = (stats['total_success'] / stats['total_posts']) * 100
            failure_rate = (stats['total_failures'] / stats['total_posts']) * 100
            summary += f"📊 **Success Rate:** {success_rate:.1f}%\n"
            summary += f"📉 **Failure Rate:** {failure_rate:.1f}%\n"
        
        summary += f"⏳ **Flood Waits:** {stats['total_flood_waits']}\n\n"
        
        # Account performance ranking
        account_list = []
        for acc_num, acc in stats['accounts'].items():
            if acc['success'] > 0 or acc['failures'] > 0:
                # Calculate performance score (success rate * message count)
                total_attempts = acc['success'] + acc['failures']
                if total_attempts > 0:
                    acc_success_rate = (acc['success'] / total_attempts) * 100
                    performance_score = acc_success_rate * acc['total_messages_sent']
                else:
                    performance_score = 0
                account_list.append((acc_num, acc, performance_score))
        
        # Sort by performance score
        account_list.sort(key=lambda x: x[2], reverse=True)
        
        # Best and worst performers
        if account_list:
            best_acc = account_list[0]
            worst_acc = account_list[-1] if len(account_list) > 1 else None
            
            summary += "🏆 **Best Performance:**\n"
            best_num, best_data, _ = best_acc
            best_total = best_data['success'] + best_data['failures']
            best_rate = (best_data['success'] / best_total * 100) if best_total > 0 else 0
            summary += f"  Account {best_num}: {best_data['total_messages_sent']} msgs, {best_rate:.1f}% success\n"
            
            if worst_acc and worst_acc[0] != best_acc[0]:
                summary += "\n🐌 **Slowest Account:**\n"
                worst_num, worst_data, _ = worst_acc
                worst_total = worst_data['success'] + worst_data['failures']
                worst_rate = (worst_data['success'] / worst_total * 100) if worst_total > 0 else 0
                avg_time = worst_data.get('avg_response_time', 0)
                summary += f"  Account {worst_num}: {worst_data['total_messages_sent']} msgs, {worst_rate:.1f}% success"
                if avg_time > 0:
                    summary += f", avg {avg_time:.2f}s"
                summary += "\n"
        
        summary += "\n👤 **Account Details:**\n"
        for acc_num, acc, _ in account_list[:10]:  # Show top 10
            status_emoji = "🟢"
            if acc['banned']:
                status_emoji = "🔴"
            elif acc['frozen']:
                status_emoji = "🟡"
            elif acc['flood_waits'] >= 3:
                status_emoji = "🟠"
            
            total_attempts = acc['success'] + acc['failures']
            acc_rate = (acc['success'] / total_attempts * 100) if total_attempts > 0 else 0
            
            summary += f"{status_emoji} **Account {acc_num}:**\n"
            summary += f"  📨 Messages: {acc['total_messages_sent']}\n"
            summary += f"  ✅ Success: {acc['success']} | ❌ Failures: {acc['failures']}\n"
            summary += f"  📊 Rate: {acc_rate:.1f}%\n"
            
            if acc.get('avg_response_time', 0) > 0:
                summary += f"  ⚡ Avg Response: {acc['avg_response_time']:.2f}s"
                if acc.get('fastest_response'):
                    summary += f" | Fastest: {acc['fastest_response']:.2f}s"
                if acc.get('slowest_response'):
                    summary += f" | Slowest: {acc['slowest_response']:.2f}s"
                summary += "\n"
            
            if acc['flood_waits'] > 0:
                summary += f"  ⏳ Flood Waits: {acc['flood_waits']}\n"
            if acc['banned']:
                summary += f"  🚫 BANNED\n"
            if acc['frozen']:
                summary += f"  ❄️ FROZEN\n"
            
            # Show last activity
            if acc['last_activity']:
                if isinstance(acc['last_activity'], str):
                    last_act = datetime.fromisoformat(acc['last_activity'])
                else:
                    last_act = acc['last_activity']
                time_diff = datetime.now() - last_act
                if time_diff < timedelta(hours=1):
                    summary += f"  🕐 Last: {time_diff.seconds // 60}m ago\n"
                else:
                    summary += f"  🕐 Last: {last_act.strftime('%Y-%m-%d %H:%M')}\n"
            
            summary += "\n"
        
        return summary


def extract_short_reason(error: Exception, max_length: int = 50) -> str:
    """Extract short error reason from exception"""
    error_msg = str(error)
    # Remove newlines and extra whitespace
    error_msg = ' '.join(error_msg.split())
    # Take first max_length characters
    if len(error_msg) > max_length:
        error_msg = error_msg[:max_length].rstrip()
    return error_msg


async def send_log(
    account_num: int,
    group_name: str,
    entity: Optional,
    sent_message: Optional,
    status: str,
    log_group_id: int,
    controller_app: Optional[Application],
    reason: Optional[str] = None
):
    """Send formatted log message to Telegram log group"""
    if status == 'success' and entity and sent_message:
        # Build message link
        try:
            message_link = build_message_link(entity, sent_message.id)
            log_msg = f"✅ Account{account_num} — Posted in [{group_name}]({message_link})"
        except Exception as e:
            logger.error(f"Failed to build message link: {e}")
            log_msg = f"✅ Account{account_num} — Posted in {group_name}"
    elif status == 'failure':
        reason_text = reason or "Unknown error"
        log_msg = f"❌ Account{account_num} — Failed in {group_name} | {reason_text}"
    elif status == 'skipped':
        reason_text = reason or "Skipped"
        log_msg = f"⏭️ Account{account_num} — Skipped {group_name} | {reason_text}"
    else:
        log_msg = f"Account{account_num} — {group_name} | {status}"
    
    logger.info(log_msg.replace('✅ ', '').replace('❌ ', '').replace('⏭️ ', ''))
    await send_log_to_telegram(log_msg, log_group_id, controller_app)


def extract_invite_hash(invite_link: str) -> Optional[str]:
    """Extract invite hash from Telegram invite link"""
    # Pattern: t.me/joinchat/HASH or t.me/+HASH or https://t.me/joinchat/HASH
    patterns = [
        r'(?:https?://)?t\.me/joinchat/([a-zA-Z0-9_-]+)',
        r'(?:https?://)?t\.me/\+([a-zA-Z0-9_-]+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, invite_link)
        if match:
            return match.group(1)
    return None


def extract_username_from_link(link: str) -> Optional[str]:
    """Extract username from Telegram public link (t.me/username)"""
    # Pattern: t.me/username or https://t.me/username
    pattern = r'(?:https?://)?t\.me/([a-zA-Z0-9_]+)'
    match = re.search(pattern, link)
    if match:
        username = match.group(1)
        # Exclude invite link patterns
        if username not in ['joinchat', '+']:
            return username
    return None


async def ensure_in_log_group(client: TelegramClient, log_group_link: str, session_name: str) -> bool:
    """Check if client is in log group, only join if not already a member"""
    try:
        # Try public username link first (most common)
        username = extract_username_from_link(log_group_link)
        if username:
            try:
                entity = await client.get_entity(username)
                
                # Check if already a member by trying to get dialogs or checking permissions
                try:
                    me = await client.get_me()
                    # Try to get participants - if we can access it, we're likely a member
                    participants = await client.get_participants(entity, limit=1)
                    logger.debug(f"Session {session_name} is already in log group {username}")
                    return True
                except:
                    # Not a member or can't access, try to join
                    pass
                
                # Only join if not already a member
                try:
                    await client(JoinChannelRequest(entity))
                    logger.info(f"Session {session_name} joined log group via username: {username}")
                    return True
                except Exception as e:
                    error_msg = str(e).lower()
                    if "already" in error_msg or "participant" in error_msg or "user_already_participant" in error_msg or "channels_too_much" in error_msg:
                        logger.debug(f"Session {session_name} is already in log group {username}")
                        return True
                    else:
                        logger.warning(f"Session {session_name} failed to join log group via username: {e}")
                        return False
            except Exception as e:
                logger.warning(f"Session {session_name} error accessing log group: {e}")
                return False
        
        # Try invite link as fallback
        invite_hash = extract_invite_hash(log_group_link)
        if invite_hash:
            try:
                await client(ImportChatInviteRequest(invite_hash))
                logger.info(f"Session {session_name} joined log group via invite link")
                return True
            except Exception as e:
                error_msg = str(e).lower()
                if "already" in error_msg or "participant" in error_msg or "user_already_participant" in error_msg:
                    logger.debug(f"Session {session_name} is already in log group")
                    return True
                else:
                    logger.warning(f"Session {session_name} failed to join log group via invite: {e}")
                    return False
        
        logger.warning(f"Session {session_name}: Invalid log group link format: {log_group_link}")
        return False
                
    except Exception as e:
        logger.warning(f"Session {session_name} error checking log group: {e}")
        return False


async def ensure_client_connected(client: TelegramClient) -> bool:
    """Ensure client is connected, connect if not"""
    try:
        if not client.is_connected():
            await client.connect()
        return True
    except Exception as e:
        logger.error(f"Failed to connect client: {e}")
        return False


async def initialize_clients(config: dict, session_files: List[Path]) -> List[TelegramClient]:
    """Initialize Telegram clients for each session - connects, verifies authorization, then disconnects"""
    clients_list = []
    accounts = config["accounts"]
    num_accounts = len(accounts)
    
    for idx, session_file in enumerate(session_files):
        account_idx = idx % num_accounts
        account = accounts[account_idx]
        
        session_name = session_file.stem
        # CRITICAL FIX: Use the running event loop (PTB's loop) to prevent "Future attached to different loop" errors
        loop = asyncio.get_running_loop()
        client = TelegramClient(
            str(session_file),
            account["api_id"],
            account["api_hash"],
            loop=loop
        )
        
        try:
            # Connect to verify authorization only
            await client.connect()
            if not await client.is_user_authorized():
                logger.warning(f"Session {session_name} is not authorized. Please login first.")
                await client.disconnect()
                continue
            
            # Disconnect after initialization to save resources
            # Note: Log group join is skipped - accounts should already be in the group
            await client.disconnect()
            clients_list.append(client)
            logger.info(f"Initialized client for session {session_name} (disconnected)")
        except Exception as e:
            logger.error(f"Failed to initialize client for {session_name}: {e}")
            try:
                await client.disconnect()
            except:
                pass
    
    return clients_list


# Chatlist/Folder Management Functions
async def get_existing_chatlists(client: TelegramClient) -> List[int]:
    """Get all non-default chatlist IDs for a client"""
    try:
        # Get dialogs and extract folder IDs (chatlists)
        dialogs = await client.get_dialogs()
        folder_ids = set()
        for dialog in dialogs:
            if hasattr(dialog, 'folder_id') and dialog.folder_id:
                folder_ids.add(dialog.folder_id)
        return list(folder_ids)
    except Exception as e:
        logger.error(f"Error getting chatlists: {e}")
        return []


async def cleanup_chatlists(client: TelegramClient, session_name: str) -> Tuple[bool, int]:
    """PHASE 1: Cleanup - Leave all non-default chatlists. Returns (success, folders_left_count)"""
    import json
    import time
    import os
    debug_log_path = r"c:\Users\NCS\Desktop\Adbot\.cursor\debug.log"
    run_id = f"run_{int(time.time())}"
    
    def write_debug_log(data):
        try:
            os.makedirs(os.path.dirname(debug_log_path), exist_ok=True)
            with open(debug_log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(data)+"\n")
        except Exception as e:
            # Fallback: also log to regular logger with DEBUG prefix
            logger.error(f"DEBUG_LOG: {json.dumps(data)}")
            logger.error(f"Debug log write failed: {e}")
    
    try:
        # #region agent log
        write_debug_log({"sessionId":"debug-session","runId":run_id,"hypothesisId":"A,B,C,D,E,F,G","location":"main.py:551","message":"CLEANUP_STARTED","data":{"session_name":session_name},"timestamp":int(time.time()*1000)})
        # #endregion
        logger.info(f"Session {session_name}: CLEANUP_STARTED")
        
        # Step 1: Fetch all existing chatlists BEFORE cleanup (same as text.py pattern)
        filters_result = await client(GetDialogFiltersRequest())
        # #region agent log
        write_debug_log({"sessionId":"debug-session","runId":run_id,"hypothesisId":"F","location":"main.py:555","message":"filters_result structure","data":{"has_filters_attr":hasattr(filters_result,'filters'),"type":type(filters_result).__name__,"dir":dir(filters_result)[:10]},"timestamp":int(time.time()*1000)})
        # #endregion
        filters = filters_result.filters if hasattr(filters_result, 'filters') else filters_result
        
        # Filter out DialogFilterDefault (same as text.py: type(f).__name__ != 'DialogFilterDefault')
        custom_filters = []
        for dialog_filter in filters:
            filter_type = type(dialog_filter).__name__
            is_default = isinstance(dialog_filter, DialogFilterDefault)
            # #region agent log
            write_debug_log({"sessionId":"debug-session","runId":run_id,"hypothesisId":"E","location":"main.py:560","message":"filter type check","data":{"filter_type":filter_type,"is_default":is_default,"has_id":hasattr(dialog_filter,'id'),"id":getattr(dialog_filter,'id',None)},"timestamp":int(time.time()*1000)})
            # #endregion
            if not isinstance(dialog_filter, DialogFilterDefault):
                custom_filters.append(dialog_filter)
        
        # Step 2: Count and log found chatlists
        filter_count = len(custom_filters)
        # #region agent log
        write_debug_log({"sessionId":"debug-session","runId":run_id,"hypothesisId":"A,G","location":"main.py:565","message":"FOUND chatlists count","data":{"filter_count":filter_count,"total_filters":len(filters)},"timestamp":int(time.time()*1000)})
        # #endregion
        logger.info(f"Session {session_name}: FOUND_{filter_count}_CHATLISTS")
        
        # Step 3: Leave each chatlist using CORRECT method from text.py
        # PREVIOUS LOGIC FAILED: Missing 'peers' parameter and InputChatlistDialogFilter wrapper
        # Telegram API REQUIRES both 'chatlist' (InputChatlistDialogFilter) AND 'peers' parameters
        folders_left = 0
        for dialog_filter in custom_filters:
            filter_id = getattr(dialog_filter, 'id', None)
            if filter_id is None:
                continue
            
            try:
                # Extract peers from include_peers (REQUIRED - same as text.py line 143-145)
                peers = []
                has_include_peers = hasattr(dialog_filter, 'include_peers')
                include_peers_value = getattr(dialog_filter, 'include_peers', None)
                logger.info(f"Session {session_name}: LEAVING filter_id={filter_id} - has_include_peers={has_include_peers}, include_peers_len={len(include_peers_value) if include_peers_value else 0}")
                # #region agent log
                write_debug_log({"sessionId":"debug-session","runId":run_id,"hypothesisId":"A,G","location":"main.py:580","message":"peers extraction BEFORE","data":{"filter_id":filter_id,"has_include_peers":has_include_peers,"include_peers_type":type(include_peers_value).__name__ if include_peers_value is not None else None,"include_peers_len":len(include_peers_value) if include_peers_value else 0},"timestamp":int(time.time()*1000)})
                # #endregion
                if has_include_peers and dialog_filter.include_peers:
                    peers = dialog_filter.include_peers
                
                logger.info(f"Session {session_name}: LEAVING filter_id={filter_id} - extracted peers count={len(peers)}")
                # #region agent log
                write_debug_log({"sessionId":"debug-session","runId":run_id,"hypothesisId":"A,G","location":"main.py:582","message":"peers extraction AFTER","data":{"filter_id":filter_id,"peers_len":len(peers),"peers_empty":not peers},"timestamp":int(time.time()*1000)})
                # #endregion
                if not peers:
                    logger.warning(f"Session {session_name}: No peers found in chatlist {filter_id}, skipping - THIS MAY CAUSE CHATLIST TO REMAIN")
                    continue
                
                # Use InputChatlistDialogFilter wrapper and pass peers (CORRECT method from text.py line 151-155)
                chatlist_input = InputChatlistDialogFilter(filter_id=filter_id)
                # #region agent log
                write_debug_log({"sessionId":"debug-session","runId":run_id,"hypothesisId":"B,D","location":"main.py:588","message":"LeaveChatlistRequest BEFORE","data":{"filter_id":filter_id,"peers_count":len(peers)},"timestamp":int(time.time()*1000)})
                # #endregion
                leave_result = await client(LeaveChatlistRequest(
                    chatlist=chatlist_input,
                    peers=peers
                ))
                # #region agent log
                write_debug_log({"sessionId":"debug-session","runId":run_id,"hypothesisId":"B,D","location":"main.py:592","message":"LeaveChatlistRequest AFTER","data":{"filter_id":filter_id,"result_type":type(leave_result).__name__ if leave_result else None,"success":True},"timestamp":int(time.time()*1000)})
                # #endregion
                folders_left += 1
                logger.info(f"Session {session_name}: LEFT_CHATLIST filter_id={filter_id}")
            except Exception as e:
                # #region agent log
                write_debug_log({"sessionId":"debug-session","runId":run_id,"hypothesisId":"D","location":"main.py:595","message":"LeaveChatlistRequest EXCEPTION","data":{"filter_id":filter_id,"error_type":type(e).__name__,"error_msg":str(e)[:200]},"timestamp":int(time.time()*1000)})
                # #endregion
                logger.warning(f"Session {session_name}: Failed to leave folder {filter_id}: {e}")
        
        # Step 4: Verify cleanup by re-fetching chatlists (CRITICAL - previous logic had no verification)
        # #region agent log
        write_debug_log({"sessionId":"debug-session","runId":run_id,"hypothesisId":"C","location":"main.py:598","message":"verification delay BEFORE","data":{"folders_left":folders_left},"timestamp":int(time.time()*1000)})
        # #endregion
        await asyncio.sleep(2)  # Brief delay for Telegram to propagate
        # #region agent log
        write_debug_log({"sessionId":"debug-session","runId":run_id,"hypothesisId":"C","location":"main.py:600","message":"verification delay AFTER","data":{},"timestamp":int(time.time()*1000)})
        # #endregion
        filters_result_after = await client(GetDialogFiltersRequest())
        filters_after = filters_result_after.filters if hasattr(filters_result_after, 'filters') else filters_result_after
        
        remaining_filters = []
        remaining_details = []
        logger.info(f"Session {session_name}: VERIFICATION - Checking {len(filters_after)} total filters after cleanup")
        for dialog_filter in filters_after:
            filter_type = type(dialog_filter).__name__
            is_default = isinstance(dialog_filter, DialogFilterDefault)
            filter_id = getattr(dialog_filter, 'id', None)
            filter_title = getattr(dialog_filter, 'title', 'Unnamed')
            logger.debug(f"Session {session_name}: VERIFICATION - Filter: type={filter_type}, is_default={is_default}, id={filter_id}, title={filter_title}")
            # #region agent log
            write_debug_log({"sessionId":"debug-session","runId":run_id,"hypothesisId":"E","location":"main.py:655","message":"verification filter check","data":{"filter_type":filter_type,"is_default":is_default,"filter_id":filter_id},"timestamp":int(time.time()*1000)})
            # #endregion
            if not isinstance(dialog_filter, DialogFilterDefault):
                remaining_filters.append(dialog_filter)
                remaining_details.append({"id":filter_id,"type":filter_type,"title":filter_title})
                logger.warning(f"Session {session_name}: VERIFICATION - Found remaining chatlist: id={filter_id}, title={filter_title}, type={filter_type}")
        
        logger.info(f"Session {session_name}: VERIFICATION - Remaining chatlists: {len(remaining_filters)}, Details: {remaining_details}")
        # #region agent log
        write_debug_log({"sessionId":"debug-session","runId":run_id,"hypothesisId":"B,C","location":"main.py:660","message":"verification result","data":{"remaining_count":len(remaining_filters),"folders_left":folders_left,"remaining_ids":[getattr(f,'id',None) for f in remaining_filters],"remaining_details":remaining_details,"total_filters_after":len(filters_after)},"timestamp":int(time.time()*1000)})
        # #endregion
        
        # Step 5: Only log CLEANUP_COMPLETED if verification passes
        if len(remaining_filters) > 0:
            logger.warning(f"Session {session_name}: CLEANUP_INCOMPLETE (remaining: {len(remaining_filters)})")
            logger.info(f"Session {session_name}: CLEANUP_COMPLETED (left {folders_left} folders, but {len(remaining_filters)} remain)")
            # #region agent log
            write_debug_log({"sessionId":"debug-session","runId":run_id,"hypothesisId":"B,C","location":"main.py:610","message":"cleanup FAILED","data":{"success":False},"timestamp":int(time.time()*1000)})
            # #endregion
            return (False, folders_left)
        else:
            logger.info(f"Session {session_name}: CLEANUP_VERIFIED_EMPTY")
            logger.info(f"Session {session_name}: CLEANUP_COMPLETED (left {folders_left} folders)")
            # #region agent log
            write_debug_log({"sessionId":"debug-session","runId":run_id,"hypothesisId":"B,C","location":"main.py:614","message":"cleanup SUCCESS","data":{"success":True},"timestamp":int(time.time()*1000)})
            # #endregion
            return (True, folders_left)
    except Exception as e:
        # #region agent log
        write_debug_log({"sessionId":"debug-session","runId":run_id,"hypothesisId":"D","location":"main.py:616","message":"cleanup EXCEPTION","data":{"error_type":type(e).__name__,"error_msg":str(e)[:200]},"timestamp":int(time.time()*1000)})
        # #endregion
        logger.error(f"Session {session_name}: Error in cleanup: {e}")
        return (False, 0)


async def leave_all_chatlists(client: TelegramClient) -> bool:
    """Legacy function for remove_folder - uses cleanup_chatlists"""
    try:
        session_name = "legacy"
        success, _ = await cleanup_chatlists(client, session_name)
        return success
    except Exception as e:
        logger.error(f"Error leaving chatlists: {e}")
        return False


def extract_chatlist_hash(link: str) -> Optional[str]:
    """Extract chatlist invite hash from t.me/addlist/xxxx link"""
    # Normalize link - remove whitespace
    link = link.strip()
    # Pattern: https://t.me/addlist/xxxx or t.me/addlist/xxxx (case insensitive)
    pattern = r'(?:https?://)?(?:www\.)?t\.me/addlist/([a-zA-Z0-9_-]+)'
    match = re.search(pattern, link, re.IGNORECASE)
    if match:
        return match.group(1)
    return None




async def get_most_active_topic(client: TelegramClient, channel: Channel) -> Optional[int]:
    """Get the most active forum topic ID based on unread_count and top_message (from scrapper.py)"""
    try:
        topics_result = await client(GetForumTopicsRequest(
            channel=channel,
            offset_date=0,
            offset_id=0,
            offset_topic=0,
            limit=100
        ))
        
        if not topics_result.topics:
            return None
        
        # Filter valid topics: must have id, unread_count, and top_message attributes
        valid_topics = []
        for topic in topics_result.topics:
            if (hasattr(topic, 'id') and 
                hasattr(topic, 'unread_count') and 
                hasattr(topic, 'top_message')):
                valid_topics.append(topic)
        
        if not valid_topics:
            return None
        
        # Find most active topic: highest unread_count, then highest top_message
        most_active = None
        max_unread = -1
        max_top_message = -1
        
        for topic in valid_topics:
            unread = topic.unread_count if topic.unread_count is not None else 0
            top_msg = topic.top_message if topic.top_message is not None else 0
            
            if unread > max_unread or (unread == max_unread and top_msg > max_top_message):
                max_unread = unread
                max_top_message = top_msg
                most_active = topic.id
        
        return most_active
        
    except Exception:
        return None


async def extract_groups_from_chatlist(client: TelegramClient, invite_hash: str) -> List[str]:
    """Extract all group/channel IDs from a chatlist with forum topic support"""
    group_ids = []
    try:
        # Get chatlist info using CheckChatlistInviteRequest
        invite = await client(CheckChatlistInviteRequest(slug=invite_hash))
        
        # Collect all peers from invite.peers and invite.chats
        peers_to_process = []
        
        # Extract from invite.peers (first priority) - InputPeer types
        if hasattr(invite, 'peers') and invite.peers:
            peers_to_process.extend(invite.peers)
        
        # Also check invite.chats attribute if present (fallback)
        if hasattr(invite, 'chats') and invite.chats:
            peers_to_process.extend(invite.chats)
        
        # Process each peer
        for peer in peers_to_process:
            try:
                # Resolve peer into entity (matches scrapper.py pattern)
                entity = None
                
                # Always try to resolve entity (get_entity handles both InputPeer and already-resolved entities)
                try:
                    entity = await client.get_entity(peer)
                except:
                    # If resolution fails, try to extract ID from peer directly
                    if hasattr(peer, 'channel_id'):
                        group_id = f"-100{peer.channel_id}"
                        if group_id not in group_ids:
                            group_ids.append(group_id)
                    elif hasattr(peer, 'chat_id'):
                        chat_id = peer.chat_id
                        if chat_id < 0:
                            if str(chat_id) not in group_ids:
                                group_ids.append(str(chat_id))
                    # Skip if we can't resolve or extract ID
                    continue
                
                # Process entity
                if isinstance(entity, Chat):
                    # Normal group (not supergroup) - forums not possible
                    chat_id = entity.id
                    if chat_id < 0:
                        if str(chat_id) not in group_ids:
                            group_ids.append(str(chat_id))
                    
                elif isinstance(entity, Channel):
                    # Supergroup - check if forum-enabled
                    is_forum = getattr(entity, "forum", False)
                    
                    channel_id = entity.id
                    if channel_id > 0:
                        group_id = f"-100{channel_id}"
                        
                        if not is_forum:
                            # Normal supergroup (not forum)
                            if group_id not in group_ids:
                                group_ids.append(group_id)
                        else:
                            # Forum-enabled supergroup - get most active topic
                            topic_id = await get_most_active_topic(client, entity)
                            if topic_id:
                                # Save with topic ID
                                forum_entry = f"{group_id} | {topic_id}"
                                if forum_entry not in group_ids:
                                    group_ids.append(forum_entry)
                            else:
                                # No valid topics found, treat as normal group
                                if group_id not in group_ids:
                                    group_ids.append(group_id)
                
            except Exception:
                # Skip silently if entity resolution or processing fails
                continue
                
    except (ConnectionError, OSError) as e:
        error_msg = str(e)
        error_type = str(type(e).__name__)
        if "ReadError" in error_type or "ReadError" in error_msg:
            pass
        elif "NetworkError" in error_type or "Connection" in error_msg:
            logger.warning(f"Network error extracting groups from chatlist: {e}")
        else:
            logger.error(f"Error extracting groups from chatlist: {e}")
    except Exception as e:
        logger.error(f"Error extracting groups from chatlist: {e}")
    return group_ids


async def process_chatlist_phase_cleanup(
    config: dict
) -> Tuple[str, Dict[str, str]]:
    """PHASE 1: Cleanup - Leave all existing chatlists (SEQUENTIAL). Returns (result_message, session_states)"""
    session_files = get_session_files()
    accounts = config["accounts"]
    num_accounts = len(accounts)
    session_states = {}
    
    if not session_files:
        return ("No session files found", session_states)
    
    # PHASE 0: Filter sessions - skip unauthorized/frozen
    eligible_sessions = []
    for idx, session_file in enumerate(session_files):
        account_idx = idx % num_accounts
        account = accounts[account_idx]
        session_name = session_file.stem
        
        client = TelegramClient(
            str(session_file),
            account["api_id"],
            account["api_hash"]
        )
        
        try:
            await client.connect()
            if await client.is_user_authorized():
                eligible_sessions.append((session_file, account, session_name))
            else:
                logger.warning(f"Session {session_name} is not authorized - skipping")
            await client.disconnect()
        except:
            try:
                await client.disconnect()
            except:
                pass
    
    # PHASE 1: Parallel batch cleanup - process 3 sessions at a time with random delays between batches
    async def process_single_session(session_file, account, session_name):
        """Process a single session cleanup - extracted for parallel execution"""
        client = TelegramClient(
            str(session_file),
            account["api_id"],
            account["api_hash"]
        )
        
        try:
            await client.connect()
            success, folders_left = await cleanup_chatlists(client, session_name)
            if success:
                return ("CLEANED", session_name)
            else:
                return ("FAILED", session_name)
        except RPCError as e:
            error_code = e.code if hasattr(e, 'code') else None
            if error_code == 420 or "FROZEN_METHOD_INVALID" in str(e):
                logger.warning(f"Session {session_name}: FROZEN_SESSION during cleanup")
                return ("FROZEN_SESSION", session_name)
            else:
                return ("FAILED", session_name)
        except Exception as e:
            logger.error(f"Error in cleanup for session {session_name}: {e}")
            return ("FAILED", session_name)
        finally:
            try:
                await client.disconnect()
            except:
                pass
    
    cleaned_count = 0
    failed_count = 0
    frozen_count = 0
    batch_size = 3
    
    # Process sessions in batches of 3, with random 1-2 minute delays between batches
    for batch_start in range(0, len(eligible_sessions), batch_size):
        batch = eligible_sessions[batch_start:batch_start + batch_size]
        batch_num = (batch_start // batch_size) + 1
        total_batches = (len(eligible_sessions) + batch_size - 1) // batch_size
        
        logger.info(f"Starting batch {batch_num}/{total_batches} with {len(batch)} sessions in parallel")
        
        # Process batch in parallel
        tasks = [process_single_session(session_file, account, session_name) 
                 for session_file, account, session_name in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        for result in results:
            if isinstance(result, Exception):
                failed_count += 1
                logger.error(f"Batch processing exception: {result}")
            else:
                status, session_name = result
                session_states[session_name] = status
                if status == "CLEANED":
                    cleaned_count += 1
                elif status == "FROZEN_SESSION":
                    frozen_count += 1
                else:
                    failed_count += 1
        
        # Random delay between batches (1-2 minutes) - skip delay after last batch
        if batch_start + batch_size < len(eligible_sessions):
            delay_seconds = random.randint(60, 120)
            logger.info(f"Batch {batch_num} complete. Waiting {delay_seconds} seconds before next batch...")
            await asyncio.sleep(delay_seconds)
    
    result_msg = f"PHASE 1 CLEANUP complete\n\nCLEANED: {cleaned_count}\nFROZEN: {frozen_count}\nFAILED: {failed_count}"
    return (result_msg, session_states)


async def process_chatlist_phase_join(
    chatlist_links: List[str],
    config: dict,
    session_states: Dict[str, str],
    controller_app: Application
) -> Tuple[str, Optional[str]]:
    """PHASE 2: Join - Sequential processing (outer loop: chatlists, inner loop: sessions). Returns (result_message, folder_file_path)"""
    session_files = get_session_files()
    accounts = config["accounts"]
    num_accounts = len(accounts)
    
    if not session_files:
        return ("No session files found", None)
    
    # Extract invite hashes
    invite_hashes = []
    for link in chatlist_links:
        hash_val = extract_chatlist_hash(link)
        if hash_val:
            invite_hashes.append(hash_val)
        else:
            logger.warning(f"Invalid chatlist link format: {link}")
    
    if not invite_hashes:
        return ("No valid chatlist links provided", None)
    
    all_group_ids = set()
    success_count = 0
    failed_count = 0
    frozen_count = 0
    limit_reached_count = 0
    
    # Helper function for processing single session join
    async def process_single_join(session_file, account, session_name, invite_hash):
        """Process a single session join - extracted for parallel execution"""
        client = TelegramClient(
            str(session_file),
            account["api_id"],
            account["api_hash"]
        )
        
        group_ids_result = []
        status_result = "FAILED"
        
        try:
            await client.connect()
            if not await client.is_user_authorized():
                return ("SKIPPED", session_name, [])
            
            # Step 1: PREVIEW CHATLIST (MANDATORY) - CheckChatlistInviteRequest
            try:
                invite = await client(CheckChatlistInviteRequest(slug=invite_hash))
            except RPCError as e:
                error_code = e.code if hasattr(e, 'code') else None
                error_msg = str(e)
                if error_code == 420 or "FROZEN_METHOD_INVALID" in error_msg or "420" in error_msg:
                    logger.warning(f"Session {session_name}: FROZEN_SESSION")
                    return ("FROZEN_SESSION", session_name, [])
                await client.disconnect()
                return ("FAILED", session_name, [])
            except Exception as e:
                logger.error(f"Session {session_name}: Failed to check chatlist invite: {e}")
                await client.disconnect()
                return ("FAILED", session_name, [])
            
            # Step 2: Check if folder is already joined
            if hasattr(invite, "filter_id") and invite.filter_id is not None:
                logger.info(f"Session {session_name}: FOLDER_ALREADY_JOINED {invite_hash} (filter_id: {invite.filter_id})")
                group_ids = await extract_groups_from_chatlist(client, invite_hash)
                await client.disconnect()
                return ("ALREADY_JOINED", session_name, group_ids if group_ids else [])
            
            # Step 3: Extract peers
            peers = getattr(invite, "peers", [])
            
            # Step 4: HARD GUARD - If peers is empty, skip join
            if not peers or len(peers) == 0:
                logger.warning(f"Session {session_name}: JOIN_SKIPPED_EMPTY_PEERS {invite_hash}")
                # Extract groups from invite.chats if available (PREVIEW_ONLY)
                group_ids = []
                if hasattr(invite, 'chats') and invite.chats:
                    for chat in invite.chats:
                        if isinstance(chat, Channel):
                            channel_id = chat.id
                            if channel_id > 0:
                                group_id = f"-100{channel_id}"
                                if group_id not in group_ids:
                                    group_ids.append(group_id)
                        elif isinstance(chat, Chat):
                            chat_id = chat.id
                            if chat_id < 0:
                                if str(chat_id) not in group_ids:
                                    group_ids.append(str(chat_id))
                await client.disconnect()
                return ("SKIPPED_EMPTY", session_name, group_ids)
            
            # Step 5: JOIN CHATLIST
            try:
                await client(JoinChatlistInviteRequest(slug=invite_hash, peers=peers))
                logger.info(f"Session {session_name}: JOINED chatlist {invite_hash} with {len(peers)} peers")
                status_result = "JOINED"
                # Extract groups after successful join
                group_ids_result = await extract_groups_from_chatlist(client, invite_hash)
            except RPCError as e:
                error_code = e.code if hasattr(e, 'code') else None
                error_msg = str(e)
                if error_code == 400 and "CHATLISTS_TOO_MUCH" in error_msg:
                    logger.warning(f"Session {session_name}: CHATLIST_LIMIT_REACHED")
                    status_result = "CHATLIST_LIMIT_REACHED"
                else:
                    logger.error(f"Session {session_name}: JOIN_FAILED: {e}")
                    status_result = "FAILED"
            except (ConnectionError, OSError) as e:
                error_msg = str(e)
                error_type = str(type(e).__name__)
                if "ReadError" not in error_type and "ReadError" not in error_msg:
                    logger.error(f"Session {session_name}: JOIN_FAILED network error: {e}")
                status_result = "FAILED"
            except Exception as e:
                logger.error(f"Session {session_name}: JOIN_FAILED: {e}")
                status_result = "FAILED"
            
            await client.disconnect()
            return (status_result, session_name, group_ids_result if group_ids_result else [])
            
        except Exception as e:
            logger.error(f"Error processing session {session_name}: {e}")
            try:
                await client.disconnect()
            except:
                pass
            return ("FAILED", session_name, [])
    
    # OUTER LOOP: chatlist links (one by one)
    for invite_hash in invite_hashes:
        # Get eligible sessions for this chatlist
        eligible_for_join = []
        for idx, session_file in enumerate(session_files):
            account_idx = idx % num_accounts
            account = accounts[account_idx]
            session_name = session_file.stem
            
            # Skip if not CLEANED
            if session_states.get(session_name) != "CLEANED":
                continue
            
            # Skip if already frozen or limit reached
            if session_states.get(session_name) == "FROZEN_SESSION" or session_states.get(session_name) == "CHATLIST_LIMIT_REACHED":
                continue
            
            eligible_for_join.append((session_file, account, session_name))
        
        # Process eligible sessions in batches of 3 with random delays
        batch_size = 3
        for batch_start in range(0, len(eligible_for_join), batch_size):
            batch = eligible_for_join[batch_start:batch_start + batch_size]
            batch_num = (batch_start // batch_size) + 1
            total_batches = (len(eligible_for_join) + batch_size - 1) // batch_size
            
            logger.info(f"Chatlist {invite_hash}: Starting batch {batch_num}/{total_batches} with {len(batch)} sessions in parallel")
            
            # Process batch in parallel
            tasks = [process_single_join(session_file, account, session_name, invite_hash)
                     for session_file, account, session_name in batch]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Process results
            for result in results:
                if isinstance(result, Exception):
                    failed_count += 1
                    logger.error(f"Batch processing exception: {result}")
                else:
                    status, session_name, group_ids = result
                    if group_ids:
                        all_group_ids.update(group_ids)
                    
                    if status == "JOINED":
                        success_count += 1
                    elif status == "FROZEN_SESSION":
                        session_states[session_name] = "FROZEN_SESSION"
                        frozen_count += 1
                    elif status == "CHATLIST_LIMIT_REACHED":
                        session_states[session_name] = "CHATLIST_LIMIT_REACHED"
                        limit_reached_count += 1
                    elif status in ["SKIPPED", "ALREADY_JOINED", "SKIPPED_EMPTY"]:
                        pass  # Don't count as failure
                    else:
                        failed_count += 1
            
            # Random delay between batches (1-2 minutes) - skip delay after last batch
            if batch_start + batch_size < len(eligible_for_join):
                delay_seconds = random.randint(60, 120)
                logger.info(f"Chatlist {invite_hash} batch {batch_num} complete. Waiting {delay_seconds} seconds before next batch...")
                await asyncio.sleep(delay_seconds)
        
        # After EACH chatlist: wait 30 seconds
        if invite_hash != invite_hashes[-1]:  # Don't wait after last chatlist
            logger.info(f"Chatlist {invite_hash} complete. Waiting 30 seconds before next chatlist...")
            await asyncio.sleep(30)
    
    # Save groups to groups.txt (merge with existing if any)
    if all_group_ids:
        # Load existing groups
        existing_groups = load_groups()
        # Merge and deduplicate
        all_groups = list(set(existing_groups + all_group_ids))
        # Save to groups.txt
        if save_groups(all_groups):
            result_msg = f"✅ Chatlist processed successfully\n\nJOINED: {success_count}\nLIMIT_REACHED: {limit_reached_count}\nFROZEN: {frozen_count}\nFAILED: {failed_count}\n\nGroups: {len(all_group_ids)} new groups added\nTotal: {len(all_groups)} groups in groups.txt"
        else:
            result_msg = f"⚠️ Groups extracted but failed to save\n\nJOINED: {success_count}\nGroups: {len(all_group_ids)}"
        return (result_msg, "groups.txt")
    else:
        result_msg = f"❌ No groups extracted from chatlist\n\nJOINED: {success_count}\nLIMIT_REACHED: {limit_reached_count}\nFROZEN: {frozen_count}\nFAILED: {failed_count}"
        return (result_msg, None)


async def process_chatlist_links(
    chatlist_links: List[str],
    config: dict,
    controller_app: Application
) -> Tuple[str, Optional[str]]:
    """Two-phase chatlist processing: CLEANUP then JOIN (sequential execution)"""
    # PHASE 1: Cleanup (sequential)
    cleanup_msg, session_states = await process_chatlist_phase_cleanup(config)
    logger.info(f"PHASE 1 result: {cleanup_msg}")
    
    # WAIT EXACTLY 30 SECONDS after cleanup
    logger.info("Waiting 30 seconds before PHASE 2...")
    await asyncio.sleep(30)
    
    # PHASE 2: Join (sequential)
    join_msg, folder_file = await process_chatlist_phase_join(chatlist_links, config, session_states, controller_app)
    logger.info(f"PHASE 2 result: {join_msg}")
    
    result_msg = f"{cleanup_msg}\n\n{join_msg}"
    return (result_msg, folder_file)


def get_folder_files() -> List[Path]:
    """Get all folder files from groups/ directory"""
    groups_dir = Path("groups")
    if not groups_dir.exists():
        return []
    return list(groups_dir.glob("folder_*.txt"))


def delete_folder_file(folder_path: str) -> bool:
    """Delete a folder file"""
    try:
        folder_file = Path(folder_path)
        if folder_file.exists() and folder_file.name.startswith("folder_"):
            folder_file.unlink()
            return True
        return False
    except Exception as e:
        logger.error(f"Error deleting folder file: {e}")
        return False


def distribute_groups(groups: List[str], num_clients: int) -> List[List[str]]:
    """Distribute groups evenly across clients"""
    if num_clients == 0:
        return []
    
    groups_per_client = len(groups) // num_clients
    remainder = len(groups) % num_clients
    
    distribution = []
    start_idx = 0
    
    for i in range(num_clients):
        # Distribute remainder groups to first few clients
        count = groups_per_client + (1 if i < remainder else 0)
        distribution.append(groups[start_idx:start_idx + count])
        start_idx += count
    
    return distribution


async def forward_to_group(
    client: TelegramClient,
    channel_username: str,
    message_id: int,
    group_identifier: str,
    account_num: int
) -> Tuple[bool, Optional[Any], Optional[Any], Optional[str]]:
    """Forward a message to a specific group. Returns (success, sent_message, entity, error_reason)"""
    target_entity = None
    
    # Ensure client is connected
    if not await ensure_client_connected(client):
        error_reason = "Failed to connect client"
        return (False, None, None, error_reason)
    
    try:
        # Get the message from source channel
        source_entity = await client.get_entity(channel_username)
        
        # CRITICAL FIX: Match forwarder.py pattern (line 79-83) - use forward_messages with raw ID and from_peer
        # This works even if session hasn't seen the group before (unlike get_entity which requires cached entity)
        try:
            # Check if group_identifier is a numeric ID (format: -100xxxxxxxxx)
            group_id_str = group_identifier.strip()
            if group_id_str.startswith('-100') and len(group_id_str) > 4 and group_id_str[1:].isdigit():
                # Use raw numeric ID directly (same as forwarder.py) - NO entity resolution needed
                group_id = int(group_id_str)
                # Forward using raw ID with from_peer as string (not entity) - matches forwarder.py line 82
                result = await client.forward_messages(
                    entity=group_id,
                    messages=message_id,
                    from_peer=channel_username  # String channel name, not entity object (same as forwarder.py)
                )
                # Handle both single Message and list return types
                if isinstance(result, list):
                    sent_message = result[0] if result else None
                else:
                    sent_message = result  # It's already a Message object
                
                # Try to get target_entity for logging (optional, may fail)
                try:
                    target_entity = await client.get_entity(group_id)
                except:
                    target_entity = None  # Entity resolution failed, but forward succeeded
            else:
                # For usernames or other formats, resolve entity first then forward
                target_entity = await client.get_entity(group_identifier)
                message = await client.get_messages(source_entity, ids=message_id)
                if not message:
                    error_reason = extract_short_reason(Exception(f"Message {message_id} not found in {channel_username}"))
                    return (False, None, None, error_reason)
                result = await client.forward_messages(target_entity, message)
                # Handle both single Message and list return types
                if isinstance(result, list):
                    sent_message = result[0] if result else None
                else:
                    sent_message = result  # It's already a Message object
        except Exception as e:
            error_reason = extract_short_reason(e)
            error_str = str(e).lower()
            
            # Enhanced error handling for common errors
            if "banned" in error_str or "userbanned" in error_str:
                error_reason = "Account is banned"
            elif "write" in error_str and "permission" in error_str:
                error_reason = "No write permission in group"
            elif "entity" in error_str and "not found" in error_str:
                error_reason = "Group not found or not accessible"
            elif "flood" in error_str or "rate limit" in error_str:
                error_reason = "Rate limited - too many requests"
            elif "chat_write_forbidden" in error_str:
                error_reason = "Cannot write to this chat"
            else:
                error_reason = extract_short_reason(e)
            
            logger.error(f"Account {account_num}: Failed to forward to {group_identifier}: {error_reason}")
            return (False, None, None, error_reason)
        
        if not sent_message:
            error_reason = "Forward returned no message"
            return (False, None, target_entity, error_reason)
        
        return (True, sent_message, target_entity, None)
        
    except Exception as e:
        error_reason = extract_short_reason(e)
        logger.error(f"Account {account_num}: Failed to forward to {group_identifier}: {e}")
        return (False, None, target_entity, error_reason)


class SessionStatus:
    ACTIVE = "ACTIVE"
    FROZEN = "FROZEN"
    UNAUTHORIZED = "UNAUTHORIZED"


async def check_session_status(session_path: str, api_id: str, api_hash: str):
    """
    Check the status of a Telegram session (extracted from frozen.py)
    
    Args:
        session_path: Path to the .session file
        api_id: API ID for the account
        api_hash: API hash for the account
    
    Returns:
        tuple: (status, details_dict)
    """
    # Remove .session extension if present
    if session_path.endswith('.session'):
        session_path = session_path[:-8]
    
    client = TelegramClient(session_path, int(api_id), api_hash)
    
    try:
        await client.connect()
        
        # STEP 1: Check if the session is authorized (logged in)
        is_authorized = await client.is_user_authorized()
        
        if not is_authorized:
            await client.disconnect()
            return SessionStatus.UNAUTHORIZED, {
                "logged_in": False,
                "can_send": False,
                "can_read": False,
                "message": "Session is not logged in - UNAUTHORIZED"
            }
        
        # STEP 2: Get user information
        try:
            me = await client.get_me()
            user_info = {
                "user_id": me.id,
                "username": me.username,
                "phone": me.phone,
                "first_name": me.first_name,
                "last_name": me.last_name
            }
        except Exception as e:
            await client.disconnect()
            return SessionStatus.UNAUTHORIZED, {
                "logged_in": False,
                "error": str(e),
                "message": "Could not retrieve user information"
            }
        
        # STEP 3: Test READ capability
        try:
            dialogs = await client.get_dialogs(limit=5)
            can_read = True
        except Exception as e:
            can_read = False
        
        # STEP 4: Test WRITE capability (send message)
        can_send = False
        freeze_error = None
        
        try:
            # Try to send a message to Saved Messages (self)
            test_message = await client.send_message('me', '🔍 Test')
            can_send = True
            
            # Clean up test message
            try:
                await client.delete_messages('me', test_message.id)
            except:
                pass
                
        except UserDeactivatedError as e:
            freeze_error = "UserDeactivatedError"
            
        except UserDeactivatedBanError as e:
            freeze_error = "UserDeactivatedBanError"
            
        except ChatWriteForbiddenError as e:
            freeze_error = "ChatWriteForbiddenError"
            
        except UserRestrictedError as e:
            freeze_error = "UserRestrictedError"
            
        except FloodWaitError as e:
            can_send = True  # Account is active, just rate limited
            
        except Exception as e:
            error_msg = str(e).lower()
            # Check if error indicates frozen/restricted account
            if any(keyword in error_msg for keyword in 
                   ['restricted', 'banned', 'deactivated', 'frozen', 'forbidden']):
                freeze_error = str(e)
            else:
                # Unknown error, might still be active
                can_send = False
        
        await client.disconnect()
        
        # STEP 5: Determine final status
        if can_send:
            return SessionStatus.ACTIVE, {
                "logged_in": True,
                "can_send": True,
                "can_read": can_read,
                **user_info,
                "message": "Account is ACTIVE and fully functional"
            }
        elif freeze_error:
            return SessionStatus.FROZEN, {
                "logged_in": True,
                "can_send": False,
                "can_read": can_read,
                **user_info,
                "freeze_reason": freeze_error,
                "message": "Account is FROZEN - Can only read, cannot send"
            }
        else:
            # Logged in but couldn't determine write capability
            return SessionStatus.FROZEN, {
                "logged_in": True,
                "can_send": False,
                "can_read": can_read,
                **user_info,
                "message": "Account status unclear - Possibly FROZEN"
            }
            
    except AuthKeyUnregisteredError:
        await client.disconnect()
        return SessionStatus.UNAUTHORIZED, {
            "logged_in": False,
            "message": "Auth key is unregistered - Session UNAUTHORIZED"
        }
        
    except SessionPasswordNeededError:
        await client.disconnect()
        return SessionStatus.UNAUTHORIZED, {
            "logged_in": False,
            "message": "2FA password needed - Session UNAUTHORIZED"
        }
        
    except Exception as e:
        try:
            await client.disconnect()
        except:
            pass
        return SessionStatus.UNAUTHORIZED, {
            "logged_in": False,
            "error": str(e),
            "message": f"Connection error - Session likely UNAUTHORIZED: {str(e)}"
        }


def parse_group_with_topic(group_str: str) -> Tuple[str, Optional[int]]:
    """
    Parse group string to extract group_id and topic_id (if forum)
    
    Formats:
    - Normal group: "-100xxxxxxxx"
    - Forum group: "-100xxxxxxxx | <topic_id>" or "-100xxxxxxxx|<topic_id>"
    
    Returns:
        tuple: (group_id_str, topic_id or None)
    """
    group_str = group_str.strip()
    
    # Check if it contains topic ID (format: group_id | topic_id or group_id|topic_id)
    if '|' in group_str:
        parts = group_str.split('|', 1)
        group_id_str = parts[0].strip()
        try:
            topic_id = int(parts[1].strip())
            return (group_id_str, topic_id)
        except (ValueError, IndexError):
            # Invalid format, treat as normal group
            return (group_id_str, None)
    
    # Normal group without topic
    return (group_str, None)


def _classify_error_in_worker(error_str: str) -> str:
    """Classify error string into specific user-friendly error message"""
    error_lower = error_str.lower()
    
    # Account authentication errors
    if any(term in error_lower for term in ['session not authorized', 'authkeyunregistered', 'unauthorized', 'authkey']):
        return 'Account is unauth'
    elif any(term in error_lower for term in ['banned', 'userbanned', 'phonenumberbanned', 'user banned']):
        return 'Account banned'
    elif any(term in error_lower for term in ['frozen', 'userrestricted', 'user restricted', 'deactivated']):
        return 'Account frozen'
    elif any(term in error_lower for term in ['deactivated', 'userdeactivated', 'user deactivated']):
        return 'Account deactivated'
    elif any(term in error_lower for term in ['password needed', 'sessionpasswordneeded', '2fa']):
        return 'Account 2FA required'
    
    # Rate limiting / Flood errors
    elif any(term in error_lower for term in ['flood', 'wait', 'rate limit', 'ratelimit', 'slow down']):
        # Extract wait time if available
        match = re.search(r'(\d+)', error_str)
        if match:
            wait_time = match.group(1)
            return f'Slow down ({wait_time}s)'
        return 'Slow down'
    
    # Chat/Group restriction errors (check these first as they're more specific)
    elif any(term in error_lower for term in ['chatrestricted', 'chat restricted', 'restricted and cannot be used']):
        return 'Chat restricted'
    elif any(term in error_lower for term in ['chat_write_forbidden', 'write forbidden', 'can\'t write', 'cannot write', 'writeforbidden', 'chatwriteforbidden']):
        return 'Chat write forbidden'
    elif any(term in error_lower for term in ['chatadminrequired', 'admin required', 'not admin', 'adminrequired']):
        return 'Group admin required'
    elif any(term in error_lower for term in ['topicclosed', 'topic closed', 'topic is closed']):
        return 'Topic closed'
    elif any(term in error_lower for term in ['permission', 'no permission', 'insufficient permission']):
        return 'Group permission denied'
    
    # Group availability errors
    elif any(term in error_lower for term in ['entity not found', 'entitynotfound', 'chat not found', 'group not found', 'channel not found', 'could not find the input entity']):
        return 'Group not found'
    elif any(term in error_lower for term in ['channel private', 'private channel', 'channel is private']):
        return 'Group is private'
    elif any(term in error_lower for term in ['kicked', 'banned from', 'removed from']):
        return 'Account removed from group'
    elif any(term in error_lower for term in ['invite required', 'invite needed', 'need invite']):
        return 'Group invite required'
    
    # Payment errors
    elif any(term in error_lower for term in ['payment required', 'paywall', 'premium required', 'allowpaymentrequired']):
        return 'Group requires payment'
    
    # Message errors
    elif any(term in error_lower for term in ['message not found', 'message deleted', 'message removed']):
        return 'Message not found'
    elif any(term in error_lower for term in ['message too long', 'message length']):
        return 'Message too long'
    
    # Network/Connection errors
    elif any(term in error_lower for term in ['timeout', 'timed out', 'connection timeout']):
        return 'Connection timeout'
    elif any(term in error_lower for term in ['connection', 'network', 'disconnected', 'connectionerror']):
        return 'Connection error'
    
    # Retry exceeded
    elif 'max_retries' in error_lower or 'retries exceeded' in error_lower:
        return 'Max retries exceeded'
    
    # Unknown error - return first 50 chars of original error
    else:
        # Try to extract meaningful part
        if len(error_str) > 50:
            return f'Error: {error_str[:47]}...'
        return f'Error: {error_str}'

def _escape_html(text: str) -> str:
    """Escape HTML special characters in dynamic text (not URLs)"""
    if not text:
        return ""
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


class SessionHealthStatus:
    """Session health status from @spambot check"""
    ACTIVE = "ACTIVE"
    TEMP_LIMITED = "TEMP_LIMITED"
    HARD_LIMITED = "HARD_LIMITED"
    FROZEN = "FROZEN"
    UNKNOWN = "UNKNOWN"
    FAILED = "FAILED"


async def check_session_health_spambot(
    session_path: str,
    api_id: int,
    api_hash: str,
    timeout: int = 30
) -> Tuple[str, Optional[str]]:
    """
    Check session health by messaging @spambot and parsing response.
    
    Returns:
        Tuple[status, release_date_or_details]
        status: ACTIVE, TEMP_LIMITED, HARD_LIMITED, FROZEN, UNKNOWN, FAILED
        release_date_or_details: Optional release date string or error details
    """
    client = TelegramClient(str(session_path), api_id, api_hash)
    
    try:
        await client.connect()
        
        if not await client.is_user_authorized():
            await client.disconnect()
            return (SessionHealthStatus.FAILED, "Not authorized")
        
        # Message @spambot
        try:
            # Send message to @spambot
            await client.send_message('spambot', '/start')
            
            # Wait a bit for @spambot to respond (usually responds quickly)
            await asyncio.sleep(2)
            
            # Get messages from @spambot (should have response now)
            messages = await client.get_messages('spambot', limit=5)
            
            if not messages or len(messages) == 0:
                await client.disconnect()
                return (SessionHealthStatus.UNKNOWN, "No response from @spambot")
            
            # Find the most recent message from @spambot (not from us)
            response_message = None
            for msg in messages:
                if msg.out is False:  # Message is from @spambot, not from us
                    response_message = msg
                    break
            
            if not response_message:
                await client.disconnect()
                return (SessionHealthStatus.UNKNOWN, "Could not find @spambot response")
            
            response_text = response_message.message.lower() if response_message.message else ""
            
            await client.disconnect()
            
            # Classify response
            # A. ACTIVE - "Good news, no limits are currently applied to your account. You're free as a bird!"
            if "good news" in response_text and "no limits" in response_text and "free as a bird" in response_text:
                return (SessionHealthStatus.ACTIVE, None)
            
            # B. TEMP_LIMITED - "your account is now limited until"
            if "your account is now limited until" in response_text:
                # Try to extract date
                date_match = re.search(r'until\s+(\d{1,2}\s+\w+\s+\d{4})', response_text, re.IGNORECASE)
                release_date = date_match.group(1) if date_match else None
                return (SessionHealthStatus.TEMP_LIMITED, release_date)
            
            # C. HARD_LIMITED - "Unfortunately, some actions can trigger a harsh response from our anti-spam systems"
            # OR "you can submit a complaint to our moderators"
            if ("unfortunately" in response_text and "harsh response" in response_text and "anti-spam" in response_text) or \
               ("submit a complaint" in response_text and "moderators" in response_text):
                return (SessionHealthStatus.HARD_LIMITED, None)
            
            # D. FROZEN/BANNED - "Your account was blocked for violations of the Telegram Terms of Service"
            if "your account was blocked" in response_text and "violations" in response_text and "terms of service" in response_text:
                return (SessionHealthStatus.FROZEN, None)
            
            # Unknown response
            return (SessionHealthStatus.UNKNOWN, f"Unknown response: {response_text[:100]}")
            
        except asyncio.TimeoutError:
            await client.disconnect()
            return (SessionHealthStatus.FAILED, "Timeout waiting for @spambot response")
        except Exception as e:
            await client.disconnect()
            return (SessionHealthStatus.FAILED, str(e))
            
    except Exception as e:
        try:
            await client.disconnect()
        except:
            pass
        return (SessionHealthStatus.FAILED, str(e))


async def check_all_sessions_health_parallel(
    session_files: List[Path],
    accounts: List[Dict],
    controller_app: Optional[Application],
    log_group_id: Optional[int],
    progress_callback: Optional[callable] = None
) -> Tuple[List[Tuple[Path, Dict, int, str, Optional[str]]], Dict[str, int]]:
    """
    Check health of all sessions in parallel using @spambot.
    
    Returns:
        Tuple of:
        - List of (session_file, account, account_num, status, details) for ALL sessions (for report)
        - Dict with counts: {"active": X, "temp_limited": Y, "hard_limited": Z, "frozen": W, "unknown": U, "failed": F}
    """
    if not session_files:
        return [], {"active": 0, "temp_limited": 0, "hard_limited": 0, "frozen": 0, "unknown": 0, "failed": 0}
    
    num_accounts = len(accounts)
    counts = {"active": 0, "temp_limited": 0, "hard_limited": 0, "frozen": 0, "unknown": 0, "failed": 0}
    all_results = []  # Store ALL results for report
    
    async def check_one_session(session_file: Path, account_idx: int) -> Tuple[Path, Dict, int, str, Optional[str]]:
        account = accounts[account_idx % num_accounts]
        account_num = account_idx + 1
        
        status, details = await check_session_health_spambot(
            str(session_file),
            account["api_id"],
            account["api_hash"]
        )
        
        return (session_file, account, account_num, status, details)
    
    # Send initial status
    if progress_callback:
        await progress_callback("⏳ Starting health check...")
    elif controller_app and log_group_id:
        try:
            await controller_app.bot.send_message(
                chat_id=log_group_id,
                text="⏳ Starting session health check...",
                parse_mode='HTML'
            )
        except:
            pass
    
    # Create all tasks
    tasks = []
    for idx, session_file in enumerate(session_files):
        tasks.append(check_one_session(session_file, idx))
    
    # Execute in parallel with progress updates
    for coro in asyncio.as_completed(tasks):
        try:
            session_file, account, account_num, status, details = await coro
            all_results.append((session_file, account, account_num, status, details))
            
            # Update counts
            status_lower = status.lower()
            if status_lower in counts:
                counts[status_lower] += 1
            
            # Format status message
            status_emoji = {
                SessionHealthStatus.ACTIVE: "✅",
                SessionHealthStatus.TEMP_LIMITED: "⚠️",
                SessionHealthStatus.HARD_LIMITED: "⛔",
                SessionHealthStatus.FROZEN: "❌",
                SessionHealthStatus.UNKNOWN: "❓",
                SessionHealthStatus.FAILED: "❌"
            }.get(status, "❓")
            
            status_text = {
                SessionHealthStatus.ACTIVE: "ACTIVE",
                SessionHealthStatus.TEMP_LIMITED: f"TEMP LIMITED{(' (until ' + details + ')') if details else ''}",
                SessionHealthStatus.HARD_LIMITED: "HARD LIMITED",
                SessionHealthStatus.FROZEN: "FROZEN",
                SessionHealthStatus.UNKNOWN: "UNKNOWN",
                SessionHealthStatus.FAILED: "FAILED"
            }.get(status, status)
            
            progress_msg = f"🔍 Account {account_num} | {status_emoji} {status_text}"
            
            # Send progress update
            if progress_callback:
                await progress_callback(progress_msg)
            elif controller_app and log_group_id:
                try:
                    await controller_app.bot.send_message(
                        chat_id=log_group_id,
                        text=progress_msg,
                        parse_mode='HTML'
                    )
                except:
                    pass
                
        except Exception as e:
            counts["failed"] += 1
            logger.error(f"Error in health check: {e}")
    
    return all_results, counts


def format_health_check_report(
    all_results: List[Tuple[Path, Dict, int, str, Optional[str]]],
    counts: Dict[str, int]
) -> str:
    """Format health check report for log group. Returns formatted HTML message."""
    report_lines = ["📊 <b>SESSION HEALTH CHECK REPORT</b>\n"]
    
    # Sort by account_num
    sorted_results = sorted(all_results, key=lambda x: x[2])
    
    for session_file, account, account_num, status, details in sorted_results:
        status_emoji = {
            SessionHealthStatus.ACTIVE: "✅",
            SessionHealthStatus.TEMP_LIMITED: "⚠️",
            SessionHealthStatus.HARD_LIMITED: "⛔",
            SessionHealthStatus.FROZEN: "❌",
            SessionHealthStatus.UNKNOWN: "❓",
            SessionHealthStatus.FAILED: "❌"
        }.get(status, "❓")
        
        status_text = {
            SessionHealthStatus.ACTIVE: "ACTIVE",
            SessionHealthStatus.TEMP_LIMITED: f"TEMP LIMITED{(' (until ' + details + ')') if details else ''}",
            SessionHealthStatus.HARD_LIMITED: "HARD LIMITED",
            SessionHealthStatus.FROZEN: "FROZEN",
            SessionHealthStatus.UNKNOWN: "UNKNOWN",
            SessionHealthStatus.FAILED: "FAILED"
        }.get(status, status)
        
        report_lines.append(f"Account {account_num} -> {status_emoji} {status_text}")
    
    report_lines.append("")
    report_lines.append(f"Active Sessions: {counts.get('active', 0)}")
    skipped = counts.get('temp_limited', 0) + counts.get('hard_limited', 0) + counts.get('frozen', 0) + counts.get('unknown', 0) + counts.get('failed', 0)
    report_lines.append(f"Skipped Sessions: {skipped}")
    
    return "\n".join(report_lines)


def safe_log_string(text: str) -> str:
    """Remove or replace Unicode characters that break Windows console encoding"""
    if not text:
        return ""
    # Replace problematic Unicode characters with ASCII equivalents
    replacements = {
        '\u27a4': '->',  # ➤ arrow
        '✅': '[OK]',
        '❌': '[FAIL]',
        '⏭️': '[SKIP]',
    }
    result = text
    for unicode_char, ascii_replacement in replacements.items():
        result = result.replace(unicode_char, ascii_replacement)
    return result


def log_event_to_queue(account_num: int, status: str, group_name: str, reason: Optional[str] = None, 
                       link: Optional[str] = None, log_queue: Optional[Queue] = None) -> None:
    """
    Unified logging helper that safely logs to console and sends to Telegram via log_queue.
    
    Args:
        account_num: Account number
        status: POSTED, FAILED, or SKIPPED
        group_name: Name of the group
        reason: Reason for failure/skip (optional)
        link: Message link for POSTED status (optional)
        log_queue: Queue to send HTML-formatted message to (required)
    """
    # Sanitize group_name for HTML
    escaped_name = _escape_html(group_name) if group_name else "Unknown"
    
    # Build HTML message for Telegram
    if status == 'POSTED':
        if link:
            html_msg = f"<b>Account {account_num}</b> -> <b>POSTED</b> | <a href=\"{link}\">{escaped_name}</a>"
        else:
            html_msg = f"<b>Account {account_num}</b> -> <b>POSTED</b> | {escaped_name}"
        # Safe console log (no Unicode)
        console_msg = f"Account {account_num} -> POSTED | {group_name}"
    elif status == 'FAILED':
        reason_text = _escape_html(reason or "Unknown error")
        html_msg = f"<b>Account {account_num}</b> -> <b>FAILED</b> | {escaped_name} | {reason_text}"
        # Safe console log
        console_msg = f"Account {account_num} -> FAILED | {group_name} | {reason or 'Unknown error'}"
    elif status == 'SKIPPED':
        reason_text = _escape_html(reason or "Skipped")
        html_msg = f"<b>Account {account_num}</b> -> <b>SKIPPED</b> | {escaped_name} | {reason_text}"
        # Safe console log
        console_msg = f"Account {account_num} -> SKIPPED | {group_name} | {reason or 'Skipped'}"
    else:
        html_msg = f"<b>Account {account_num}</b> -> {status} | {escaped_name}"
        console_msg = f"Account {account_num} -> {status} | {group_name}"
    
    # Log to console safely (UTF-8 safe, no Unicode chars)
    try:
        logger.info(safe_log_string(console_msg))
    except Exception as e:
        # If logging fails, try to print safely to stderr
        try:
            print(safe_log_string(console_msg), file=sys.stderr, flush=True)
        except:
            pass
    
    # Send to Telegram via queue
    if log_queue is not None:
        try:
            log_queue.put(html_msg)
        except Exception as e:
            # If queue put fails, at least log to file directly
            try:
                log_file = Path("logs") / f"adbot_{datetime.now().strftime('%Y%m%d')}.log"
                with open(log_file, 'a', encoding='utf-8') as f:
                    f.write(f"{datetime.now().isoformat()} - {safe_log_string(console_msg)}\n")
            except:
                pass

# Worker process function for true multiprocessing (matches forwarder.py pattern)
async def worker_forwarding_loop(
    session_path: str,
    api_id: int,
    api_hash: str,
    assigned_groups: List[str],
    account_num: int,
    is_running_mp: MPEvent,
    shutdown_event_mp: MPEvent,
    log_queue: Queue
):
    """Worker process async loop - runs in separate process with its own TelegramClient"""
    # CRITICAL: Each process has its own event loop (created by asyncio.run())
    # Telethon will use the running loop automatically, no need to pass loop parameter
    client = TelegramClient(str(session_path), api_id, api_hash)
    
    delay_between_posts = 5  # Default, will be loaded from config
    delay_between_cycles = 60  # Default, will be loaded from config
    
    try:
        await client.connect()
        
        if not await client.is_user_authorized():
            log_queue.put(f"<b>Account {account_num}</b> ➤ <b>DISABLED</b> | AUTH | Session not authorized")
            return
        
        # Main cycle loop - runs continuously
        while True:
            # Check shutdown signal
            if shutdown_event_mp.is_set():
                log_queue.put(f"<b>Account {account_num}</b> ➤ <b>DISABLED</b> | SHUTDOWN | Signal received")
                break
            
            # Check if paused
            if not is_running_mp.is_set():
                await asyncio.sleep(5)
                continue
            
            try:
                # Load config fresh each cycle
                config_data = load_config()
                delay_between_posts = config_data.get("delay_between_posts", 5)
                delay_between_cycles = config_data.get("delay_between_cycles", 60)
                log_group_id = config_data.get("log_group_id")
                
                post_links = get_post_links(config_data)
                
                if not post_links or (len(post_links) == 1 and post_links[0] == "t.me/channel/123"):
                    await asyncio.sleep(delay_between_cycles)
                    continue
                
                # Select random post link
                post_link = select_random_post_link(config_data)
                if not post_link:
                    await asyncio.sleep(delay_between_cycles)
                    continue
                
                channel_username, message_id = parse_post_link(post_link)
                
                # Check scheduled posting window
                if not is_in_schedule_window(config_data):
                    await asyncio.sleep(60)  # Check every minute if outside schedule
                    continue
                
                # Forward to assigned groups
                for group in assigned_groups:
                    if shutdown_event_mp.is_set() or not is_running_mp.is_set():
                        break
                    
                    # Check if outside schedule window
                    if not is_in_schedule_window(config_data):
                        break
                    
                    # Parse group string to extract group_id
                    group_id_str, _ = parse_group_with_topic(group)
                    
                    # Check if group is blacklisted
                    if is_group_blacklisted_file(account_num, group_id_str):
                        continue  # Skip blacklisted groups
                    
                    target_entity = None
                    group_name = None
                    sent_message = None
                    error = None
                    response_time = None
                    group_id = None
                    
                    try:
                        # Parse group string to extract group_id and topic_id (if forum)
                        group_id_str, topic_id = parse_group_with_topic(group)
                        
                        # Start timing for response time tracking
                        start_time = asyncio.get_event_loop().time()
                        
                        # Auto-retry with FloodWait handling
                        max_retries = 3
                        retry_count = 0
                        result = None
                        
                        while retry_count < max_retries:
                            try:
                                # Ensure client is connected
                                if not client.is_connected():
                                    await client.connect()
                                    # Re-check authorization on reconnect
                                    if not await client.is_user_authorized():
                                        error = Exception("Session not authorized after reconnect")
                                        break
                                
                                # Use forwarder.py pattern - raw ID with from_peer as string
                                if group_id_str.startswith('-100') and len(group_id_str) > 4 and group_id_str[1:].replace('-', '').isdigit():
                                    group_id = int(group_id_str)
                                    # Try to get entity for logging (only on first attempt)
                                    if retry_count == 0:
                                        try:
                                            target_entity = await client.get_entity(group_id)
                                            if hasattr(target_entity, 'title'):
                                                group_name = target_entity.title
                                            elif hasattr(target_entity, 'username'):
                                                group_name = f"@{target_entity.username}"
                                        except:
                                            pass
                                    
                                    # Forward using raw ID (matches forwarder.py line 79-83)
                                    # If topic_id exists, forward to forum topic
                                    if topic_id is not None:
                                        # Forward to forum topic using reply_to parameter
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
                                        # Normal group forwarding
                                        result = await client.forward_messages(
                                            entity=group_id,
                                            messages=message_id,
                                            from_peer=channel_username
                                        )
                                    
                                    # Success - break retry loop
                                    break
                                
                                else:
                                    # Username format - resolve entity first
                                    if retry_count == 0:
                                        try:
                                            target_entity = await client.get_entity(group)
                                            if hasattr(target_entity, 'title'):
                                                group_name = target_entity.title
                                            elif hasattr(target_entity, 'username'):
                                                group_name = f"@{target_entity.username}"
                                        except:
                                            pass
                                    
                                    if target_entity:
                                        message = await client.get_messages(channel_username, ids=message_id)
                                        if message:
                                            result = await client.forward_messages(target_entity, message)
                                            break
                                        else:
                                            error = Exception(f"Message {message_id} not found")
                                            break
                                    else:
                                        error = Exception(f"Could not resolve entity: {group}")
                                        break
                            
                            except FloodWaitError as fw_error:
                                # Handle FloodWait - wait EXACT seconds and retry ONCE only
                                wait_seconds = fw_error.seconds
                                retry_count += 1
                                
                                if retry_count == 1:  # Only retry once for FloodWait
                                    log_event_to_queue(
                                        account_num, 'SKIPPED', group_name or str(group),
                                        reason=f"FLOODWAIT ({wait_seconds}s)",
                                        log_queue=log_queue
                                    )
                                    await asyncio.sleep(wait_seconds)
                                    continue
                                else:
                                    error = fw_error
                                    break
                            
                            except UserBannedInChannelError:
                                # ACCOUNT_BANNED - STOP immediately, no retry
                                log_event_to_queue(
                                    account_num, 'FAILED', group_name or str(group),
                                    reason="ACCOUNT_BANNED",
                                    log_queue=log_queue
                                )
                                # Stop worker immediately - banned accounts must not continue
                                raise SystemExit(f"Account {account_num} is banned - stopping worker")
                            
                            except ChatWriteForbiddenError:
                                # WRITE_FORBIDDEN - blacklist group, no retry
                                error = Exception("WRITE_FORBIDDEN")
                                if group_id_str:
                                    add_to_blacklist_file(account_num, group_id_str)
                                log_event_to_queue(
                                    account_num, 'FAILED', group_name or str(group),
                                    reason="WRITE_FORBIDDEN",
                                    log_queue=log_queue
                                )
                                break  # Skip to next group
                            
                            except ChatRestrictedError:
                                # CHAT_RESTRICTED - skip group, no retry
                                error = Exception("CHAT_RESTRICTED")
                                log_event_to_queue(
                                    account_num, 'SKIPPED', group_name or str(group),
                                    reason="CHAT_RESTRICTED",
                                    log_queue=log_queue
                                )
                                break  # Skip to next group
                            
                            except UserRestrictedError:
                                # FROZEN - skip account, no retry
                                error = Exception("FROZEN")
                                log_event_to_queue(
                                    account_num, 'SKIPPED', group_name or str(group),
                                    reason="FROZEN",
                                    log_queue=log_queue
                                )
                                break  # Skip account
                            
                            except (ConnectionError, OSError, TimeoutError) as conn_error:
                                # Connection error - try to reconnect and retry (only for connection errors)
                                retry_count += 1
                                if retry_count < max_retries:
                                    try:
                                        if client.is_connected():
                                            await client.disconnect()
                                        await asyncio.sleep(2)  # Brief delay before reconnect
                                        await client.connect()
                                        log_event_to_queue(
                                            account_num, 'SKIPPED', group_name or str(group),
                                            reason="RECONNECTED",
                                            log_queue=log_queue
                                        )
                                        continue
                                    except Exception as reconnect_error:
                                        error = reconnect_error
                                        break
                                else:
                                    error = conn_error
                                    break
                            
                            except AuthKeyUnregisteredError:
                                # Session invalid - no point retrying
                                error = Exception("Session not authorized - AuthKeyUnregisteredError")
                                break
                            
                            except Exception as e:
                                # Unknown errors - log and break (do NOT retry hard errors)
                                error_str = str(e).lower()
                                # Only retry for truly transient network errors
                                if any(term in error_str for term in ['timeout', 'temporary', 'network']) and retry_count < 2:
                                    retry_count += 1
                                        await asyncio.sleep(2)  # Brief delay before retry
                                        continue
                                
                                # All other errors: log and break (no retry)
                                error = e
                                break
                            
                        # Calculate response time if successful
                        if result:
                            response_time = asyncio.get_event_loop().time() - start_time
                            
                            # Handle both single Message and list return types
                            if isinstance(result, list):
                                sent_message = result[0] if result else None
                            else:
                                sent_message = result  # It's already a Message object
                            
                            if not sent_message:
                                error = Exception("Forward returned no message")
                                response_time = None
                        else:
                            response_time = None
                        
                        if result and not error:
                            # Track success stats
                            display_name = group_name or str(group)
                            track_stats(account_num, display_name, 'success', None, response_time)
                            
                            # Build message link
                            link = None
                            try:
                                if target_entity and hasattr(target_entity, 'username') and target_entity.username:
                                    if topic_id is not None:
                                        # Forum topic link
                                        link = f"https://t.me/{target_entity.username}/{sent_message.id}?topic={topic_id}"
                                    else:
                                        link = f"https://t.me/{target_entity.username}/{sent_message.id}"
                                elif group_id is not None:
                                    group_id_int = abs(int(group_id))
                                    chat_id_str = str(group_id_int)
                                    if chat_id_str.startswith('100'):
                                        chat_id_str = chat_id_str[3:]
                                    if topic_id is not None:
                                        # Forum topic link
                                        link = f"https://t.me/c/{chat_id_str}/{sent_message.id}?topic={topic_id}"
                                    else:
                                        link = f"https://t.me/c/{chat_id_str}/{sent_message.id}"
                            except:
                                pass
                            
                            # Use unified logging helper
                            log_event_to_queue(
                                account_num, 'POSTED', display_name,
                                link=link,
                                log_queue=log_queue
                            )
                        else:
                            # Track failure stats - preserve full error information
                            error_str = "Unknown error"
                            if error:
                                if isinstance(error, Exception):
                                    error_str = f"{type(error).__name__}: {str(error)}"
                                    # Write traceback to log file directly (multiprocessing-safe)
                                    try:
                                        tb_str = ''.join(traceback.format_exception(type(error), error, error.__traceback__))
                                        log_file = Path("logs") / f"adbot_{datetime.now().strftime('%Y%m%d')}.log"
                                        with open(log_file, 'a', encoding='utf-8') as f:
                                            f.write(f"\n{'='*80}\n")
                                            f.write(f"REAL ERROR [Account {account_num} - POST]: {error_str}\n")
                                            f.write(f"{tb_str}\n")
                                            f.write(f"{'='*80}\n")
                                    except:
                                        pass
                                else:
                                    error_str = str(error)
                            
                            error_message = _classify_error_in_worker(error_str)
                            display_name = group_name or str(group)
                            track_stats(account_num, display_name, 'failure', error_message, None)
                            
                            # Check if error was already logged in exception handler
                            error_already_logged = False
                            if error and isinstance(error, Exception):
                                error_msg_lower = str(error).upper()
                                if any(handled in error_msg_lower for handled in ['ACCOUNT_BANNED', 'WRITE_FORBIDDEN', 'CHAT_RESTRICTED', 'FROZEN']):
                                    error_already_logged = True
                            
                            # Only log to queue if not already logged
                            if not error_already_logged:
                            # Auto-blacklist groups with permanent errors after 2 failures
                            permanent_errors = ['Group restricted', 'Group not available', 'Group permission denied', 
                                              'Topic closed', 'Group is private', 'Account removed from group']
                            if any(perm_err in error_message for perm_err in permanent_errors):
                                with stats_lock:
                                    group_stats = stats['groups'].get(display_name, {})
                                    consecutive_failures = group_stats.get('consecutive_failures', 0)
                                    
                                    if consecutive_failures >= 2:
                                        add_to_blacklist_file(account_num, group_id_str)
                                            log_event_to_queue(
                                                account_num, 'SKIPPED', display_name,
                                                reason=f"BLACKLISTED (after {consecutive_failures} failures)",
                                                log_queue=log_queue
                                            )
                                
                                # Use unified logging helper
                                log_event_to_queue(
                                    account_num, 'FAILED', display_name,
                                    reason=error_message,
                                    log_queue=log_queue
                                )
                    except Exception as e:
                        # Log full traceback - ensure it works in multiprocessing
                        tb_str = ''.join(traceback.format_exception(type(e), e, e.__traceback__))
                        error_str = f"{type(e).__name__}: {str(e)}"
                        
                        # Write traceback to log file directly (multiprocessing-safe)
                        try:
                            log_file = Path("logs") / f"adbot_{datetime.now().strftime('%Y%m%d')}.log"
                            with open(log_file, 'a', encoding='utf-8') as f:
                                f.write(f"\n{'='*80}\n")
                                f.write(f"REAL ERROR [Account {account_num} - POST EXCEPTION]: {error_str}\n")
                                f.write(f"{tb_str}\n")
                                f.write(f"{'='*80}\n")
                        except:
                            pass
                        
                        error_message = _classify_error_in_worker(error_str)
                        display_name = group_name if 'group_name' in locals() else str(group)
                        track_stats(account_num, display_name, 'failure', error_message, None)
                        
                        # Use unified logging helper
                        log_event_to_queue(
                            account_num, 'FAILED', display_name,
                            reason=error_message,
                            log_queue=log_queue
                        )
                    
                    # Enhanced delay: base delay + randomization + group-specific slowdown
                    # Auto-adjust posting speed based on group slowdown mode
                    group_delay = get_group_delay(group_id_str, delay_between_posts, config_data)
                    min_delay = max(group_delay, 3)  # Ensure at least 3 seconds
                    delay = min_delay + random.uniform(0, 3)  # Add 0-3 seconds randomization
                    await asyncio.sleep(delay)
                
                await asyncio.sleep(delay_between_cycles)
                
            except KeyboardInterrupt:
                log_event_to_queue(
                    account_num, 'SKIPPED', 'SHUTDOWN',
                    reason="KeyboardInterrupt",
                    log_queue=log_queue
                )
                break
            except SystemExit:
                # Banned account or other critical error - re-raise to stop worker
                raise
            except Exception as e:
                # Log full traceback - ensure it works in multiprocessing
                try:
                    tb_str = ''.join(traceback.format_exception(type(e), e, e.__traceback__))
                except:
                    tb_str = f"Traceback unavailable: {repr(e)}"
                
                error_str = f"{type(e).__name__}: {str(e)}"
                
                # Write traceback to log file directly (multiprocessing-safe)
                try:
                    log_file = Path("logs") / f"adbot_{datetime.now().strftime('%Y%m%d')}.log"
                    with open(log_file, 'a', encoding='utf-8') as f:
                        f.write(f"\n{'='*80}\n")
                        f.write(f"REAL ERROR [Account {account_num} - CYCLE]: {error_str}\n")
                        f.write(f"{tb_str}\n")
                        f.write(f"{'='*80}\n")
                        f.flush()  # Force flush to ensure it's written
                except Exception as file_err:
                    # Fallback: write to stderr (always works)
                    try:
                        safe_err = safe_log_string(f"\n{'='*80}\nREAL ERROR [Account {account_num} - CYCLE]: {error_str}\n{tb_str}\n{'='*80}\n")
                        print(safe_err, file=sys.stderr, flush=True)
                except:
                    pass
                
                # Show short, user-friendly error message in Telegram log
                short_error = _classify_error_in_worker(error_str)
                log_event_to_queue(
                    account_num, 'FAILED', 'CYCLE',
                    reason=short_error,
                    log_queue=log_queue
                )
                
                await asyncio.sleep(30)
    
    except SystemExit:
        # Banned account - let it propagate to stop worker
        raise
    except Exception as e:
        # Log full traceback - ensure it works in multiprocessing
        tb_str = ''.join(traceback.format_exception(type(e), e, e.__traceback__))
        error_str = f"{type(e).__name__}: {str(e)}"
        
        # Write traceback to log file directly (multiprocessing-safe)
        try:
            log_file = Path("logs") / f"adbot_{datetime.now().strftime('%Y%m%d')}.log"
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(f"\n{'='*80}\n")
                f.write(f"REAL ERROR [Account {account_num} - WORKER]: {error_str}\n")
                f.write(f"{tb_str}\n")
                f.write(f"{'='*80}\n")
        except:
            pass
        
        # Show short, user-friendly error message in Telegram log
        short_error = _classify_error_in_worker(error_str)
        log_event_to_queue(
            account_num, 'SKIPPED', 'WORKER',
            reason=short_error,
            log_queue=log_queue
        )
    finally:
        try:
            await client.disconnect()
        except:
            pass


def worker_process_wrapper(
    session_path: str,
    api_id: int,
    api_hash: str,
    assigned_groups: List[str],
    account_num: int,
    is_running_mp: MPEvent,
    shutdown_event_mp: MPEvent,
    log_queue: Queue
):
    """Process wrapper for async worker function (matches forwarder.py pattern)"""
    try:
        asyncio.run(worker_forwarding_loop(
            session_path, api_id, api_hash, assigned_groups, account_num,
            is_running_mp, shutdown_event_mp, log_queue
        ))
    except KeyboardInterrupt:
        # Exit immediately on Ctrl+C
        os._exit(0)
    except Exception as e:
        # Top-level exception handler for worker process - catch ALL errors
        tb_str = ''.join(traceback.format_exception(type(e), e, e.__traceback__))
        error_str = f"{type(e).__name__}: {str(e)}"
        
        # Write to log file (multiprocessing-safe)
        try:
            log_file = Path("logs") / f"adbot_{datetime.now().strftime('%Y%m%d')}.log"
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(f"\n{'='*80}\n")
                f.write(f"REAL ERROR [Account {account_num} - WORKER WRAPPER]: {error_str}\n")
                f.write(f"{tb_str}\n")
                f.write(f"{'='*80}\n")
        except Exception as file_err:
            # If file write fails, at least try to log via queue
            try:
                log_event_to_queue(
                    account_num, 'FAILED', 'WORKER_WRAPPER',
                    reason=f"FILE_WRITE_FAILED: {str(file_err)}",
                    log_queue=log_queue
                )
            except:
                pass
        
        # Send via log queue (always works in multiprocessing)
        try:
            log_event_to_queue(
                account_num, 'FAILED', 'WORKER_WRAPPER',
                reason=error_str[:100],  # Limit length
                log_queue=log_queue
            )
        except:
            pass
        
        # Try logger (may not work in worker process)
        try:
            logger.error(f"REAL ERROR [Account {account_num} - WORKER WRAPPER]: {error_str}\n{tb_str}")
        except:
            pass


async def forwarding_loop(
    clients_list: List[TelegramClient],  # Kept for compatibility, not used (workers create own clients)
    groups_distribution: List[List[str]],
    config: dict,
    controller_app: Application
):
    """Main forwarding loop - spawns worker processes for true parallel execution"""
    global is_running, shutdown_event
    log_group_id = config.get("log_group_id")
    
    # CRITICAL FIX: Use multiprocessing for true parallel execution (matches forwarder.py pattern)
    # Create shared state using Manager (multiprocessing-compatible)
    manager = Manager()
    is_running_mp = manager.Event()
    shutdown_event_mp = manager.Event()
    log_queue = manager.Queue()
    
    # Set initial state from global threading events
    if is_running.is_set():
        is_running_mp.set()
    if shutdown_event and shutdown_event.is_set():
        shutdown_event_mp.set()
    
    # Get session files and accounts for worker processes
    session_files = get_session_files()
    accounts = config["accounts"]
    num_accounts = len(accounts)
    
    # MANDATORY: Health check before starting workers
    logger.info("⏳ Starting mandatory session health check...")
    
    # Run health check in parallel
    health_results, health_counts = await check_all_sessions_health_parallel(
        session_files,
        accounts,
        controller_app,
        log_group_id,
        progress_callback=None  # Progress sent directly to log group
    )
    
    # Send health check report to log group
    if controller_app and log_group_id:
        try:
            report = format_health_check_report(health_results, health_counts)
            await controller_app.bot.send_message(
                chat_id=log_group_id,
                text=report,
                parse_mode='HTML'
            )
        except Exception as e:
            logger.error(f"Failed to send health check report: {e}")
    
    # Filter to only ACTIVE sessions
    active_sessions = []
    # Create health map by account_num for easy lookup
    health_map = {an: (st, det) for _, _, an, st, det in health_results}
    
    for account_idx in range(len(groups_distribution)):
        if account_idx >= len(session_files):
            break
        
        session_file = session_files[account_idx]
        account = accounts[account_idx % num_accounts]
        assigned_groups = groups_distribution[account_idx]
        account_num = account_idx + 1
        
        if not assigned_groups:
            continue
        
        # Get health status from health check
        status, details = health_map.get(account_num, (SessionHealthStatus.UNKNOWN, None))
            
        if status == SessionHealthStatus.ACTIVE:
                active_sessions.append((account_idx, session_file, account, assigned_groups, account_num))
                logger.info(f"Account {account_num}: ACTIVE - Starting worker")
        else:
            logger.warning(f"Account {account_num}: {status} - Skipping worker")
    
    # Abort if no active sessions
    if len(active_sessions) == 0:
        error_msg = "❌ No healthy sessions available. Bot not started."
        logger.error(error_msg)
        if controller_app and log_group_id:
            try:
                await controller_app.bot.send_message(
                    chat_id=log_group_id,
                    text=error_msg,
                    parse_mode='HTML'
                )
            except:
                pass
        return  # Exit forwarding_loop without starting workers
    
    logger.info(f"Found {len(active_sessions)} active sessions after health check")
    
    # Spawn worker processes - only for ACTIVE sessions
    worker_processes = []
    logger.info(f"Starting {len(active_sessions)} worker processes for parallel posting...")
    
    for account_idx, session_file, account, assigned_groups, account_num in active_sessions:
        logger.info(f"Spawning worker {account_num}: {session_file.name} with {len(assigned_groups)} groups")
        
        p = Process(
            target=worker_process_wrapper,
            args=(
                str(session_file),
                account["api_id"],
                account["api_hash"],
                assigned_groups,
                account_num,
                is_running_mp,
                shutdown_event_mp,
                log_queue
            )
        )
        p.start()
        worker_processes.append(p)
        # Small delay between starting processes (1-2 seconds as requested)
        await asyncio.sleep(random.uniform(1, 2))
    
    logger.info(f"✅ Started {len(worker_processes)} worker processes in parallel")
    
    # Initialize batched log sender
    # Prioritize environment variable, fallback to config
    bot_token = os.getenv('TELEGRAM_BOT_TOKEN') or config.get("controller_bot_token")
    batched_sender = None
    flush_task = None
    
    if bot_token and log_group_id:
        try:
            batched_sender = BatchedTelegramLogSender(bot_token=bot_token, log_group_id=log_group_id, batch_size=5)
            flush_task = asyncio.create_task(batched_sender.periodic_flush())
            logger.info("Batched Telegram log sender initialized")
        except Exception as e:
            logger.error(f"Failed to initialize batched log sender: {e}")
    
    # Log collector loop - collects plain text logs and sends via batched sender
    try:
        while True:
            # Check shutdown from main process
            if shutdown_event and shutdown_event.is_set():
                shutdown_event_mp.set()
                break
            
            # Sync is_running state from main process to worker processes
            if is_running.is_set() and not is_running_mp.is_set():
                is_running_mp.set()
            elif not is_running.is_set() and is_running_mp.is_set():
                is_running_mp.clear()
            
            # Process log messages from workers (plain text strings)
            try:
                processed_count = 0
                max_per_iteration = 100
                
                while not log_queue.empty() and processed_count < max_per_iteration:
                    try:
                        log_text = log_queue.get_nowait()
                        processed_count += 1
                        
                        # Log to console safely (strip HTML tags and use safe encoding)
                        # log_text is HTML-formatted, strip tags for console
                        console_text = re.sub(r'<[^>]+>', '', log_text)  # Remove HTML tags
                        console_text = safe_log_string(console_text)  # Replace Unicode chars
                        try:
                            logger.info(console_text)
                        except:
                            # If logging fails, try stderr
                            try:
                                print(console_text, file=sys.stderr, flush=True)
                            except:
                                pass
                        
                        # Add to batched sender for Telegram (keep HTML formatting)
                        if batched_sender:
                            await batched_sender.add_log(log_text)
                    except Exception as e:
                        logger.error(f"Error processing log entry: {e}", exc_info=True)
                        break
            except Exception as e:
                logger.error(f"Error processing log queue: {e}", exc_info=True)
            
            # Check if all workers are still alive
            alive_count = sum(1 for p in worker_processes if p.is_alive())
            if alive_count == 0:
                logger.warning("All worker processes have exited")
                break
            
            await asyncio.sleep(0.1)  # Fast polling for logs
    
            await asyncio.sleep(0.5)
    
    except KeyboardInterrupt:
        # Exit immediately on Ctrl+C
        os._exit(0)
    except Exception as e:
        logger.error(f"Error in forwarding loop: {e}", exc_info=True)
    finally:
        # Flush all remaining logs
        if batched_sender:
            logger.info("Flushing remaining logs...")
            await batched_sender.flush_all()
        if flush_task:
            flush_task.cancel()
            try:
                await flush_task
            except asyncio.CancelledError:
                pass
        if batched_sender:
            batched_sender.stop()
        
        # Wait for all workers to finish gracefully
        logger.info("Waiting for worker processes to finish...")
        shutdown_event_mp.set()  # Signal all workers to stop
        for p in worker_processes:
            p.join(timeout=10)
            if p.is_alive():
                logger.warning(f"Worker {p.pid} did not terminate, forcing...")
                p.terminate()
                p.join(timeout=5)
        logger.info("All worker processes terminated")


# Adbot Worker Function
async def start_adbot_worker(controller_app: Application):
    """Initialize and start the adbot worker (sessions, groups, forwarding loop)"""
    global clients, forwarding_task, is_running
    
    try:
        # Start posting when worker starts
        is_running.set()
        
        config = load_config()
        groups = load_groups()
        session_files = get_session_files()
        
        if not session_files:
            logger.error("No session files found in sessions/ directory")
            return
        
        if not groups:
            logger.error("No groups found in groups.txt")
            return
        
        # Initialize Telegram clients
        logger.info(f"Initializing {len(session_files)} clients...")
        clients = await initialize_clients(config, session_files)
        
        if not clients:
            logger.error("No valid clients initialized. Please check your sessions.")
            return
        
        logger.info(f"Successfully initialized {len(clients)} clients")
        
        # Distribute groups
        groups_distribution = distribute_groups(groups, len(clients))
        for idx, dist in enumerate(groups_distribution):
            logger.info(f"Account {idx + 1}: {len(dist)} groups assigned")
        
        # Start forwarding loop
        forwarding_task = asyncio.create_task(
            forwarding_loop(clients, groups_distribution, config, controller_app)
        )
        
        await forwarding_task
        
    except asyncio.CancelledError:
        logger.info("Adbot worker cancelled")
        # Disconnect all clients
        for client in clients:
            try:
                if client.is_connected():
                    await client.disconnect()
            except:
                pass
        clients = []
    except Exception as e:
        logger.error(f"Error in adbot worker: {e}", exc_info=True)
        # Disconnect all clients on error
        for client in clients:
            try:
                if client.is_connected():
                    await client.disconnect()
            except:
                pass
        clients = []


# Controller Bot Handlers
def create_keyboard(log_group_link: str = None) -> InlineKeyboardMarkup:
    """Create standard keyboard with Run/Stop buttons"""
    keyboard = [
        [InlineKeyboardButton("▶️ Run", callback_data="run"),
         InlineKeyboardButton("⏸️ Stop", callback_data="stop")],
        [InlineKeyboardButton("📝 Change Post Link", callback_data="change_link")],
        [InlineKeyboardButton("📁 Group", callback_data="group_menu")],
        [InlineKeyboardButton("📊 Status", callback_data="status")]
    ]
    if log_group_link:
        keyboard.append([InlineKeyboardButton("📋 Log Group", url=log_group_link)])
    return InlineKeyboardMarkup(keyboard)


def create_group_menu_keyboard() -> InlineKeyboardMarkup:
    """Create enhanced group management menu keyboard"""
    keyboard = [
        [InlineKeyboardButton("📋 Use Default Groups", callback_data="use_default_groups")],
        [InlineKeyboardButton("➕ Add Custom Chatlist", callback_data="add_folder")],
        [InlineKeyboardButton("👁️ View Current Groups", callback_data="view_folder")],
        [InlineKeyboardButton("🗑️ Clear All Groups", callback_data="remove_folder")],
        [InlineKeyboardButton("🔙 Back", callback_data="back_to_main")]
    ]
    return InlineKeyboardMarkup(keyboard)


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start command"""
    config = load_config()
    authorized_ids = config.get("controller_authorized_user_ids", [])
    
    if update.effective_user.id not in authorized_ids:
        await update.message.reply_text("Unauthorized. You don't have permission to use this bot.")
        return
    
    # Sync sessions registry on /start
    try:
        await sync_sessions_registry(config)
    except Exception as e:
        logger.error(f"Error syncing sessions registry: {e}")
    
    log_group_link = config.get("log_group_link", "")
    reply_markup = create_keyboard(log_group_link)
    
    # Check if user is in WAITING_FOR_POST_LINK state - don't reset it
    if context.user_data.get(WAITING_FOR_POST_LINK, False):
        await update.message.reply_text(
            "⚠️ You're currently waiting to send a post link.\n\nPlease send the link or use /cancel to cancel.",
            reply_markup=reply_markup,
            disable_web_page_preview=True
        )
        return
    
    global worker_task
    bot_status = "Running" if (worker_task and not worker_task.done()) else "Stopped"
    posting_status = "Running" if is_running.is_set() else "Stopped"
    post_links = get_post_links(config)
    # Filter out placeholder
    valid_links = [link for link in post_links if link != "t.me/channel/123"]
    if not valid_links:
        post_link_display = "00"
    elif len(valid_links) == 1:
        post_link_display = valid_links[0]
    else:
        post_link_display = f"{len(valid_links)} links (random selection)"
    await update.message.reply_text(
        f"Adbot Controller\n\nStatus: {bot_status}\nPosting: {posting_status}\nCurrent Post Link: {post_link_display}",
        reply_markup=reply_markup,
        disable_web_page_preview=True
    )


async def button_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle inline button callbacks"""
    query = update.callback_query
    await query.answer()  # Answer immediately for faster response
    
    config = load_config()
    authorized_ids = config.get("controller_authorized_user_ids", [])
    
    if query.from_user.id not in authorized_ids:
        await query.edit_message_text("Unauthorized. You don't have permission to use this bot.", disable_web_page_preview=True)
        return
    
    global worker_task, clients
    
    if query.data == "run":
        # Check if valid post links exist
        if not has_valid_post_links(config):
            await query.answer("❌ Error: No post links configured. Please add a post link first.", show_alert=True)
            # Show post link management menu
            current_links = get_post_links(config)
            valid_links = [link for link in current_links if link != "t.me/channel/123"]
            
            if valid_links:
                links_text = "\n".join([f"{idx+1}. `{link}`" for idx, link in enumerate(valid_links)])
                menu_text = f"📝 Post Link Management\n\nCurrent Links ({len(valid_links)}):\n{links_text}\n\nSelect a link to remove or add a new one."
            else:
                menu_text = "📝 Post Link Management\n\nCurrent Links (00)\n\nAdd your first post link to get started."
            
            await query.edit_message_text(
                menu_text,
                reply_markup=create_post_link_menu_keyboard(),
                parse_mode='Markdown',
                disable_web_page_preview=True
            )
            return
        
        # If worker is not running, start it (with health check)
        if not worker_task or worker_task.done():
            # Show health check status
            try:
                await query.edit_message_text(
                    "⏳ Checking sessions...\n\nPlease wait while we verify all session health.",
                    parse_mode='HTML'
                )
            except:
                pass
            
            worker_task = asyncio.create_task(start_adbot_worker(context.application))
            status_msg = "▶️ Bot started! Health check completed."
            logger.info("Adbot worker started by controller (health check will run)")
        else:
            # Worker is running, resume posting
            is_running.set()
            status_msg = "▶️ Posting resumed!"
            logger.info("Posting resumed by controller")
    elif query.data == "stop":
        # If worker is running, stop it completely
        if worker_task and not worker_task.done():
            # Track bot stop
            with stats_lock:
                if stats.get('uptime_start'):
                    current_uptime = (datetime.now() - stats['uptime_start']).total_seconds()
                    stats['total_uptime_seconds'] = stats.get('total_uptime_seconds', 0) + current_uptime
                stats['bot_stop_time'] = datetime.now()
                if stats['session_history']:
                    stats['session_history'][-1]['stop_time'] = datetime.now().isoformat()
                save_stats()
            worker_task.cancel()
            is_running.clear()
            # Disconnect all clients
            for client in clients:
                try:
                    if client.is_connected():
                        await client.disconnect()
                except:
                    pass
            clients = []
            status_msg = "⏸️ Bot stopped!"
            logger.info("Adbot worker stopped by controller")
        else:
            # Worker not running, just pause (if it was paused)
            is_running.clear()
            status_msg = "⏸️ Posting stopped!"
            logger.info("Posting stopped by controller")
    elif query.data == "status":
        bot_status = "Running" if (worker_task and not worker_task.done()) else "Stopped"
        posting_status = "Running" if is_running.is_set() else "Stopped"
        post_links = get_post_links(config)
        # Filter out placeholder
        valid_links = [link for link in post_links if link != "t.me/channel/123"]
        if not valid_links:
            post_link_display = "00"
        elif len(valid_links) == 1:
            post_link_display = valid_links[0]
        else:
            post_link_display = f"{len(valid_links)} links (random)"
        status_msg = f"Status: {bot_status}\nPosting: {posting_status}\nPost Link: {post_link_display}"
    elif query.data == "change_link":
        # Show post link management menu
        config = load_config()
        current_links = get_post_links(config)
        # Filter out placeholder
        valid_links = [link for link in current_links if link != "t.me/channel/123"]
        
        if valid_links:
            links_text = "\n".join([f"{idx+1}. `{link}`" for idx, link in enumerate(valid_links)])
            menu_text = f"📝 Post Link Management\n\nCurrent Links ({len(valid_links)}):\n{links_text}\n\nSelect a link to remove or add a new one."
        else:
            menu_text = "📝 Post Link Management\n\nCurrent Links (00)\n\nAdd your first post link to get started."
        
        await query.edit_message_text(
            menu_text,
            reply_markup=create_post_link_menu_keyboard(),
            parse_mode='Markdown',
            disable_web_page_preview=True
        )
        return
    elif query.data == "add_post_link":
        await query.edit_message_text(
            "➕ Add New Post Link\n\nSend a post link:\n• Format: t.me/channel/123\n• Or: https://t.me/channel/123\n\nUse /cancel to cancel.",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Back", callback_data="change_link")]]),
            disable_web_page_preview=True
        )
        context.user_data[WAITING_FOR_POST_LINK] = True
        context.user_data["POST_LINK_ACTION"] = "add"
        logger.info(f"User {query.from_user.id} entered ADD_POST_LINK state")
        return
    elif query.data.startswith("remove_link_"):
        # Extract link index from callback data
        try:
            link_idx = int(query.data.split("_")[-1])
            config = load_config()
            current_links = get_post_links(config)
            
            if 0 <= link_idx < len(current_links):
                link_to_remove = current_links[link_idx]
                success, message = await remove_post_link(link_to_remove)
                
                if success:
                    # Refresh menu
                    current_links = get_post_links(load_config())
                    valid_links = [link for link in current_links if link != "t.me/channel/123"]
                    if valid_links:
                        links_text = "\n".join([f"{idx+1}. `{link}`" for idx, link in enumerate(valid_links)])
                        menu_text = f"📝 Post Link Management\n\n✅ {message}\n\nCurrent Links ({len(valid_links)}):\n{links_text}\n\nSelect a link to remove or add a new one."
                    else:
                        menu_text = "📝 Post Link Management\n\n✅ Link removed.\n\nCurrent Links (00)\n\nAdd your first post link to get started."
                else:
                    menu_text = f"❌ {message}\n\nUse the buttons below to manage links."
                
                await query.edit_message_text(
                    menu_text,
                    reply_markup=create_post_link_menu_keyboard(),
                    parse_mode='Markdown',
                    disable_web_page_preview=True
                )
            else:
                await query.answer("Invalid link index", show_alert=True)
        except (ValueError, IndexError) as e:
            logger.error(f"Error parsing remove_link callback: {e}")
            await query.answer("Error removing link", show_alert=True)
        return
    elif query.data == "view_all_links":
        config = load_config()
        current_links = get_post_links(config)
        valid_links = [link for link in current_links if link != "t.me/channel/123"]
        if valid_links:
            links_text = "\n".join([f"{idx+1}. `{link}`" for idx, link in enumerate(valid_links)])
            await query.edit_message_text(
                f"📋 All Post Links ({len(valid_links)}):\n\n{links_text}",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Back", callback_data="change_link")]]),
                parse_mode='Markdown',
                disable_web_page_preview=True
            )
        return
    elif query.data == "group_menu":
        # Show current group status
        current_groups = load_groups()
        if current_groups:
            groups_text = f"Current Groups: {len(current_groups)}\n"
            groups_text += "Sample: " + ", ".join(current_groups[:3])
            if len(current_groups) > 3:
                groups_text += f" + {len(current_groups) - 3} more"
        else:
            groups_text = "No groups configured"
        
        menu_text = f"📁 Group Management\n\n{groups_text}\n\nSelect an option:"
        await query.edit_message_text(
            menu_text,
            reply_markup=create_group_menu_keyboard(),
            disable_web_page_preview=True
        )
        return
    elif query.data == "use_default_groups":
        # Check if default chatlist link exists in config
        config = load_config()
        default_chatlist_link = config.get("default_chatlist_link")
        
        if default_chatlist_link:
            # Use default chatlist from config
            await query.edit_message_text(
                f"⏳ Processing default chatlist from config...\nThis may take a while.",
                reply_markup=None,
                disable_web_page_preview=True
            )
            
            # Process default chatlist
            valid_links = []
            normalized_link = default_chatlist_link.strip()
            if not normalized_link.startswith(('http://', 'https://')):
                if normalized_link.startswith('t.me/'):
                    normalized_link = 'https://' + normalized_link
                elif 't.me/addlist/' in normalized_link:
                    normalized_link = 'https://' + normalized_link.lstrip('/')
            
            if extract_chatlist_hash(normalized_link):
                valid_links.append(normalized_link)
            
            if valid_links:
                # Process chatlist (async, non-blocking)
                # Pass the query as update for callback handling
                asyncio.create_task(_process_chatlist_async(valid_links, config, update, context))
            else:
                status_msg = "❌ Invalid default chatlist link in config.json"
                reply_markup = create_group_menu_keyboard()
                await query.edit_message_text(status_msg, reply_markup=reply_markup, disable_web_page_preview=True)
        else:
            # Load default groups from groups.txt
            default_groups = load_groups()
            if default_groups:
                status_msg = f"✅ Using default groups from groups.txt\n\n{len(default_groups)} groups are ready to use"
            else:
                status_msg = "❌ No default groups found in groups.txt\n\nAdd groups manually or set default_chatlist_link in config.json"
            reply_markup = create_group_menu_keyboard()
            await query.edit_message_text(status_msg, reply_markup=reply_markup, disable_web_page_preview=True)
        return
    elif query.data == "back_to_main":
        log_group_link = config.get("log_group_link", "")
        bot_status = "Running" if (worker_task and not worker_task.done()) else "Stopped"
        posting_status = "Running" if is_running.is_set() else "Stopped"
        post_links = get_post_links(config)
        # Filter out placeholder
        valid_links = [link for link in post_links if link != "t.me/channel/123"]
        if not valid_links:
            post_link_display = "00"
        elif len(valid_links) == 1:
            post_link_display = valid_links[0]
        else:
            post_link_display = f"{len(valid_links)} links (random selection)"
        status_msg = f"Adbot Controller\n\nStatus: {bot_status}\nPosting: {posting_status}\nCurrent Post Link: {post_link_display}"
        reply_markup = create_keyboard(log_group_link)
        await query.edit_message_text(status_msg, reply_markup=reply_markup, disable_web_page_preview=True)
        return
    elif query.data == "add_folder":
        await query.edit_message_text(
            "Please send chatlist invite link(s):\n• Single: https://t.me/addlist/xxxx\n• Multiple: https://t.me/addlist/xxxx https://t.me/addlist/yyyy\n(separated by space or newline)\n\nUse /cancel to cancel.",
            reply_markup=None,
            disable_web_page_preview=True
        )
        context.user_data[WAITING_FOR_CHATLIST_LINKS] = True
        logger.info(f"User {query.from_user.id} entered WAITING_FOR_CHATLIST_LINKS state")
        return
    elif query.data == "view_folder":
        current_groups = load_groups()
        config = load_config()
        default_chatlist = config.get("default_chatlist_link", "Not set")
        
        if not current_groups:
            status_msg = f"📁 No groups configured\n\nDefault Chatlist: {default_chatlist}\n\nUse 'Use Default Groups' or 'Add Custom Chatlist' to add groups"
        else:
            # Show groups in a readable format
            groups_list = []
            for idx, group in enumerate(current_groups[:20], 1):  # Show first 20
                groups_list.append(f"{idx}. {group}")
            status_msg = f"📁 Current Groups ({len(current_groups)}):\n\n" + "\n".join(groups_list)
            if len(current_groups) > 20:
                status_msg += f"\n\n... and {len(current_groups) - 20} more groups"
            status_msg += f"\n\nDefault Chatlist: {default_chatlist}"
        reply_markup = create_group_menu_keyboard()
        await query.edit_message_text(status_msg, reply_markup=reply_markup, disable_web_page_preview=True)
        return
    elif query.data == "remove_folder":
        # Clear all groups from groups.txt
        current_groups = load_groups()
        if not current_groups:
            status_msg = "❌ No groups to clear"
            reply_markup = create_group_menu_keyboard()
            await query.edit_message_text(status_msg, reply_markup=reply_markup, disable_web_page_preview=True)
            return
        
        # Clear groups file
        if save_groups([]):
            status_msg = f"✅ Cleared all groups\n\nRemoved {len(current_groups)} groups from groups.txt"
        else:
            status_msg = "❌ Failed to clear groups"
        
        reply_markup = create_group_menu_keyboard()
        await query.edit_message_text(status_msg, reply_markup=reply_markup, disable_web_page_preview=True)
        return
    elif query.data.startswith("logs_"):
        # Handle logs callback
        await handle_logs_callback(update, context)
        return
    else:
        status_msg = "Unknown action"
    
    if query:
        log_group_link = config.get("log_group_link", "")
        reply_markup = create_keyboard(log_group_link)
        await query.edit_message_text(status_msg, reply_markup=reply_markup, disable_web_page_preview=True)
        
        # Send status to log group (async, don't wait)
        if query.data in ["run", "stop"]:
            asyncio.create_task(send_log_to_telegram(f"Controller: {status_msg}", config.get("log_group_id"), context.application))


async def message_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle messages for post link change, chatlist links, or zip file uploads"""
    config = load_config()
    authorized_ids = config.get("controller_authorized_user_ids", [])
    
    if update.effective_user.id not in authorized_ids:
        return
    
    # Check if waiting for post link
    if context.user_data.get(WAITING_FOR_POST_LINK, False):
        # Handle post link (existing logic)
        await _handle_post_link_message(update, context)
        return
    
    # Check if waiting for chatlist links
    if context.user_data.get(WAITING_FOR_CHATLIST_LINKS, False):
        await _handle_chatlist_links_message(update, context)
        return
    
    # Handle zip file uploads for sessions
    if update.message and update.message.document:
        doc = update.message.document
        if doc.file_name and (doc.file_name.endswith('.zip') or doc.mime_type == 'application/zip'):
            await _handle_zip_upload(update, context)
            return


async def _handle_chatlist_links_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle chatlist links message"""
    if not update.message or not update.message.text:
        return
    
    try:
        config = load_config()
        authorized_ids = config.get("controller_authorized_user_ids", [])
        
        if update.effective_user.id not in authorized_ids:
            await update.message.reply_text("Unauthorized.", disable_web_page_preview=True)
            context.user_data[WAITING_FOR_CHATLIST_LINKS] = False
            return
        
        links_text = update.message.text.strip()
        logger.info(f"Received chatlist links from user {update.effective_user.id}")
        
        # Parse links (space or newline separated, or mixed)
        links_raw = links_text.replace('\n', ' ').split()
        links = [link.strip() for link in links_raw if link.strip()]
        
        # Validate and normalize links
        valid_links = []
        invalid_links = []
        for link in links:
            normalized_link = link.strip()
            # Normalize: ensure it has protocol if it doesn't
            if not normalized_link.startswith(('http://', 'https://')):
                if normalized_link.startswith('t.me/'):
                    normalized_link = 'https://' + normalized_link
                elif 't.me/addlist/' in normalized_link:
                    normalized_link = 'https://' + normalized_link.lstrip('/')
            
            if extract_chatlist_hash(normalized_link):
                valid_links.append(normalized_link)
            else:
                invalid_links.append(link)
        
        # Report invalid links
        if invalid_links:
            await update.message.reply_text(
                f"Invalid chatlist link(s): {', '.join(invalid_links)}\n\nExpected format: t.me/addlist/xxxx or https://t.me/addlist/xxxx",
                disable_web_page_preview=True
            )
            context.user_data[WAITING_FOR_CHATLIST_LINKS] = False
            return
        
        if not valid_links:
            await update.message.reply_text("No valid chatlist links provided.", disable_web_page_preview=True)
            context.user_data[WAITING_FOR_CHATLIST_LINKS] = False
            return
        
        # Limit to 2 links max
        if len(valid_links) > 2:
            await update.message.reply_text("Maximum 2 chatlist links allowed.", disable_web_page_preview=True)
            context.user_data[WAITING_FOR_CHATLIST_LINKS] = False
            return
        
        context.user_data[WAITING_FOR_CHATLIST_LINKS] = False
        
        # Send processing message
        await update.message.reply_text(
            f"⏳ Processing {len(valid_links)} chatlist(s) across all sessions...\nThis may take a while.",
            disable_web_page_preview=True
        )
        
        # Process chatlists (async, non-blocking)
        asyncio.create_task(_process_chatlist_async(valid_links, config, update, context))
        
    except Exception as e:
        logger.error(f"Error in chatlist handler: {e}", exc_info=True)
        context.user_data[WAITING_FOR_CHATLIST_LINKS] = False
        try:
            await update.message.reply_text(
                f"❌ Error processing chatlist links: {str(e)}\n\nPlease try again or use /cancel to cancel.",
                disable_web_page_preview=True
            )
        except:
            pass


async def _process_chatlist_async(
    chatlist_links: List[str],
    config: dict,
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
):
    """Async task to process chatlist links"""
    global controller_app
    try:
        result_msg, folder_file = await process_chatlist_links(chatlist_links, config, controller_app)
        reply_markup = create_keyboard(config.get("log_group_link", ""))
        
        # Handle both message and callback_query updates
        if update.message:
            await update.message.reply_text(result_msg, reply_markup=reply_markup, disable_web_page_preview=True)
        elif update.callback_query:
            await update.callback_query.edit_message_text(result_msg, reply_markup=reply_markup, disable_web_page_preview=True)
    except Exception as e:
        logger.error(f"Error in async chatlist processing: {e}", exc_info=True)
        try:
            if update.message:
                await update.message.reply_text(
                    f"❌ Error processing chatlists: {str(e)}",
                    disable_web_page_preview=True
                )
            elif update.callback_query:
                await update.callback_query.edit_message_text(
                    f"❌ Error processing chatlists: {str(e)}",
                    disable_web_page_preview=True
                )
        except:
            pass


async def _handle_zip_upload(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle zip file upload for session files"""
    try:
        await update.message.reply_text("📦 Processing zip file...", disable_web_page_preview=True)
        
        doc = update.message.document
        zip_path = Path(f"temp_{doc.file_name}")
        sessions_dir = Path("sessions")
        sessions_dir.mkdir(exist_ok=True)
        
        # Download zip file
        file = await context.bot.get_file(doc.file_id)
        await file.download_to_drive(zip_path)
        
        # Extract session files
        try:
            count, extracted_files = extract_session_from_zip(zip_path, sessions_dir)
            
            if count > 0:
                files_list = "\n".join([f"• {f}" for f in extracted_files])
                await update.message.reply_text(
                    f"✅ Successfully extracted {count} session file(s):\n\n{files_list}\n\n"
                    f"Sessions saved to `sessions/` folder.\n"
                    f"Use `/sessions` to verify session status.",
                    parse_mode='Markdown',
                    disable_web_page_preview=True
                )
                logger.info(f"Extracted {count} session files from zip: {extracted_files}")
            else:
                await update.message.reply_text(
                    "⚠️ No .session files found in the zip archive.\n\n"
                    "Please ensure your zip file contains .session files.",
                    disable_web_page_preview=True
                )
        except Exception as e:
            logger.error(f"Error extracting zip: {e}", exc_info=True)
            await update.message.reply_text(
                f"❌ Error extracting zip file: {str(e)}",
                disable_web_page_preview=True
            )
        finally:
            # Cleanup temp zip file
            try:
                if zip_path.exists():
                    zip_path.unlink()
            except:
                pass
    
    except Exception as e:
        logger.error(f"Error handling zip upload: {e}", exc_info=True)
        try:
            await update.message.reply_text(
                f"❌ Error processing zip file: {str(e)}",
                disable_web_page_preview=True
            )
        except:
            pass


async def _handle_post_link_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle post link message (existing logic moved here)"""
    
    # Get message text - must be present
    if not update.message or not update.message.text:
        return
    
    try:
        config = load_config()
        authorized_ids = config.get("controller_authorized_user_ids", [])
        
        if update.effective_user.id not in authorized_ids:
            await update.message.reply_text("Unauthorized.", disable_web_page_preview=True)
            context.user_data[WAITING_FOR_POST_LINK] = False
            logger.warning(f"Unauthorized user {update.effective_user.id} tried to send post link")
            return
        
        action = context.user_data.get("POST_LINK_ACTION", "replace")
        new_links_text = update.message.text.strip()
        logger.info(f"Received message in WAITING_FOR_POST_LINK state (action: {action}) from user {update.effective_user.id}: {new_links_text[:50]}")
        
        if not new_links_text:
            await update.message.reply_text("❌ Invalid post link. Please send a valid t.me link.", disable_web_page_preview=True)
            return
        
        # Parse multiple links (comma-separated or newline-separated)
        links = []
        # Try comma first, then newline
        if ',' in new_links_text:
            links = [link.strip() for link in new_links_text.split(',') if link.strip()]
        elif '\n' in new_links_text:
            links = [link.strip() for link in new_links_text.split('\n') if link.strip()]
        else:
            # Single link
            links = [new_links_text.strip()]
        
        # Normalize and validate all links
        normalized_links = []
        for link in links:
            # Skip empty links
            if not link:
                continue
                
            # Normalize link format (remove https:// if present, keep t.me/... format)
            normalized_link = link.strip()
            
            # Extract t.me/... part from full URLs
            if link.startswith('http://') or link.startswith('https://'):
                match = re.search(r't\.me/[^\s]+', link)
                if match:
                    normalized_link = match.group(0)
                else:
                    # Invalid format - no t.me found in URL
                    await update.message.reply_text(f"❌ Invalid post link. Please send a valid t.me link.\n\nReceived: {link}", disable_web_page_preview=True)
                    context.user_data[WAITING_FOR_POST_LINK] = False
                    context.user_data.pop("POST_LINK_ACTION", None)
                    return
            
            # Must start with t.me/
            if not normalized_link.startswith('t.me/'):
                await update.message.reply_text(f"❌ Invalid post link. Please send a valid t.me link.\n\nReceived: {link}", disable_web_page_preview=True)
                context.user_data[WAITING_FOR_POST_LINK] = False
                context.user_data.pop("POST_LINK_ACTION", None)
                return
            
            # Validate link format using parse_post_link
            try:
                parse_post_link(normalized_link)
                normalized_links.append(normalized_link)
                logger.debug(f"Validated link: {normalized_link}")
            except ValueError as e:
                await update.message.reply_text(f"❌ Invalid post link. Please send a valid t.me link.\n\nError: {str(e)}\n\nReceived: {link}", disable_web_page_preview=True)
                context.user_data[WAITING_FOR_POST_LINK] = False
                context.user_data.pop("POST_LINK_ACTION", None)
                return
        
        if not normalized_links:
            await update.message.reply_text("❌ Invalid post link. Please send a valid t.me link.", disable_web_page_preview=True)
            context.user_data[WAITING_FOR_POST_LINK] = False
            context.user_data.pop("POST_LINK_ACTION", None)
            return
        
        # Handle add vs replace mode
        if action == "add":
            # Add each link individually
            added_count = 0
            failed_links = []
            for link in normalized_links:
                success, message = await add_post_link(link)
                if success:
                    added_count += 1
                else:
                    failed_links.append((link, message))
            
            # Exit state
            context.user_data[WAITING_FOR_POST_LINK] = False
            context.user_data.pop("POST_LINK_ACTION", None)
            
            # Prepare response
            if added_count > 0:
                success_msg = f"✅ {added_count} link(s) added successfully"
                if failed_links:
                    failed_text = "\n".join([f"• {link}: {msg}" for link, msg in failed_links])
                    success_msg += f"\n\n⚠️ Failed to add:\n{failed_text}"
            else:
                success_msg = "❌ Failed to add links:\n" + "\n".join([f"• {link}: {msg}" for link, msg in failed_links])
            
            # Show updated menu
            current_links = get_post_links(load_config())
            valid_links = [link for link in current_links if link != "t.me/channel/123"]
            if valid_links:
                links_text = "\n".join([f"{idx+1}. `{link}`" for idx, link in enumerate(valid_links)])
                menu_text = f"📝 Post Link Management\n\n{success_msg}\n\nCurrent Links ({len(valid_links)}):\n{links_text}\n\nSelect a link to remove or add a new one."
            else:
                menu_text = f"📝 Post Link Management\n\n{success_msg}\n\nCurrent Links (00)\n\nAdd your first post link to get started."
            
            await update.message.reply_text(
                menu_text,
                reply_markup=create_post_link_menu_keyboard(),
                parse_mode='Markdown',
                disable_web_page_preview=True
            )
        else:
            # Replace mode (original behavior)
            # Prepare post_link value (single string if one link, array if multiple)
            post_link_value = normalized_links[0] if len(normalized_links) == 1 else normalized_links
            
            # Save links to config.json (non-blocking)
            logger.info(f"Saving {len(normalized_links)} post link(s) to config.json")
            try:
                await save_post_links_async(post_link_value)
                logger.info(f"Post links saved successfully: {normalized_links}")
            except Exception as save_error:
                logger.error(f"Failed to save post links: {save_error}", exc_info=True)
                context.user_data[WAITING_FOR_POST_LINK] = False
                context.user_data.pop("POST_LINK_ACTION", None)
                await update.message.reply_text("❌ Failed to save post link", disable_web_page_preview=True)
                return
            
            # Exit WAITING_FOR_POST_LINK state immediately
            context.user_data[WAITING_FOR_POST_LINK] = False
            context.user_data.pop("POST_LINK_ACTION", None)
            
            # Prepare confirmation message and keyboard
            log_group_link = config.get("log_group_link", "")
            reply_markup = create_keyboard(log_group_link)
            
            # Send confirmation message
            if len(normalized_links) == 1:
                success_msg = f"✅ Post link saved successfully\n\n`{normalized_links[0]}`"
            else:
                success_msg = f"✅ {len(normalized_links)} post links saved successfully (random selection enabled)"
            
            await update.message.reply_text(success_msg, reply_markup=reply_markup, parse_mode='Markdown', disable_web_page_preview=True)
            logger.info(f"Post link(s) saved and confirmed to user {update.effective_user.id}")
            
            # Send to log group (async, non-blocking)
            links_display = normalized_links[0] if len(normalized_links) == 1 else f"{len(normalized_links)} links"
            asyncio.create_task(send_log_to_telegram(
                f"Controller: Post link(s) updated to {links_display}",
                config.get("log_group_id"),
                context.application
            ))
        
    except Exception as e:
        logger.error(f"Error in message_handler: {e}", exc_info=True)
        # Always exit state on error
        context.user_data[WAITING_FOR_POST_LINK] = False
        context.user_data.pop("POST_LINK_ACTION", None)
        try:
            await update.message.reply_text(f"❌ Error processing link: {str(e)}\n\nPlease try again or use /cancel to cancel.", disable_web_page_preview=True)
        except Exception as reply_error:
            logger.error(f"Failed to send error reply: {reply_error}")


async def cancel_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /cancel command - explicitly clears WAITING_FOR_POST_LINK state"""
    was_waiting = context.user_data.get(WAITING_FOR_POST_LINK, False)
    context.user_data[WAITING_FOR_POST_LINK] = False
    context.user_data.pop("POST_LINK_ACTION", None)
    if was_waiting:
        logger.info(f"User {update.effective_user.id} cancelled post link input")
        await update.message.reply_text("❌ Cancelled. Post link was not changed.", disable_web_page_preview=True)


async def stats_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /stats command - show comprehensive statistics"""
    config = load_config()
    authorized_ids = config.get("controller_authorized_user_ids", [])
    
    if update.effective_user.id not in authorized_ids:
        await update.message.reply_text("Unauthorized. You don't have permission to use this bot.", disable_web_page_preview=True)
        return
    
    try:
        stats_summary = get_stats_summary()
        await update.message.reply_text(stats_summary, parse_mode='Markdown', disable_web_page_preview=True)
    except Exception as e:
        logger.error(f"Error generating stats: {e}")
        await update.message.reply_text(f"Error generating stats: {e}", disable_web_page_preview=True)


async def add_user_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /add command - add user to authorized list"""
    config = load_config()
    authorized_ids = config.get("controller_authorized_user_ids", [])
    
    # Check if current user is authorized
    if update.effective_user.id not in authorized_ids:
        await update.message.reply_text("❌ Unauthorized. You don't have permission to use this command.", disable_web_page_preview=True)
        return
    
    # Check if user ID provided
    if not context.args or len(context.args) == 0:
        await update.message.reply_text(
            "Usage: /add <user_id>\n\nExample: /add 123456789\n\nTo get a user ID, forward a message from them to @userinfobot",
            disable_web_page_preview=True
        )
        return
    
    try:
        new_user_id = int(context.args[0])
        
        if new_user_id in authorized_ids:
            await update.message.reply_text(f"✅ User {new_user_id} is already authorized.", disable_web_page_preview=True)
            return
        
        # Add user to authorized list
        authorized_ids.append(new_user_id)
        config["controller_authorized_user_ids"] = authorized_ids
        
        # Save config
        save_config()
        
        await update.message.reply_text(
            f"✅ User {new_user_id} added to authorized list.\n\nTotal authorized users: {len(authorized_ids)}",
            disable_web_page_preview=True
        )
        logger.info(f"User {update.effective_user.id} added user {new_user_id} to authorized list")
        
    except ValueError:
        await update.message.reply_text("❌ Invalid user ID. Please provide a numeric user ID.", disable_web_page_preview=True)
    except Exception as e:
        logger.error(f"Error adding user: {e}")
        await update.message.reply_text(f"❌ Error adding user: {str(e)}", disable_web_page_preview=True)


async def remove_user_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /remove command - remove user from authorized list"""
    config = load_config()
    authorized_ids = config.get("controller_authorized_user_ids", [])
    
    # Check if current user is authorized
    if update.effective_user.id not in authorized_ids:
        await update.message.reply_text("❌ Unauthorized. You don't have permission to use this command.", disable_web_page_preview=True)
        return
    
    # Check if user ID provided
    if not context.args or len(context.args) == 0:
        # Show current authorized users
        if authorized_ids:
            users_list = "\n".join([f"• {uid}" for uid in authorized_ids])
            await update.message.reply_text(
                f"Usage: /remove <user_id>\n\nCurrent authorized users:\n{users_list}\n\nExample: /remove 123456789",
                disable_web_page_preview=True
            )
        else:
            await update.message.reply_text(
                "Usage: /remove <user_id>\n\nNo authorized users found.",
                disable_web_page_preview=True
            )
        return
    
    try:
        user_id_to_remove = int(context.args[0])
        
        if user_id_to_remove not in authorized_ids:
            await update.message.reply_text(f"❌ User {user_id_to_remove} is not in the authorized list.", disable_web_page_preview=True)
            return
        
        # Prevent removing yourself if you're the only authorized user
        if len(authorized_ids) == 1 and user_id_to_remove == update.effective_user.id:
            await update.message.reply_text("❌ Cannot remove yourself. At least one authorized user is required.", disable_web_page_preview=True)
            return
        
        # Remove user from authorized list
        authorized_ids.remove(user_id_to_remove)
        config["controller_authorized_user_ids"] = authorized_ids
        
        # Save config
        save_config()
        
        await update.message.reply_text(
            f"✅ User {user_id_to_remove} removed from authorized list.\n\nRemaining authorized users: {len(authorized_ids)}",
            disable_web_page_preview=True
        )
        logger.info(f"User {update.effective_user.id} removed user {user_id_to_remove} from authorized list")
        
    except ValueError:
        await update.message.reply_text("❌ Invalid user ID. Please provide a numeric user ID.", disable_web_page_preview=True)
    except Exception as e:
        logger.error(f"Error removing user: {e}")
        await update.message.reply_text(f"❌ Error removing user: {str(e)}", disable_web_page_preview=True)


async def cmd_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /cmd command - show all available commands"""
    config = load_config()
    authorized_ids = config.get("controller_authorized_user_ids", [])
    
    if update.effective_user.id not in authorized_ids:
        await update.message.reply_text("❌ Unauthorized. You don't have permission to use this bot.", disable_web_page_preview=True)
        return
    
    commands_text = """🔧 **Available Commands**

**Basic Commands:**
• `/start` - Start the bot and show main menu
• `/cancel` - Cancel current operation (post link input, etc.)
• `/cmd` - Show this help message

**Statistics & Monitoring:**
• `/stats` - Show comprehensive bot statistics
• `/config` - View current configuration (config.json)
• `/logs` - View log files (All/Error/Posting logs)

**Session Management:**
• `/sessions` - List all sessions with their status
• `/refresh_sessions` - Re-check frozen/active status for all sessions
• `/remove_session <filename>` - Remove a session (moves to removed/ folder)
• Upload ZIP file with .session files to add sessions

**User Management:**
• `/add <user_id>` - Add user to authorized list
• `/remove <user_id>` - Remove user from authorized list

**Group Management:**
• `/joinlog` - Join all sessions to log group

**Bot Controls:**
Use the inline keyboard buttons for:
• ▶️ Run - Start/resume posting
• ⏸️ Stop - Stop/pause posting
• 📝 Change Post Link - Manage post links
• 📁 Group - Manage groups (default/custom chatlist)
• 📊 Status - View current status

**Tips:**
• All commands require authorization
• Use buttons in the menu for easier navigation
• Statistics are tracked automatically when bot runs
• Critical alerts are sent automatically for banned accounts and high failure rates"""
    
    await update.message.reply_text(commands_text, parse_mode='Markdown', disable_web_page_preview=True)


async def sessions_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /sessions command - list all sessions with status"""
    config = load_config()
    authorized_ids = config.get("controller_authorized_user_ids", [])
    
    if update.effective_user.id not in authorized_ids:
        await update.message.reply_text("❌ Unauthorized. You don't have permission to use this bot.", disable_web_page_preview=True)
        return
    
    await update.message.reply_text("🔄 Checking session statuses...", disable_web_page_preview=True)
    
    try:
        session_statuses = await get_all_session_statuses()
        
        if not session_statuses:
            await update.message.reply_text("ℹ️ No sessions found in sessions/ directory.", disable_web_page_preview=True)
            return
        
        message_parts = ["📋 **Session Status Report**\n"]
        
        for session_info in session_statuses:
            status = session_info["status"]
            filename = session_info["filename"]
            account_num = session_info.get("account_num", "?")
            details = session_info.get("details", {})
            
            # Status emoji
            if status == "ACTIVE":
                status_emoji = "✅"
            elif status == "FROZEN":
                status_emoji = "⚠️"
            elif status == "UNAUTHORIZED":
                status_emoji = "❌"
            else:
                status_emoji = "❓"
            
            message_parts.append(f"{status_emoji} **Account {account_num}** - {filename}")
            message_parts.append(f"Status: `{status}`")
            
            if details.get("phone"):
                message_parts.append(f"Phone: `{details.get('phone')}`")
            if details.get("username"):
                message_parts.append(f"Username: @{details.get('username')}")
            if details.get("message"):
                message_parts.append(f"Details: {details.get('message')}")
            if details.get("freeze_reason"):
                message_parts.append(f"Freeze Reason: {details.get('freeze_reason')}")
            
            message_parts.append("")  # Empty line between sessions
        
        # Split message if too long (Telegram limit is 4096 chars)
        full_message = "\n".join(message_parts)
        if len(full_message) > 4000:
            # Send in chunks
            chunk = ""
            for part in message_parts:
                if len(chunk) + len(part) + 1 > 4000:
                    await update.message.reply_text(chunk, parse_mode='Markdown', disable_web_page_preview=True)
                    chunk = part + "\n"
                else:
                    chunk += part + "\n"
            if chunk:
                await update.message.reply_text(chunk, parse_mode='Markdown', disable_web_page_preview=True)
        else:
            await update.message.reply_text(full_message, parse_mode='Markdown', disable_web_page_preview=True)
    
    except Exception as e:
        logger.error(f"Error in sessions_command: {e}", exc_info=True)
        await update.message.reply_text(f"❌ Error checking sessions: {str(e)}", disable_web_page_preview=True)


async def refresh_sessions_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /refresh_sessions command - re-check frozen status"""
    config = load_config()
    authorized_ids = config.get("controller_authorized_user_ids", [])
    
    if update.effective_user.id not in authorized_ids:
        await update.message.reply_text("❌ Unauthorized. You don't have permission to use this bot.", disable_web_page_preview=True)
        return
    
    await update.message.reply_text("🔄 Refreshing session statuses... This may take a moment.", disable_web_page_preview=True)
    
    try:
        session_statuses = await get_all_session_statuses()
        
        active_count = sum(1 for s in session_statuses if s["status"] == "ACTIVE")
        frozen_count = sum(1 for s in session_statuses if s["status"] == "FROZEN")
        unauthorized_count = sum(1 for s in session_statuses if s["status"] == "UNAUTHORIZED")
        error_count = sum(1 for s in session_statuses if s["status"] == "ERROR")
        
        result = f"✅ **Session Refresh Complete**\n\n"
        result += f"✅ Active: {active_count}\n"
        result += f"⚠️ Frozen: {frozen_count}\n"
        result += f"❌ Unauthorized: {unauthorized_count}\n"
        if error_count > 0:
            result += f"❓ Errors: {error_count}\n"
        result += f"\nTotal: {len(session_statuses)} sessions"
        
        await update.message.reply_text(result, parse_mode='Markdown', disable_web_page_preview=True)
    
    except Exception as e:
        logger.error(f"Error in refresh_sessions_command: {e}", exc_info=True)
        await update.message.reply_text(f"❌ Error refreshing sessions: {str(e)}", disable_web_page_preview=True)


async def remove_session_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /remove_session command - remove a session (move to removed folder)"""
    config = load_config()
    authorized_ids = config.get("controller_authorized_user_ids", [])
    
    if update.effective_user.id not in authorized_ids:
        await update.message.reply_text("❌ Unauthorized. You don't have permission to use this bot.", disable_web_page_preview=True)
        return
    
    if not context.args:
        await update.message.reply_text(
            "❌ Please specify a session filename.\n\n"
            "Usage: `/remove_session <filename>`\n"
            "Example: `/remove_session 917488156157.session`\n\n"
            "Use `/sessions` to list all sessions.",
            parse_mode='Markdown',
            disable_web_page_preview=True
        )
        return
    
    session_filename = context.args[0].strip()
    if not session_filename.endswith('.session'):
        session_filename += '.session'
    
    sessions_dir = Path("sessions")
    removed_dir = get_removed_sessions_dir()
    session_path = sessions_dir / session_filename
    
    if not session_path.exists():
        await update.message.reply_text(
            f"❌ Session file not found: `{session_filename}`\n\nUse `/sessions` to list all sessions.",
            parse_mode='Markdown',
            disable_web_page_preview=True
        )
        return
    
    try:
        # Move to removed folder with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        new_filename = f"{session_path.stem}_{timestamp}.session"
        removed_path = removed_dir / new_filename
        
        shutil.move(str(session_path), str(removed_path))
        
        await update.message.reply_text(
            f"✅ Session removed successfully!\n\n"
            f"File: `{session_filename}`\n"
            f"Moved to: `removed/{new_filename}`",
            parse_mode='Markdown',
            disable_web_page_preview=True
        )
        
        logger.info(f"Session {session_filename} moved to removed folder")
    
    except Exception as e:
        logger.error(f"Error removing session: {e}", exc_info=True)
        await update.message.reply_text(f"❌ Error removing session: {str(e)}", disable_web_page_preview=True)


async def config_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /config command - send config.json contents"""
    config = load_config()
    authorized_ids = config.get("controller_authorized_user_ids", [])
    
    if update.effective_user.id not in authorized_ids:
        await update.message.reply_text("❌ Unauthorized. You don't have permission to use this bot.", disable_web_page_preview=True)
        return
    
    try:
        # Read config file
        config_path = Path("config.json")
        if not config_path.exists():
            await update.message.reply_text("❌ config.json not found.", disable_web_page_preview=True)
            return
        
        with open(config_path, 'r', encoding='utf-8') as f:
            config_content = f.read()
        
        # Format as code block
        message = f"```json\n{config_content}\n```"
        
        # Check if message is too long (Telegram limit is 4096 chars)
        if len(message) > 4000:
            # Send as document instead
            await update.message.reply_document(
                document=open(config_path, 'rb'),
                filename="config.json",
                caption="📄 Configuration file"
            )
        else:
            await update.message.reply_text(message, parse_mode='Markdown', disable_web_page_preview=True)
    
    except Exception as e:
        logger.error(f"Error in config_command: {e}", exc_info=True)
        await update.message.reply_text(f"❌ Error reading config: {str(e)}", disable_web_page_preview=True)


async def logs_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /logs command - show inline buttons for log types"""
    config = load_config()
    authorized_ids = config.get("controller_authorized_user_ids", [])
    
    if update.effective_user.id not in authorized_ids:
        await update.message.reply_text("❌ Unauthorized. You don't have permission to use this bot.", disable_web_page_preview=True)
        return
    
    keyboard = [
        [
            InlineKeyboardButton("📋 All Logs", callback_data="logs_all"),
            InlineKeyboardButton("❌ Error Logs", callback_data="logs_error")
        ],
        [
            InlineKeyboardButton("📝 Posting Logs", callback_data="logs_posting")
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        "📊 Select log type:",
        reply_markup=reply_markup,
        disable_web_page_preview=True
    )


async def handle_logs_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle logs callback query"""
    query = update.callback_query
    await query.answer()
    
    config = load_config()
    authorized_ids = config.get("controller_authorized_user_ids", [])
    
    if query.from_user.id not in authorized_ids:
        await query.edit_message_text("❌ Unauthorized.", disable_web_page_preview=True)
        return
    
    log_type = query.data.replace("logs_", "")
    logs_dir = Path("logs")
    
    # Find most recent log file
    log_files = sorted(logs_dir.glob("adbot_*.log"), key=lambda x: x.stat().st_mtime, reverse=True)
    
    if not log_files:
        await query.edit_message_text("❌ No log files found.", disable_web_page_preview=True)
        return
    
    log_file = log_files[0]  # Most recent
    
    try:
        # Read log file
        with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
        
        # Filter based on type
        if log_type == "error":
            filtered_lines = [line for line in lines if 'ERROR' in line or 'CRITICAL' in line]
            caption = "❌ Error Logs"
        elif log_type == "posting":
            filtered_lines = [line for line in lines if 'POSTED' in line or 'FORWARD' in line or 'SUCCESS' in line]
            caption = "📝 Posting Logs"
        else:  # all
            filtered_lines = lines
            caption = "📋 All Logs"
        
        if not filtered_lines:
            await query.edit_message_text(f"ℹ️ No {log_type} logs found in the most recent log file.", disable_web_page_preview=True)
            return
        
        # Create temp file with filtered content
        temp_file = Path(f"temp_{log_type}_logs.txt")
        with open(temp_file, 'w', encoding='utf-8') as f:
            f.writelines(filtered_lines[-1000:])  # Last 1000 lines
        
        # Send as document
        await query.edit_message_text(f"📤 Sending {caption}...", disable_web_page_preview=True)
        await context.bot.send_document(
            chat_id=query.message.chat_id,
            document=open(temp_file, 'rb'),
            filename=f"{log_type}_logs_{datetime.now().strftime('%Y%m%d')}.txt",
            caption=f"{caption} - {log_file.name}"
        )
        
        # Cleanup temp file
        temp_file.unlink()
    
    except Exception as e:
        logger.error(f"Error handling logs callback: {e}", exc_info=True)
        await query.edit_message_text(f"❌ Error: {str(e)}", disable_web_page_preview=True)


async def backup_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /backup command - backup configuration"""
    config = load_config()
    authorized_ids = config.get("controller_authorized_user_ids", [])
    
    if update.effective_user.id not in authorized_ids:
        await update.message.reply_text("❌ Unauthorized. You don't have permission to use this bot.", disable_web_page_preview=True)
        return
    
    try:
        backup_dir = Path("backups")
        backup_dir.mkdir(exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"config_backup_{timestamp}.json"
        backup_path = backup_dir / backup_name
        
        # Copy config.json to backup
        config_path = Path("config.json")
        if not config_path.exists():
            await update.message.reply_text("❌ config.json not found.", disable_web_page_preview=True)
            return
        
        shutil.copy2(config_path, backup_path)
        
        # Create zip with config and groups.txt if exists
        zip_name = f"backup_{timestamp}.zip"
        zip_path = backup_dir / zip_name
        
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            zipf.write(config_path, "config.json")
            if Path("groups.txt").exists():
                zipf.write("groups.txt", "groups.txt")
        
        # Send backup file
        await update.message.reply_document(
            document=open(zip_path, 'rb'),
            filename=zip_name,
            caption=f"💾 Configuration backup\n\nCreated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        )
        
        logger.info(f"Configuration backed up: {zip_name}")
    
    except Exception as e:
        logger.error(f"Error creating backup: {e}", exc_info=True)
        await update.message.reply_text(f"❌ Error creating backup: {str(e)}", disable_web_page_preview=True)


async def restore_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /restore command - restore configuration from backup"""
    config = load_config()
    authorized_ids = config.get("controller_authorized_user_ids", [])
    
    if update.effective_user.id not in authorized_ids:
        await update.message.reply_text("❌ Unauthorized. You don't have permission to use this bot.", disable_web_page_preview=True)
        return
    
    if not update.message.document:
        await update.message.reply_text(
            "❌ Please send a backup file (zip) to restore.\n\n"
            "Use /backup to create a backup first.",
            disable_web_page_preview=True
        )
        return
    
    try:
        doc = update.message.document
        
        if not (doc.file_name.endswith('.zip') or doc.file_name.endswith('.json')):
            await update.message.reply_text("❌ Invalid file type. Please send a .zip or .json backup file.", disable_web_page_preview=True)
            return
        
        await update.message.reply_text("🔄 Restoring configuration...", disable_web_page_preview=True)
        
        temp_path = Path(f"temp_restore_{doc.file_name}")
        file = await context.bot.get_file(doc.file_id)
        await file.download_to_drive(temp_path)
        
        try:
            if doc.file_name.endswith('.zip'):
                # Extract zip
                with zipfile.ZipFile(temp_path, 'r') as zipf:
                    # Extract config.json
                    if 'config.json' in zipf.namelist():
                        zipf.extract('config.json', Path('.'))
                        logger.info("Restored config.json from zip")
                    
                    # Extract groups.txt if exists
                    if 'groups.txt' in zipf.namelist():
                        zipf.extract('groups.txt', Path('.'))
                        logger.info("Restored groups.txt from zip")
            else:
                # Direct json file
                shutil.copy2(temp_path, Path("config.json"))
                logger.info("Restored config.json")
            
            # Reload config
            global config_data
            config_data = None
            load_config()
            
            await update.message.reply_text(
                "✅ Configuration restored successfully!\n\n"
                "⚠️ Bot restart recommended for changes to take full effect.",
                disable_web_page_preview=True
            )
        
        finally:
            # Cleanup temp file
            if temp_path.exists():
                temp_path.unlink()
    
    except Exception as e:
        logger.error(f"Error restoring backup: {e}", exc_info=True)
        await update.message.reply_text(f"❌ Error restoring backup: {str(e)}", disable_web_page_preview=True)


async def joinlog_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /joinlog command - join all sessions to log group"""
    config = load_config()
    authorized_ids = config.get("controller_authorized_user_ids", [])
    
    if update.effective_user.id not in authorized_ids:
        await update.message.reply_text("Unauthorized. You don't have permission to use this bot.", disable_web_page_preview=True)
        return
    
    log_group_link = config.get("log_group_link")
    if not log_group_link:
        await update.message.reply_text("❌ Log group link not configured in config.json", disable_web_page_preview=True)
        return
    
    await update.message.reply_text("🔄 Joining log group for all sessions...", disable_web_page_preview=True)
    
    session_files = get_session_files()
    accounts = config["accounts"]
    num_accounts = len(accounts)
    success_count = 0
    failed_count = 0
    
    for idx, session_file in enumerate(session_files):
        account_idx = idx % num_accounts
        account = accounts[account_idx]
        session_name = session_file.stem
        
        # CRITICAL FIX: Use the running event loop (PTB's loop) to prevent "Future attached to different loop" errors
        loop = asyncio.get_running_loop()
        client = TelegramClient(
            str(session_file),
            account["api_id"],
            account["api_hash"],
            loop=loop
        )
        
        try:
            await client.connect()
            if not await client.is_user_authorized():
                failed_count += 1
                continue
            
            if await ensure_in_log_group(client, log_group_link, session_name):
                success_count += 1
            else:
                failed_count += 1
            
            await client.disconnect()
        except Exception as e:
            logger.error(f"Failed to join log group for {session_name}: {e}")
            failed_count += 1
            try:
                await client.disconnect()
            except:
                pass
    
    result_msg = f"✅ Log group join complete!\n\nSuccess: {success_count}\nFailed: {failed_count}"
    await update.message.reply_text(result_msg, disable_web_page_preview=True)
    
    # Send to log group
    if success_count > 0:
        await send_log_to_telegram(
            f"Controller: {success_count} session(s) joined log group",
            config.get("log_group_id"),
            context.application
        )


def setup_signal_handlers(shutdown_event_ref):
    """Setup signal handlers for immediate exit on Ctrl+C"""
    def signal_handler(signum, frame):
        # Exit immediately, no cleanup
        os._exit(0)
    
    # Handle SIGINT (Ctrl+C) and SIGTERM - exit immediately
    if sys.platform != 'win32':
        signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)


async def cleanup_resources():
    """Clean up all resources before shutdown"""
    global worker_task, clients, controller_app
    
    logger.info("Cleaning up resources...")
    
    # Stop worker if running
    if worker_task and not worker_task.done():
        logger.info("Stopping worker task...")
        worker_task.cancel()
        try:
            await asyncio.wait_for(worker_task, timeout=5.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass
    
    # Stop forwarding task if running
    if forwarding_task and not forwarding_task.done():
        logger.info("Stopping forwarding task...")
        forwarding_task.cancel()
        try:
            await asyncio.wait_for(forwarding_task, timeout=5.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass
    
    # Disconnect all clients
    if clients:
        logger.info(f"Disconnecting {len(clients)} clients...")
        disconnect_tasks = []
        for client in clients:
            if client.is_connected():
                disconnect_tasks.append(client.disconnect())
        
        if disconnect_tasks:
            try:
                await asyncio.wait_for(asyncio.gather(*disconnect_tasks, return_exceptions=True), timeout=10.0)
            except (asyncio.TimeoutError, Exception) as e:
                # Silence ReadError during shutdown
                error_str = str(e)
                if "ReadError" not in error_str and "ReadError" not in str(type(e).__name__):
                    logger.warning(f"Error disconnecting clients: {e}")
    
    # Shutdown controller bot
    if controller_app:
        logger.info("Shutting down controller bot...")
        try:
            await controller_app.stop()
            await controller_app.shutdown()
        except Exception as e:
            # Silence ReadError during shutdown
            error_str = str(e)
            if "ReadError" not in error_str and "ReadError" not in str(type(e).__name__):
                logger.error(f"Error shutting down controller bot: {e}")
    
    logger.info("Cleanup complete")


async def main_idle_loop():
    """Idle loop that waits for shutdown signal - runs after PTB Application is initialized"""
    global shutdown_event
    try:
        # Keep running until shutdown event is set
        await shutdown_event.wait()
        logger.info("Shutdown signal received")
    except KeyboardInterrupt:
        # Exit immediately on Ctrl+C
        os._exit(0)
    except Exception as e:
        logger.error(f"Unexpected error in main loop: {e}", exc_info=True)
    finally:
        await cleanup_resources()


if __name__ == "__main__":
    try:
        # CRITICAL FIX: Use Application.run_polling() which owns and manages the event loop
        # This ensures python-telegram-bot v20+ owns the loop, preventing "Future attached to different loop" errors
        # Suppress Telethon mtproto logs at startup
        logging.getLogger('telethon').setLevel(logging.WARNING)
        
        config = load_config()
        controller_token = config.get("controller_bot_token")
        
        if not controller_token or controller_token == "your_controller_bot_token_here":
            logger.error("Controller bot token not configured in config.json")
            sys.exit(1)
        
        controller_app = Application.builder().token(controller_token).build()
        
        # Sync sessions registry on startup
        try:
            asyncio.run(sync_sessions_registry(config))
            logger.info("Sessions registry synced on startup")
        except Exception as e:
            logger.error(f"Error syncing sessions registry on startup: {e}")
        
        # Add handlers
        controller_app.add_handler(CommandHandler("start", start_command))
        controller_app.add_handler(CommandHandler("cancel", cancel_command))
        controller_app.add_handler(CommandHandler("stats", stats_command))
        controller_app.add_handler(CommandHandler("joinlog", joinlog_command))
        controller_app.add_handler(CommandHandler("add", add_user_command))
        controller_app.add_handler(CommandHandler("remove", remove_user_command))
        controller_app.add_handler(CommandHandler("cmd", cmd_command))
        controller_app.add_handler(CommandHandler("sessions", sessions_command))
        controller_app.add_handler(CommandHandler("refresh_sessions", refresh_sessions_command))
        controller_app.add_handler(CommandHandler("remove_session", remove_session_command))
        controller_app.add_handler(CommandHandler("config", config_command))
        controller_app.add_handler(CommandHandler("logs", logs_command))
        controller_app.add_handler(CommandHandler("backup", backup_command))
        controller_app.add_handler(CommandHandler("restore", restore_command))
        controller_app.add_handler(CallbackQueryHandler(button_callback))
        controller_app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, message_handler))
        controller_app.add_handler(MessageHandler(filters.Document.ALL, message_handler))
        
        # CRITICAL FIX: Use post_init to create shutdown_event AFTER PTB Application loop is running
        # This ensures shutdown_event is created in the same event loop that PTB owns
        async def post_init(app: Application) -> None:
            global shutdown_event, controller_app
            controller_app = app
            # Create shutdown_event in the loop that PTB owns (this is the correct loop)
            shutdown_event = asyncio.Event()
            setup_signal_handlers(shutdown_event)
            logger.info("Controller bot started. Press Ctrl+C to stop.")
            # Start the main idle loop
            asyncio.create_task(main_idle_loop())
        
        controller_app.post_init = post_init
        
        # Run the application - PTB owns the event loop, no manual loop management needed
        controller_app.run_polling(allowed_updates=["message", "callback_query"], stop_signals=None)
        
    except KeyboardInterrupt:
        # Exit immediately on Ctrl+C
        os._exit(0)
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)

