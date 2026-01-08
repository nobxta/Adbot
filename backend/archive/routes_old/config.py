"""
Configuration Routes - Manage AdBot config.json
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from backend.api.core.config_loader import ConfigLoader
from backend.api.core.auth import AuthDep

router = APIRouter()
config_loader = ConfigLoader()

# Request models
class PostLinkRequest(BaseModel):
    links: List[str]

class DelayRequest(BaseModel):
    delay: int

class AccountRequest(BaseModel):
    api_id: str
    api_hash: str

@router.get("/")
async def get_config(user: dict = AuthDep) -> Dict[str, Any]:
    """Get full config"""
    try:
        config = config_loader.load()
        # Don't expose sensitive data in API response
        safe_config = {k: v for k, v in config.items() if k != "controller_bot_token"}
        return {"success": True, "config": safe_config}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/post-links")
async def get_post_links(user: dict = AuthDep) -> Dict[str, Any]:
    """Get post links"""
    try:
        links = config_loader.get_post_links()
        return {"success": True, "links": links}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/post-links")
async def set_post_links(request: PostLinkRequest, user: dict = AuthDep) -> Dict[str, Any]:
    """Set post links"""
    try:
        config_loader.set_post_links(request.links)
        return {"success": True, "message": "Post links updated", "links": request.links}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/post-links/add")
async def add_post_link(link: str, user: dict = AuthDep) -> Dict[str, Any]:
    """Add a post link"""
    try:
        config = config_loader.add_post_link(link)
        return {"success": True, "message": "Post link added", "links": config.get("post_link", [])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/post-links")
async def remove_post_link(link: str, user: dict = AuthDep) -> Dict[str, Any]:
    """Remove a post link"""
    try:
        config = config_loader.remove_post_link(link)
        return {"success": True, "message": "Post link removed", "links": config.get("post_link", [])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/delays")
async def get_delays(user: dict = AuthDep) -> Dict[str, Any]:
    """Get delay settings"""
    try:
        return {
            "success": True,
            "delay_between_posts": config_loader.get_delay_between_posts(),
            "delay_between_cycles": config_loader.get_delay_between_cycles()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/delays/posts")
async def set_delay_posts(request: DelayRequest, user: dict = AuthDep) -> Dict[str, Any]:
    """Set delay between posts"""
    try:
        config_loader.set_delay_between_posts(request.delay)
        return {"success": True, "message": "Delay between posts updated", "delay": request.delay}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/delays/cycles")
async def set_delay_cycles(request: DelayRequest, user: dict = AuthDep) -> Dict[str, Any]:
    """Set delay between cycles"""
    try:
        config_loader.set_delay_between_cycles(request.delay)
        return {"success": True, "message": "Delay between cycles updated", "delay": request.delay}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/accounts")
async def get_accounts(user: dict = AuthDep) -> Dict[str, Any]:
    """Get accounts (API credentials)"""
    try:
        accounts = config_loader.get_accounts()
        # Don't expose API hashes in response
        safe_accounts = [{"api_id": acc["api_id"]} for acc in accounts]
        return {"success": True, "accounts": safe_accounts, "count": len(accounts)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/accounts")
async def add_account(request: AccountRequest, user: dict = AuthDep) -> Dict[str, Any]:
    """Add an account"""
    try:
        config_loader.add_account(request.api_id, request.api_hash)
        return {"success": True, "message": "Account added"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/accounts/{api_id}")
async def remove_account(api_id: str, user: dict = AuthDep) -> Dict[str, Any]:
    """Remove an account"""
    try:
        config_loader.remove_account(api_id)
        return {"success": True, "message": "Account removed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

