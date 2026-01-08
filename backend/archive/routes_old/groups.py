"""
Groups Routes - Manage AdBot groups
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
from pathlib import Path
from backend.api.core.auth import AuthDep

router = APIRouter()

def _get_groups_file() -> Path:
    """Get AdBot groups.txt file"""
    base = Path(__file__).parent.parent.parent.parent  # Project root
    groups_file = base / "backend" / "Adbot" / "groups.txt"
    return groups_file.absolute()

def _get_groups_dir() -> Path:
    """Get AdBot groups directory"""
    base = Path(__file__).parent.parent.parent.parent  # Project root
    groups_dir = base / "backend" / "Adbot" / "groups"
    return groups_dir.absolute()

@router.get("/")
async def get_groups(user: dict = AuthDep) -> Dict[str, Any]:
    """Get all groups from groups.txt"""
    try:
        groups_file = _get_groups_file()
        
        if not groups_file.exists():
            return {"success": True, "groups": [], "count": 0}
        
        with open(groups_file, "r", encoding="utf-8") as f:
            groups = [line.strip() for line in f if line.strip() and not line.strip().startswith("#")]
        
        return {"success": True, "groups": groups, "count": len(groups)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
async def set_groups(groups: List[str], user: dict = AuthDep) -> Dict[str, Any]:
    """Set groups in groups.txt"""
    try:
        groups_file = _get_groups_file()
        
        # Create backup
        if groups_file.exists():
            backup = groups_file.with_suffix(".txt.backup")
            import shutil
            shutil.copy2(groups_file, backup)
        
        # Write new groups
        with open(groups_file, "w", encoding="utf-8") as f:
            for group in groups:
                if group.strip():
                    f.write(f"{group.strip()}\n")
        
        return {"success": True, "message": "Groups updated", "count": len(groups)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/add")
async def add_group(group: str, user: dict = AuthDep) -> Dict[str, Any]:
    """Add a group to groups.txt"""
    try:
        groups_file = _get_groups_file()
        
        # Read existing groups
        existing_groups = []
        if groups_file.exists():
            with open(groups_file, "r", encoding="utf-8") as f:
                existing_groups = [line.strip() for line in f if line.strip() and not line.strip().startswith("#")]
        
        # Add new group if not exists
        if group.strip() and group.strip() not in existing_groups:
            existing_groups.append(group.strip())
        
        # Write back
        with open(groups_file, "w", encoding="utf-8") as f:
            for g in existing_groups:
                f.write(f"{g}\n")
        
        return {"success": True, "message": "Group added", "groups": existing_groups}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{group}")
async def remove_group(group: str, user: dict = AuthDep) -> Dict[str, Any]:
    """Remove a group from groups.txt"""
    try:
        groups_file = _get_groups_file()
        
        if not groups_file.exists():
            raise HTTPException(status_code=404, detail="Groups file not found")
        
        # Read existing groups
        with open(groups_file, "r", encoding="utf-8") as f:
            existing_groups = [line.strip() for line in f if line.strip() and not line.strip().startswith("#")]
        
        # Remove group
        if group in existing_groups:
            existing_groups.remove(group)
        
        # Write back
        with open(groups_file, "w", encoding="utf-8") as f:
            for g in existing_groups:
                f.write(f"{g}\n")
        
        return {"success": True, "message": "Group removed", "groups": existing_groups}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/backups")
async def list_group_backups(user: dict = AuthDep) -> Dict[str, Any]:
    """List group backup files"""
    try:
        groups_dir = _get_groups_dir()
        
        if not groups_dir.exists():
            return {"success": True, "backups": [], "count": 0}
        
        backups = []
        for backup_file in sorted(groups_dir.glob("*.txt"), key=lambda p: p.stat().st_mtime, reverse=True):
            stat = backup_file.stat()
            backups.append({
                "filename": backup_file.name,
                "size": stat.st_size,
                "modified": stat.st_mtime
            })
        
        return {"success": True, "backups": backups, "count": len(backups)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

