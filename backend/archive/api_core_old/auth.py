"""
Authentication utilities for API
"""

from fastapi import HTTPException, Header
from typing import Optional
import jwt
import os

JWT_SECRET = os.getenv("JWT_SECRET", "your-secret-key-change-this")


def require_admin(authorization: Optional[str] = Header(None)) -> dict:
    """
    Require admin role for endpoint access
    Raises HTTPException if not authorized
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    
    token = authorization.replace("Bearer ", "")
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        
        # Check if user is admin
        role = payload.get("role")
        if role != "ADMIN":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        return payload
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
