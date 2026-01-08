"""
Admin API Pair Management API
Handles API_ID/API_HASH pair upload, listing, and management
API pairs stored in data/api_pairs.json
"""

from fastapi import APIRouter, HTTPException, Depends, Body
from typing import Dict, Any, List
from pydantic import BaseModel
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from api.admin_auth import require_admin
from bot.api_pairs import load_api_pairs, save_api_pairs

router = APIRouter()


class APIPairRequest(BaseModel):
    api_id: str
    api_hash: str


class AddAPIPairRequest(BaseModel):
    api_id: str
    api_hash: str


@router.get("/list")
async def list_api_pairs(
    admin: dict = Depends(require_admin)
) -> Dict[str, Any]:
    """
    List all API pairs
    """
    try:
        pairs = load_api_pairs()
        return {
            "success": True,
            "pairs": pairs,
            "count": len(pairs)
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list API pairs: {str(e)}"
        )


@router.post("/add")
async def add_api_pair(
    request: AddAPIPairRequest = Body(...),
    admin: dict = Depends(require_admin)
) -> Dict[str, Any]:
    """
    Add a new API pair
    """
    try:
        # Validate inputs
        api_id = request.api_id.strip()
        api_hash = request.api_hash.strip()
        
        if not api_id or not api_hash:
            raise HTTPException(status_code=400, detail="api_id and api_hash are required")
        
        # Basic validation - api_id should be numeric, api_hash should be hex
        if not api_id.isdigit():
            raise HTTPException(status_code=400, detail="api_id must be numeric")
        
        if not all(c in '0123456789abcdef' for c in api_hash.lower()):
            raise HTTPException(status_code=400, detail="api_hash must be hexadecimal")
        
        # Load existing pairs
        pairs = load_api_pairs()
        
        # Check for duplicates
        for pair in pairs:
            if pair.get("api_id") == api_id:
                raise HTTPException(
                    status_code=409,
                    detail=f"API pair with api_id {api_id} already exists"
                )
        
        # Add new pair
        new_pair = {
            "api_id": api_id,
            "api_hash": api_hash
        }
        pairs.append(new_pair)
        
        # Save
        save_api_pairs(pairs)
        
        return {
            "success": True,
            "message": "API pair added successfully",
            "pair": new_pair
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add API pair: {str(e)}"
        )


@router.delete("/{api_id}")
async def delete_api_pair(
    api_id: str,
    admin: dict = Depends(require_admin)
) -> Dict[str, Any]:
    """
    Delete an API pair by api_id
    WARNING: This may affect running bots if the pair is in use
    """
    try:
        pairs = load_api_pairs()
        
        # Find and remove the pair
        original_count = len(pairs)
        pairs = [p for p in pairs if p.get("api_id") != api_id]
        
        if len(pairs) == original_count:
            raise HTTPException(
                status_code=404,
                detail=f"API pair with api_id {api_id} not found"
            )
        
        # Save
        save_api_pairs(pairs)
        
        return {
            "success": True,
            "message": f"API pair {api_id} deleted successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete API pair: {str(e)}"
        )

