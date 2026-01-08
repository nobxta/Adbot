"""
Example Python script to read bot configuration from JSON files
This demonstrates how Telethon scripts can access bot data
"""

import json
import os
from pathlib import Path

# Get the backend data directory path
# Adjust this path based on your project structure
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / 'backend' / 'data'
USERS_FILE = DATA_DIR / 'users.json'

def get_user_bot_config(user_id: str) -> dict:
    """Read user bot configuration from JSON file"""
    try:
        with open(USERS_FILE, 'r') as f:
            data = json.load(f)
            return data.get('users', {}).get(user_id, {})
    except FileNotFoundError:
        print(f"Error: {USERS_FILE} not found")
        return {}
    except json.JSONDecodeError:
        print(f"Error: Invalid JSON in {USERS_FILE}")
        return {}

def get_all_active_bots() -> list:
    """Get all active bot configurations"""
    try:
        with open(USERS_FILE, 'r') as f:
            data = json.load(f)
            users = data.get('users', {})
            return [
                config for config in users.values()
                if config.get('botStatus') == 'active'
            ]
    except FileNotFoundError:
        return []
    except json.JSONDecodeError:
        return []

# Example usage with Telethon
"""
from telethon import TelegramClient
from telethon.sessions import StringSession

user_id = "your-user-id-here"
config = get_user_bot_config(user_id)

if config:
    # Initialize Telethon client
    client = TelegramClient(
        StringSession(config.get('sessionString')),
        int(config.get('apiId')),
        config.get('apiHash')
    )
    
    # Get advertisement content
    if config.get('advertisementType') == 'link':
        post_link = config.get('postLink')
        # Forward post from link
    else:
        custom_text = config.get('customText')
        # Send custom text
    
    # Get target groups
    group_ids = config.get('groupIds', [])
    
    # Send to groups
    for group_id in group_ids:
        # Send message to group
        pass
"""

if __name__ == '__main__':
    # Example: Get all active bots
    active_bots = get_all_active_bots()
    print(f"Found {len(active_bots)} active bots")
    
    for bot in active_bots:
        print(f"User: {bot.get('email')}")
        print(f"Status: {bot.get('botStatus')}")
        print(f"Groups: {len(bot.get('groupIds', []))}")
        print("---")

