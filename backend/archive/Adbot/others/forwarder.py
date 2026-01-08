import asyncio
import json
import os
import random
from pathlib import Path
from multiprocessing import Process
from telethon import TelegramClient
from telethon.tl.types import MessageMediaWebPage
import time

def load_config():
    """Load configuration from config.json"""
    with open('config.json', 'r') as f:
        return json.load(f)

def load_groups():
    """Load group IDs from groups.txt"""
    with open('groups.txt', 'r') as f:
        return [line.strip() for line in f if line.strip()]

def get_session_files():
    """Get all session files from sessions folder"""
    sessions_dir = Path('sessions')
    if not sessions_dir.exists():
        raise FileNotFoundError("Sessions folder not found!")
    return list(sessions_dir.glob('*.session'))

def distribute_groups(groups, num_sessions):
    """Distribute groups evenly across sessions"""
    distribution = [[] for _ in range(num_sessions)]
    for idx, group in enumerate(groups):
        distribution[idx % num_sessions].append(group)
    return distribution

def parse_post_link(post_link):
    """Parse Telegram post link to extract channel and message ID"""
    # Format: t.me/channel_name/message_id or https://t.me/channel_name/message_id
    link = post_link.replace('https://', '').replace('http://', '')
    parts = link.split('/')
    if len(parts) >= 3:
        channel = parts[1]
        message_id = int(parts[2])
        return channel, message_id
    raise ValueError("Invalid post link format")

async def forward_to_groups(session_path, api_id, api_hash, post_link, assigned_groups, config):
    """Forward post to assigned groups using a specific session"""
    session_name = session_path.stem
    client = TelegramClient(str(session_path), api_id, api_hash)
    
    try:
        await client.connect()
        
        if not await client.is_user_authorized():
            print(f"[{session_name}] Session not authorized, skipping...")
            return
        
        # Parse post link
        source_channel, message_id = parse_post_link(post_link)
        
        print(f"[{session_name}] Starting to forward from {source_channel}/{message_id}")
        print(f"[{session_name}] Assigned groups: {len(assigned_groups)}")
        
        # Get the message to forward
        message = await client.get_messages(source_channel, ids=message_id)
        
        if not message:
            print(f"[{session_name}] Message not found!")
            return
        
        # Forward to each assigned group
        for group_id in assigned_groups:
            try:
                # Convert string ID to int if needed
                if isinstance(group_id, str):
                    group_id = int(group_id)
                
                # Forward the message
                await client.forward_messages(
                    entity=group_id,
                    messages=message_id,
                    from_peer=source_channel
                )
                
                print(f"[{session_name}] ✓ Forwarded to {group_id}")
                
                # Delay between posts
                delay = config.get('delay_between_posts', 5)
                await asyncio.sleep(delay + random.uniform(0, 2))
                
            except Exception as e:
                print(f"[{session_name}] ✗ Failed to forward to {group_id}: {str(e)}")
                continue
        
        print(f"[{session_name}] Completed forwarding cycle")
        
    except Exception as e:
        print(f"[{session_name}] Error: {str(e)}")
    finally:
        await client.disconnect()

def worker_process(session_path, api_id, api_hash, post_link, assigned_groups, config):
    """Worker process wrapper for async function"""
    asyncio.run(forward_to_groups(session_path, api_id, api_hash, post_link, assigned_groups, config))

def main():
    """Main function to coordinate forwarding across multiple sessions"""
    print("=" * 60)
    print("Telethon Message Forwarder with Multiprocessing")
    print("=" * 60)
    
    # Load configuration
    config = load_config()
    groups = load_groups()
    session_files = get_session_files()
    
    if not session_files:
        print("No session files found in 'sessions' folder!")
        return
    
    if not groups:
        print("No groups found in groups.txt!")
        return
    
    print(f"\nFound {len(session_files)} session(s)")
    print(f"Found {len(groups)} group(s)")
    print(f"Found {len(config['accounts'])} account(s) in config")
    
    # Randomly select sessions to use (up to number of accounts in config)
    num_workers = min(len(session_files), len(config['accounts']))
    selected_sessions = random.sample(session_files, num_workers)
    
    print(f"\nUsing {num_workers} session(s) for parallel processing")
    
    # Distribute groups across sessions
    group_distribution = distribute_groups(groups, num_workers)
    
    # Create processes for each session
    processes = []
    
    for idx, session_path in enumerate(selected_sessions):
        account = config['accounts'][idx]
        assigned_groups = group_distribution[idx]
        
        print(f"\nSession {idx + 1}: {session_path.name}")
        print(f"  API ID: {account['api_id']}")
        print(f"  Assigned Groups: {len(assigned_groups)}")
        
        p = Process(
            target=worker_process,
            args=(
                session_path,
                account['api_id'],
                account['api_hash'],
                config['post_link'],
                assigned_groups,
                config
            )
        )
        processes.append(p)
    
    # Start all processes
    print("\n" + "=" * 60)
    print("Starting parallel forwarding...")
    print("=" * 60 + "\n")
    
    for p in processes:
        p.start()
        time.sleep(1)  # Small delay between starting processes
    
    # Wait for all processes to complete
    for p in processes:
        p.join()
    
    print("\n" + "=" * 60)
    print("All forwarding processes completed!")
    print("=" * 60)

if __name__ == "__main__":
    main()