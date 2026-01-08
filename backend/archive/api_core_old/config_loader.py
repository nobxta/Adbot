"""
Config Loader - Reads and writes AdBot config.json
Provides safe read/write operations for AdBot configuration
"""

import json
import os
from pathlib import Path
from typing import Dict, Any, Optional, List
import threading

class ConfigLoader:
    """Manages AdBot config.json file operations"""
    
    def __init__(self):
        self.config_path = self._get_config_path()
        self.lock = threading.Lock()
    
    def _get_config_path(self) -> Path:
        """Get path to AdBot config.json"""
        # From backend/api/core/config_loader.py
        # Go up: core -> api -> backend -> (project root) -> backend -> Adbot -> config.json
        base = Path(__file__).parent.parent.parent.parent  # Project root
        config_path = base / "backend" / "Adbot" / "config.json"
        return config_path.absolute()
    
    def load(self) -> Dict[str, Any]:
        """Load config.json file"""
        with self.lock:
            if not self.config_path.exists():
                raise FileNotFoundError(f"Config file not found at {self.config_path}")
            
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except json.JSONDecodeError as e:
                raise ValueError(f"Invalid JSON in config file: {e}")
    
    def save(self, config: Dict[str, Any]) -> bool:
        """Save config.json file (with backup)"""
        with self.lock:
            # Create backup
            backup_path = self.config_path.with_suffix(".json.backup")
            if self.config_path.exists():
                import shutil
                shutil.copy2(self.config_path, backup_path)
            
            try:
                # Write new config
                with open(self.config_path, "w", encoding="utf-8") as f:
                    json.dump(config, f, indent=2, ensure_ascii=False)
                
                return True
            except Exception as e:
                # Restore backup on error
                if backup_path.exists():
                    import shutil
                    shutil.copy2(backup_path, self.config_path)
                raise e
    
    def update(self, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update config with new values (merge)"""
        config = self.load()
        config.update(updates)
        self.save(config)
        return config
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get a config value"""
        config = self.load()
        return config.get(key, default)
    
    def set(self, key: str, value: Any) -> Dict[str, Any]:
        """Set a config value"""
        config = self.load()
        config[key] = value
        self.save(config)
        return config
    
    # Convenience methods for common config operations
    def get_post_links(self) -> List[str]:
        """Get post links from config"""
        config = self.load()
        return config.get("post_link", [])
    
    def set_post_links(self, links: List[str]) -> Dict[str, Any]:
        """Set post links in config"""
        return self.set("post_link", links)
    
    def add_post_link(self, link: str) -> Dict[str, Any]:
        """Add a post link to config"""
        config = self.load()
        links = config.get("post_link", [])
        if link not in links:
            links.append(link)
        config["post_link"] = links
        self.save(config)
        return config
    
    def remove_post_link(self, link: str) -> Dict[str, Any]:
        """Remove a post link from config"""
        config = self.load()
        links = config.get("post_link", [])
        if link in links:
            links.remove(link)
        config["post_link"] = links
        self.save(config)
        return config
    
    def get_delay_between_posts(self) -> int:
        """Get delay between posts"""
        return self.get("delay_between_posts", 5)
    
    def set_delay_between_posts(self, delay: int) -> Dict[str, Any]:
        """Set delay between posts"""
        return self.set("delay_between_posts", delay)
    
    def get_delay_between_cycles(self) -> int:
        """Get delay between cycles"""
        return self.get("delay_between_cycles", 300)
    
    def set_delay_between_cycles(self, delay: int) -> Dict[str, Any]:
        """Set delay between cycles"""
        return self.set("delay_between_cycles", delay)
    
    def get_accounts(self) -> List[Dict[str, str]]:
        """Get accounts from config"""
        return self.get("accounts", [])
    
    def add_account(self, api_id: str, api_hash: str) -> Dict[str, Any]:
        """Add an account to config"""
        config = self.load()
        accounts = config.get("accounts", [])
        
        # Check if account already exists
        for acc in accounts:
            if acc.get("api_id") == api_id:
                raise ValueError(f"Account with API ID {api_id} already exists")
        
        accounts.append({
            "api_id": api_id,
            "api_hash": api_hash
        })
        config["accounts"] = accounts
        self.save(config)
        return config
    
    def remove_account(self, api_id: str) -> Dict[str, Any]:
        """Remove an account from config"""
        config = self.load()
        accounts = config.get("accounts", [])
        accounts = [acc for acc in accounts if acc.get("api_id") != api_id]
        config["accounts"] = accounts
        self.save(config)
        return config

