import asyncio
from telethon import TelegramClient
from telethon.tl.functions.chatlists import CheckChatlistInviteRequest, JoinChatlistInviteRequest
from telethon.tl.functions.channels import GetForumTopicsRequest
from telethon.tl.types import Channel, Chat
from telethon.errors import FloodWaitError, ChannelPrivateError, ChatAdminRequiredError
import re

API_ID = 26666259  # Replace with your API ID
API_HASH = 'e6530f4de21f2ee9add3ecc2ae52b44a'  # Replace with your API Hash

async def extract_chatlist_slug(invite_link):
    """Extract the chatlist slug from the invite link"""
    match = re.search(r't\.me/addlist/([A-Za-z0-9_-]+)', invite_link)
    if match:
        return match.group(1)
    return None

async def get_most_active_topic(client, channel):
    """Get the most active forum topic ID based on unread_count and top_message"""
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

async def scrape_chatlist(session_name, chatlist_link):
    """Main function to scrape groups from chatlist"""
    client = TelegramClient(session_name, API_ID, API_HASH)
    
    try:
        await client.start()
        
        slug = await extract_chatlist_slug(chatlist_link)
        if not slug:
            print("Invalid chatlist link format")
            return
        
        # Check chatlist invite
        try:
            check_result = await client(CheckChatlistInviteRequest(slug=slug))
        except Exception as e:
            print(f"Failed to check chatlist: {e}")
            return
        
        # Join chatlist to get access to peers
        try:
            await client(JoinChatlistInviteRequest(slug=slug, peers=[]))
        except Exception:
            pass
        
        # Get peers from the chatlist
        peers = []
        if hasattr(check_result, 'chats'):
            peers = check_result.chats
        
        results = []
        
        for peer in peers:
            try:
                # Resolve entity to get full information
                entity = await client.get_entity(peer)
                
                # Check entity type
                if isinstance(entity, Chat):
                    # Normal group (not supergroup) - forums not possible
                    results.append(f"-100{entity.id}")
                    
                elif isinstance(entity, Channel):
                    # Supergroup - check if forum-enabled
                    is_forum = getattr(entity, "forum", False)
                    
                    if not is_forum:
                        # Normal supergroup (not forum)
                        results.append(f"-100{entity.id}")
                    else:
                        # Forum-enabled supergroup
                        topic_id = await get_most_active_topic(client, entity)
                        if topic_id:
                            results.append(f"-100{entity.id}|{topic_id}")
                        else:
                            # No valid topics found, treat as normal group
                            results.append(f"-100{entity.id}")
                
                # Small delay to avoid flood
                await asyncio.sleep(1)
                
            except (FloodWaitError, ChannelPrivateError, ChatAdminRequiredError):
                # Skip silently
                continue
            except Exception:
                # Skip any other errors silently
                continue
        
        # Write results to file
        with open('mygroup.txt', 'w', encoding='utf-8') as f:
            for result in results:
                f.write(result + '\n')
        
        print(f"Scraped {len(results)} groups to mygroup.txt")
        
    finally:
        await client.disconnect()

async def main():
    print("Telegram Chatlist Scraper")
    print("-" * 40)
    
    session_name = input("Enter session name/path: ").strip()
    chatlist_link = input("Enter chatlist invite link: ").strip()
    
    await scrape_chatlist(session_name, chatlist_link)

if __name__ == "__main__":
    asyncio.run(main())