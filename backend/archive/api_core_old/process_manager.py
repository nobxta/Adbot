"""
Process Manager - Controls AdBot process lifecycle
Handles starting, stopping, and monitoring the AdBot process
"""

import subprocess
import os
import signal
import psutil
import time
from pathlib import Path
from typing import Optional, Dict, Any
import json

class ProcessManager:
    """Manages AdBot process lifecycle"""
    
    def __init__(self):
        self.process: Optional[subprocess.Popen] = None
        # Use absolute path from project root
        base = Path(__file__).parent.parent.parent.parent  # Go to project root
        self.pid_file = base / "backend" / "api" / ".adbot.pid"
        self.status_file = base / "backend" / "api" / ".adbot.status.json"
        self._ensure_dirs()
    
    def _ensure_dirs(self):
        """Ensure necessary directories exist"""
        self.pid_file.parent.mkdir(parents=True, exist_ok=True)
        self.status_file.parent.mkdir(parents=True, exist_ok=True)
    
    def _get_adbot_path(self) -> Path:
        """Get path to AdBot main.py"""
        # From backend/api/core/process_manager.py
        # Go up: core -> api -> backend -> (project root) -> backend -> Adbot -> main.py
        base = Path(__file__).parent.parent.parent.parent  # Project root
        adbot_path = base / "backend" / "Adbot" / "main.py"
        return adbot_path.absolute()
    
    def start(self) -> Dict[str, Any]:
        """Start AdBot process"""
        if self.is_running():
            return {
                "success": False,
                "message": "AdBot is already running",
                "pid": self.get_pid()
            }
        
        try:
            adbot_path = self._get_adbot_path()
            
            if not adbot_path.exists():
                raise FileNotFoundError(f"AdBot not found at {adbot_path}")
            
            # Start AdBot in background
            # Use python -u for unbuffered output
            self.process = subprocess.Popen(
                ["python", "-u", str(adbot_path)],
                cwd=str(adbot_path.parent),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                start_new_session=True  # Detach from parent process
            )
            
            # Save PID
            self._save_pid(self.process.pid)
            self._update_status("running", self.process.pid)
            
            # Wait a moment to check if process started successfully
            time.sleep(1)
            
            if self.process.poll() is not None:
                # Process died immediately
                stderr = self.process.stderr.read().decode() if self.process.stderr else "Unknown error"
                return {
                    "success": False,
                    "message": f"AdBot process exited immediately: {stderr}",
                    "pid": None
                }
            
            return {
                "success": True,
                "message": "AdBot started successfully",
                "pid": self.process.pid
            }
            
        except Exception as e:
            return {
                "success": False,
                "message": f"Failed to start AdBot: {str(e)}",
                "pid": None
            }
    
    def stop(self) -> Dict[str, Any]:
        """Stop AdBot process gracefully"""
        if not self.is_running():
            return {
                "success": False,
                "message": "AdBot is not running",
                "pid": None
            }
        
        try:
            pid = self.get_pid()
            
            if pid:
                # Try graceful shutdown first
                try:
                    process = psutil.Process(pid)
                    process.terminate()  # SIGTERM
                    
                    # Wait up to 10 seconds for graceful shutdown
                    try:
                        process.wait(timeout=10)
                    except psutil.TimeoutExpired:
                        # Force kill if graceful shutdown failed
                        process.kill()
                        process.wait()
                    
                    self._update_status("stopped", None)
                    self._clear_pid()
                    
                    return {
                        "success": True,
                        "message": "AdBot stopped successfully",
                        "pid": None
                    }
                except psutil.NoSuchProcess:
                    # Process already dead
                    self._update_status("stopped", None)
                    self._clear_pid()
                    return {
                        "success": True,
                        "message": "AdBot was already stopped",
                        "pid": None
                    }
            else:
                # Try to stop via subprocess if we have it
                if self.process:
                    self.process.terminate()
                    try:
                        self.process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        self.process.kill()
                    
                    self.process = None
                    self._update_status("stopped", None)
                    self._clear_pid()
                    
                    return {
                        "success": True,
                        "message": "AdBot stopped successfully",
                        "pid": None
                    }
            
            return {
                "success": False,
                "message": "Could not find AdBot process",
                "pid": None
            }
            
        except Exception as e:
            return {
                "success": False,
                "message": f"Failed to stop AdBot: {str(e)}",
                "pid": self.get_pid()
            }
    
    def restart(self) -> Dict[str, Any]:
        """Restart AdBot process"""
        stop_result = self.stop()
        if not stop_result["success"] and self.is_running():
            return {
                "success": False,
                "message": "Failed to stop AdBot before restart",
                "pid": self.get_pid()
            }
        
        # Wait a moment before restarting
        time.sleep(2)
        
        return self.start()
    
    def is_running(self) -> bool:
        """Check if AdBot process is running"""
        pid = self.get_pid()
        if not pid:
            return False
        
        try:
            process = psutil.Process(pid)
            return process.is_running()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            self._clear_pid()
            return False
    
    def get_pid(self) -> Optional[int]:
        """Get AdBot process PID"""
        if self.process and self.process.poll() is None:
            return self.process.pid
        
        if self.pid_file.exists():
            try:
                with open(self.pid_file, "r") as f:
                    pid = int(f.read().strip())
                    # Verify process still exists
                    if psutil.pid_exists(pid):
                        return pid
                    else:
                        self._clear_pid()
            except (ValueError, FileNotFoundError):
                pass
        
        return None
    
    def get_status(self) -> Dict[str, Any]:
        """Get detailed status of AdBot"""
        pid = self.get_pid()
        is_running = self.is_running()
        
        status = {
            "running": is_running,
            "pid": pid,
            "status": "running" if is_running else "stopped"
        }
        
        if is_running and pid:
            try:
                process = psutil.Process(pid)
                status.update({
                    "cpu_percent": process.cpu_percent(interval=0.1),
                    "memory_mb": process.memory_info().rss / 1024 / 1024,
                    "create_time": process.create_time(),
                    "uptime_seconds": time.time() - process.create_time()
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        
        # Load additional status from file if available
        if self.status_file.exists():
            try:
                with open(self.status_file, "r") as f:
                    file_status = json.load(f)
                    status.update(file_status)
            except (json.JSONDecodeError, FileNotFoundError):
                pass
        
        return status
    
    def _save_pid(self, pid: int):
        """Save PID to file"""
        with open(self.pid_file, "w") as f:
            f.write(str(pid))
    
    def _clear_pid(self):
        """Clear PID file"""
        if self.pid_file.exists():
            self.pid_file.unlink()
    
    def _update_status(self, status: str, pid: Optional[int]):
        """Update status file"""
        status_data = {
            "status": status,
            "pid": pid,
            "updated_at": time.time()
        }
        with open(self.status_file, "w") as f:
            json.dump(status_data, f)

