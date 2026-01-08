
"""
Lightweight Telegram Session Status Detector
Detects if a session is Active, Dead, or Frozen
"""

from telethon import TelegramClient, errors
from telethon.tl.functions.account import GetAuthorizationsRequest
import asyncio
from enum import Enum

class SessionStatus(Enum):
    ACTIVE = "Active"      # Connected and fully functional
    DEAD = "Dead"          # Logged out or deleted
    FROZEN = "Frozen"      # Read-only mode (restricted)

class SessionDetector:
    def __init__(self, api_id: int, api_hash: str, session_name: str):
        """
        Initialize the session detector
        
        Args:
            api_id: Your Telegram API ID
            api_hash: Your Telegram API Hash
            session_name: Path to the .session file (without extension)
        """
        self.api_id = api_id
        self.api_hash = api_hash
        self.session_name = session_name
        self.client = None
    
    async def detect_status(self) -> tuple[SessionStatus, str]:
        """
        Detect the session status with minimal operations
        
        Returns:
            tuple: (SessionStatus, details_message)
        """
        try:
            # Create client with minimal settings
            self.client = TelegramClient(
                self.session_name,
                self.api_id,
                self.api_hash,
                device_model="Session Checker",
                system_version="1.0"
            )
            
            # Try to connect
            await self.client.connect()
            
            # Check if session is authorized
            if not await self.client.is_user_authorized():
                return SessionStatus.DEAD, "Session is not authorized (logged out or deleted)"
            
            # Get basic info to verify connection
            try:
                me = await self.client.get_me()
                
                # Check if account is restricted (frozen)
                if me.restricted:
                    reason = me.restriction_reason[0].text if me.restriction_reason else "Unknown"
                    return SessionStatus.FROZEN, f"Account restricted: {reason}"
                
                # Try multiple operations to detect frozen state
                frozen_indicators = []
                
                # Test 1: Check account status flags
                try:
                    from telethon.tl.functions.account import GetContentSettingsRequest
                    settings = await self.client(GetContentSettingsRequest())
                    if hasattr(settings, 'sensitive_enabled') and settings.sensitive_enabled:
                        frozen_indicators.append("Sensitive content restriction")
                except:
                    pass
                
                # Test 2: Try to get authorizations
                try:
                    await self.client(GetAuthorizationsRequest())
                except errors.UserDeactivatedError:
                    return SessionStatus.FROZEN, "Account deactivated"
                except errors.UserDeactivatedBanError:
                    return SessionStatus.FROZEN, "Account banned"
                except errors.AuthKeyUnregisteredError:
                    return SessionStatus.DEAD, "Auth key unregistered"
                except Exception as e:
                    error_msg = str(e).upper()
                    if any(word in error_msg for word in ["READ", "RESTRICTED", "FLOOD", "SPAM", "BANNED", "LIMIT"]):
                        frozen_indicators.append(f"Auth: {str(e)}")
                
                # Test 3: Try to get full user info with access hash
                try:
                    full_user = await self.client.get_entity(me.id)
                    if hasattr(full_user, 'restriction_reason') and full_user.restriction_reason:
                        return SessionStatus.FROZEN, f"Restricted: {full_user.restriction_reason[0].text}"
                except Exception as e:
                    error_msg = str(e).upper()
                    if "RESTRICTED" in error_msg or "BANNED" in error_msg:
                        frozen_indicators.append(f"Entity: {str(e)}")
                
                # Test 4: Try to check if can send messages (test with saved messages)
                try:
                    # Get saved messages chat
                    saved_messages = await self.client.get_entity('me')
                    # Try to get message history (this fails if restricted)
                    messages = await self.client.get_messages(saved_messages, limit=1)
                except errors.ChatWriteForbiddenError:
                    return SessionStatus.FROZEN, "Write access forbidden (Spambot/Restricted)"
                except errors.UserRestrictedError:
                    return SessionStatus.FROZEN, "User restricted from messaging"
                except Exception as e:
                    error_msg = str(e).upper()
                    if any(word in error_msg for word in ["RESTRICTED", "FORBIDDEN", "SPAM", "BANNED"]):
                        frozen_indicators.append(f"Messaging: {str(e)}")
                
                # Test 5: Check if account has peer flood restrictions
                try:
                    from telethon.tl.functions.contacts import GetContactsRequest
                    contacts = await self.client(GetContactsRequest(hash=0))
                except errors.FloodWaitError as e:
                    return SessionStatus.FROZEN, f"Flood wait restriction: {e.seconds}s"
                except Exception as e:
                    error_msg = str(e).upper()
                    if "FLOOD" in error_msg or "PEER_FLOOD" in error_msg:
                        return SessionStatus.FROZEN, f"Peer flood restriction: {str(e)}"
                
                # Test 6: Try to access dialogs
                try:
                    dialogs = await self.client.get_dialogs(limit=5)
                    if len(dialogs) == 0 and me.phone:  # Has phone but no dialogs is suspicious
                        frozen_indicators.append("No accessible dialogs")
                except errors.UserDeactivatedError:
                    return SessionStatus.FROZEN, "Account deactivated"
                except errors.UserDeactivatedBanError:
                    return SessionStatus.FROZEN, "Account banned"
                except Exception as e:
                    error_msg = str(e).upper()
                    if any(word in error_msg for word in ["RESTRICTED", "FLOOD", "SPAM", "BANNED"]):
                        frozen_indicators.append(f"Dialogs: {str(e)}")
                
                # If multiple frozen indicators found, account is likely frozen
                if len(frozen_indicators) >= 2:
                    return SessionStatus.FROZEN, f"Multiple restrictions: {'; '.join(frozen_indicators[:2])}"
                elif frozen_indicators:
                    return SessionStatus.FROZEN, f"Restriction detected: {frozen_indicators[0]}"
                
                # All tests passed - account is active
                return SessionStatus.ACTIVE, f"Session active for {me.first_name} (@{me.username or 'N/A'})"
            
            except errors.AuthKeyUnregisteredError:
                return SessionStatus.DEAD, "Auth key unregistered"
            
            except errors.UserDeactivatedError:
                return SessionStatus.FROZEN, "User deactivated"
            
            except errors.UserDeactivatedBanError:
                return SessionStatus.FROZEN, "User banned"
            
            except errors.SessionRevokedError:
                return SessionStatus.DEAD, "Session revoked"
            
            except errors.SessionExpiredError:
                return SessionStatus.DEAD, "Session expired"
            
            except Exception as e:
                return SessionStatus.DEAD, f"Error getting user info: {str(e)}"
        
        except errors.ApiIdInvalidError:
            return SessionStatus.DEAD, "Invalid API ID or Hash"
        
        except errors.PhoneNumberInvalidError:
            return SessionStatus.DEAD, "Phone number invalid"
        
        except Exception as e:
            return SessionStatus.DEAD, f"Connection error: {str(e)}"
        
        finally:
            if self.client:
                await self.client.disconnect()
    
    async def check(self) -> dict:
        """
        Perform the check and return detailed results
        
        Returns:
            dict: Status information
        """
        status, details = await self.detect_status()
        
        return {
            "status": status.value,
            "details": details,
            "is_active": status == SessionStatus.ACTIVE,
            "is_dead": status == SessionStatus.DEAD,
            "is_frozen": status == SessionStatus.FROZEN
        }


