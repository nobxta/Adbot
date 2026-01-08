"""
Admin Authentication Helper
Verifies JWT and ensures user has ADMIN role
"""

from fastapi import HTTPException, Header
from typing import Optional, Dict, Any
import jwt
import os

# IMPORTANT: This must match the JWT_SECRET used by the frontend
# If tokens are failing, check that both frontend and backend use the same JWT_SECRET
# Load from environment variable - check .env file in backend/ directory
# Note: .env file is loaded in main.py, so this will get the value from there
JWT_SECRET = os.getenv("JWT_SECRET", "your-super-secret-jwt-key-change-in-production")

# Debug: Print what secret is being used (first 10 chars only for security)
# This runs when the module is imported, so it will show if .env was loaded
if not JWT_SECRET or JWT_SECRET == "your-super-secret-jwt-key-change-in-production":
    print("⚠️  WARNING: JWT_SECRET is using default value!")
    print("   Make sure JWT_SECRET is set in backend/.env file")
    print("   Current value (first 10 chars):", JWT_SECRET[:10] if JWT_SECRET else "None")
    print("   After creating .env file, RESTART the Python backend server")
else:
    print(f"✓ JWT_SECRET loaded (first 10 chars): {JWT_SECRET[:10]}...")


def require_admin(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """
    Require admin role for endpoint access
    Raises HTTPException if not authorized
    Returns JWT payload if authorized
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    
    token = authorization.replace("Bearer ", "").strip()
    
    if not token:
        raise HTTPException(status_code=401, detail="Token is empty")
    
    try:
        # Decode token - don't verify expiration for now to debug
        # First try with verify_expiration=True
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"], options={"verify_signature": True})
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except jwt.InvalidSignatureError:
            # Try with different secret or log the error
            print(f"JWT_SECRET being used: {JWT_SECRET[:10]}... (first 10 chars)")
            raise HTTPException(status_code=401, detail="Invalid token signature - JWT_SECRET mismatch")
        
        # Check if user is admin
        role = payload.get("role")
        if not role:
            raise HTTPException(status_code=401, detail="Token missing role field")
        
        # Normalize role to uppercase for comparison
        role_upper = str(role).upper()
        if role_upper not in ["ADMIN"]:
            raise HTTPException(status_code=403, detail=f"Admin access required. Current role: {role}")
        
        return payload
        
    except HTTPException:
        raise
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        print(f"JWT decode error: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        print(f"Authentication error: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

