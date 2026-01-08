"""
Admin Group File Management API
Handles reading and writing to starter_groups.txt and enterprise_groups.txt
"""

from fastapi import APIRouter, HTTPException, Depends, Body, Query
from typing import Dict, Any, List
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from api.admin_auth import require_admin
from bot.group_file_manager import (
    get_group_cache,
    get_groups_for_plan,
    ensure_groups_dir,
    STARTER_GROUPS_FILE,
    ENTERPRISE_GROUPS_FILE,
    parse_group_file
)

router = APIRouter()

# Ensure directories exist
ensure_groups_dir()


@router.get("/list")
async def list_groups(
    plan_type: str = Query(default="STARTER", description="Plan type: STARTER or ENTERPRISE"),
    admin: dict = Depends(require_admin)
) -> Dict[str, Any]:
    """
    List groups from a plan's group file
    
    Args:
        plan_type: "STARTER" | "ENTERPRISE"
    
    Returns:
        List of group IDs and file info
    """
    if plan_type not in ["STARTER", "ENTERPRISE"]:
        raise HTTPException(status_code=400, detail="plan_type must be 'STARTER' or 'ENTERPRISE'")
    
    try:
        groups = get_groups_for_plan(plan_type)
        
        # Get file info
        file_path = STARTER_GROUPS_FILE if plan_type == "STARTER" else ENTERPRISE_GROUPS_FILE
        file_exists = file_path.exists()
        file_size = file_path.stat().st_size if file_exists else 0
        
        return {
            "success": True,
            "plan_type": plan_type,
            "groups": groups,
            "count": len(groups),
            "file_path": str(file_path),
            "file_exists": file_exists,
            "file_size": file_size
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read groups: {str(e)}")


@router.post("/update")
async def update_groups(
    body: Dict[str, Any] = Body(...),
    admin: dict = Depends(require_admin)
) -> Dict[str, Any]:
    """
    Update groups in a plan's group file
    
    Body:
        plan_type: "STARTER" | "ENTERPRISE"
        groups: List of numeric group IDs (strings)
        action: "replace" | "add" | "remove" (default: "replace")
    
    Returns:
        Updated groups list and count
    """
    plan_type = body.get("plan_type", "STARTER")
    groups = body.get("groups", [])
    action = body.get("action", "replace")
    
    if plan_type not in ["STARTER", "ENTERPRISE"]:
        raise HTTPException(status_code=400, detail="plan_type must be 'STARTER' or 'ENTERPRISE'")
    
    if not isinstance(groups, list):
        raise HTTPException(status_code=400, detail="groups must be an array")
    
    if action not in ["replace", "add", "remove"]:
        raise HTTPException(status_code=400, detail="action must be 'replace', 'add', or 'remove'")
    
    # Validate all groups are numeric IDs
    for group in groups:
        if not isinstance(group, str):
            raise HTTPException(status_code=400, detail=f"Invalid group format: {group}. Must be string")
        
        group = group.strip()
        if not group:
            raise HTTPException(status_code=400, detail="Groups cannot be empty strings")
        
        # Must be -100xxxxx format (Telegram supergroup ID)
        if not group.startswith('-100'):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid group ID: {group}. Must start with -100 (e.g., -1001234567890)"
            )
        
        # Check that after -100, there are only digits
        numeric_part = group[4:]  # Everything after -100
        if not numeric_part or not numeric_part.isdigit():
            raise HTTPException(
                status_code=400,
                detail=f"Invalid group ID: {group}. Must be in format -100 followed by digits (e.g., -1001234567890)"
            )
        
        # Ensure minimum length (at least -100 + some digits)
        if len(group) < 7:  # -100 + at least 3 digits
            raise HTTPException(
                status_code=400,
                detail=f"Invalid group ID: {group}. Too short, must be at least -100xxx"
            )
    
    try:
        file_path = STARTER_GROUPS_FILE if plan_type == "STARTER" else ENTERPRISE_GROUPS_FILE
        
        # Get current groups
        current_groups = []
        if file_path.exists():
            try:
                current_groups = parse_group_file(file_path)
            except Exception as e:
                # If file is corrupted, start fresh
                current_groups = []
        
        # Apply action
        if action == "replace":
            new_groups = groups
        elif action == "add":
            # Add groups, avoiding duplicates
            new_groups = list(current_groups)
            for group in groups:
                if group not in new_groups:
                    new_groups.append(group)
        elif action == "remove":
            # Remove groups
            new_groups = [g for g in current_groups if g not in groups]
        
        # Remove duplicates while preserving order
        seen = set()
        unique_groups = []
        for group in new_groups:
            if group not in seen:
                seen.add(group)
                unique_groups.append(group)
        
        # Write to file
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, 'w', encoding='utf-8') as f:
            for group in unique_groups:
                f.write(f"{group}\n")
        
        # Clear cache to force reload
        group_cache = get_group_cache()
        if plan_type == "STARTER":
            group_cache.get_starter_groups(force_reload=True)
        else:
            group_cache.get_enterprise_groups(force_reload=True)
        
        return {
            "success": True,
            "plan_type": plan_type,
            "action": action,
            "groups": unique_groups,
            "count": len(unique_groups),
            "added": len(groups) if action == "add" else None,
            "removed": len([g for g in current_groups if g not in unique_groups]) if action == "remove" else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update groups: {str(e)}")


@router.post("/validate")
async def validate_groups(
    body: Dict[str, Any] = Body(...),
    admin: dict = Depends(require_admin)
) -> Dict[str, Any]:
    """
    Validate group IDs without saving
    
    Body:
        groups: List of group IDs to validate
    
    Returns:
        Validation results
    """
    groups = body.get("groups", [])
    
    if not isinstance(groups, list):
        raise HTTPException(status_code=400, detail="groups must be an array")
    
    valid = []
    invalid = []
    
    for idx, group in enumerate(groups):
        if not isinstance(group, str):
            invalid.append({
                "index": idx,
                "group": group,
                "error": "Must be a string"
            })
            continue
        
        group = group.strip()
        if not group:
            invalid.append({
                "index": idx,
                "group": group,
                "error": "Cannot be empty"
            })
            continue
        
        # Validate -100xxxxx format
        if not group.startswith('-100'):
            invalid.append({
                "index": idx,
                "group": group,
                "error": "Must start with -100 (e.g., -1001234567890)"
            })
        else:
            numeric_part = group[4:]  # Everything after -100
            if not numeric_part or not numeric_part.isdigit():
                invalid.append({
                    "index": idx,
                    "group": group,
                    "error": "Must be -100 followed by digits only (e.g., -1001234567890)"
                })
            elif len(group) < 7:
                invalid.append({
                    "index": idx,
                    "group": group,
                    "error": "Too short, must be at least -100xxx"
                })
            else:
                valid.append(group)
    
    return {
        "success": True,
        "valid_count": len(valid),
        "invalid_count": len(invalid),
        "valid": valid,
        "invalid": invalid
    }