async def check_session(api_id: int, api_hash: str, session_name: str) -> dict:
    """
    Quick function to check a session status
    
    Args:
        api_id: Telegram API ID
        api_hash: Telegram API Hash
        session_name: Session file path
    
    Returns:
        dict: Status information
    """
    detector = SessionDetector(api_id, api_hash, session_name)
    return await detector.check()

# Example usage
async def main():
    # Your API credentials
    API_ID = 25170767  # Replace with your API ID
    API_HASH = "d512fd74809a4ca3cd59078eef73afcd"  # Replace with your API Hash

    print("=" * 50)
    print("Telegram Session Status Detector")
    print("=" * 50)
    
    # Get session path from user
    try:
        session_path = input("\nEnter session file path (drag & drop or paste): ").strip()
        
        # Clean up the path (remove quotes if present)
        session_path = session_path.strip('"').strip("'")
        
        # Remove .session extension if provided
        if session_path.endswith('.session'):
            session_path = session_path[:-8]
        
        print("\n" + "=" * 50)
        print("Checking session status...")
        print("=" * 50)
        
        result = await check_session(API_ID, API_HASH, session_path)
        
        print(f"\n{'=' * 50}")
        print("RESULT")
        print("=" * 50)
        print(f"Status: {result['status']}")
        print(f"Details: {result['details']}")
        print(f"\nActive: {result['is_active']}")
        print(f"Dead: {result['is_dead']}")
        print(f"Frozen: {result['is_frozen']}")
        print("=" * 50)
        
    except KeyboardInterrupt:
        print("\n\n⚠️ Cancelled by user")
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")


if __name__ == "__main__":
    asyncio.run(main())