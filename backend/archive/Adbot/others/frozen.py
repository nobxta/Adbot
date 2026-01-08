from telethon import TelegramClient, errors
from telethon.tl.functions.messages import GetDialogsRequest
from telethon.tl.types import InputPeerEmpty
import asyncio
import os


API_ID = '25170767'
API_HASH = 'd512fd74809a4ca3cd59078eef73afcd'


class SessionStatus:
    ACTIVE = "ACTIVE"
    FROZEN = "FROZEN"
    UNAUTHORIZED = "UNAUTHORIZED"


async def check_session_status(session_path):
    """
    Check the status of a Telegram session
    
    Args:
        session_path: Path to the .session file
    
    Returns:
        tuple: (status, details_dict)
    """
    
    # Remove .session extension if present
    if session_path.endswith('.session'):
        session_path = session_path[:-8]
    
    client = TelegramClient(session_path, API_ID, API_HASH)
    
    try:
        print("   → Connecting to Telegram...")
        await client.connect()
        
        # STEP 1: Check if the session is authorized (logged in)
        print("   → Checking authorization status...")
        is_authorized = await client.is_user_authorized()
        
        if not is_authorized:
            print("   → Session is NOT logged in")
            await client.disconnect()
            return SessionStatus.UNAUTHORIZED, {
                "logged_in": False,
                "can_send": False,
                "can_read": False,
                "message": "Session is not logged in - UNAUTHORIZED"
            }
        
        print("   → Session is logged in ✓")
        
        # STEP 2: Get user information
        print("   → Fetching user information...")
        try:
            me = await client.get_me()
            user_info = {
                "user_id": me.id,
                "username": me.username,
                "phone": me.phone,
                "first_name": me.first_name,
                "last_name": me.last_name
            }
            print(f"   → User: {me.first_name} ({me.phone})")
        except Exception as e:
            print(f"   → Error getting user info: {e}")
            await client.disconnect()
            return SessionStatus.UNAUTHORIZED, {
                "logged_in": False,
                "error": str(e),
                "message": "Could not retrieve user information"
            }
        
        # STEP 3: Test READ capability
        print("   → Testing READ capability...")
        try:
            dialogs = await client.get_dialogs(limit=5)
            can_read = True
            print(f"   → Can READ messages ✓ (Found {len(dialogs)} dialogs)")
        except Exception as e:
            can_read = False
            print(f"   → Cannot read: {e}")
        
        # STEP 4: Test WRITE capability (send message)
        print("   → Testing WRITE capability...")
        can_send = False
        freeze_error = None
        
        try:
            # Try to send a message to Saved Messages (self)
            test_message = await client.send_message('me', '🔍 Test')
            can_send = True
            print("   → Can SEND messages ✓")
            
            # Clean up test message
            try:
                await client.delete_messages('me', test_message.id)
                print("   → Test message deleted")
            except:
                pass
                
        except errors.UserDeactivatedError as e:
            freeze_error = "UserDeactivatedError"
            print(f"   → Account FROZEN: {freeze_error}")
            
        except errors.UserDeactivatedBanError as e:
            freeze_error = "UserDeactivatedBanError"
            print(f"   → Account FROZEN: {freeze_error}")
            
        except errors.ChatWriteForbiddenError as e:
            freeze_error = "ChatWriteForbiddenError"
            print(f"   → Account FROZEN: {freeze_error}")
            
        except errors.UserRestrictedError as e:
            freeze_error = "UserRestrictedError"
            print(f"   → Account FROZEN: {freeze_error}")
            
        except errors.FloodWaitError as e:
            can_send = True  # Account is active, just rate limited
            print(f"   → Rate limited for {e.seconds} seconds (but account is ACTIVE)")
            
        except Exception as e:
            error_msg = str(e).lower()
            # Check if error indicates frozen/restricted account
            if any(keyword in error_msg for keyword in 
                   ['restricted', 'banned', 'deactivated', 'frozen', 'forbidden']):
                freeze_error = str(e)
                print(f"   → Account appears FROZEN: {e}")
            else:
                # Unknown error, might still be active
                can_send = False
                print(f"   → Send test failed: {e}")
        
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
            
    except errors.AuthKeyUnregisteredError:
        await client.disconnect()
        return SessionStatus.UNAUTHORIZED, {
            "logged_in": False,
            "message": "Auth key is unregistered - Session UNAUTHORIZED"
        }
        
    except errors.SessionPasswordNeededError:
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


async def main():
    print("=" * 60)
    print("TELEGRAM SESSION STATUS CHECKER")
    print("=" * 60)
    print()
    
    session_path = input("Enter session path: ").strip()
    
    # Remove quotes if present
    session_path = session_path.strip('"').strip("'")
    
    if not os.path.exists(session_path) and not os.path.exists(session_path + '.session'):
        print("\n❌ Error: Session file not found!")
        print(f"   Looking for: {session_path}")
        return
    
    print("\n🔍 Checking session status...")
    print()
    
    status, details = await check_session_status(session_path)
    
    # Display results
    print()
    print("=" * 60)
    print(f"FINAL STATUS: {status}")
    print("=" * 60)
    print()
    
    if status == SessionStatus.ACTIVE:
        print("✅ Account Status: ACTIVE & UNRESTRICTED")
        print()
        print("   Capabilities:")
        print("   • ✓ Logged in")
        print("   • ✓ Can read messages")
        print("   • ✓ Can send messages")
        print("   • ✓ Full functionality available")
        
    elif status == SessionStatus.FROZEN:
        print("⚠️  Account Status: FROZEN/RESTRICTED")
        print()
        print("   Capabilities:")
        print("   • ✓ Logged in")
        print("   • ✓ Can read messages" if details.get('can_read') else "   • ✗ Cannot read messages")
        print("   • ✗ Cannot send messages")
        print("   • ✗ Limited functionality")
        
    elif status == SessionStatus.UNAUTHORIZED:
        print("❌ Account Status: UNAUTHORIZED")
        print()
        print("   Capabilities:")
        print("   • ✗ Not logged in")
        print("   • ✗ Cannot read messages")
        print("   • ✗ Cannot send messages")
        print("   • ✗ Session expired or invalid")
    
    print()
    print("Details:")
    print("-" * 60)
    for key, value in details.items():
        print(f"  {key}: {value}")
    print("=" * 60)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n⚠️  Operation cancelled by user")
    except Exception as e:
        print(f"\n\n❌ Unexpected error: {e}")