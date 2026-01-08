"""
Backend Verification Script
Checks if backend is ready to run
"""

import sys
import os
from pathlib import Path
import json

def check_file_exists(path: str, description: str) -> bool:
    """Check if a file exists"""
    if Path(path).exists():
        print(f"[OK] {description}: {path}")
        return True
    else:
        print(f"[FAIL] {description} MISSING: {path}")
        return False

def check_json_valid(path: str, description: str) -> bool:
    """Check if JSON file is valid"""
    try:
        with open(path, 'r') as f:
            json.load(f)
        print(f"[OK] {description} is valid JSON: {path}")
        return True
    except FileNotFoundError:
        print(f"[FAIL] {description} NOT FOUND: {path}")
        return False
    except json.JSONDecodeError as e:
        print(f"[FAIL] {description} INVALID JSON: {path} - {e}")
        return False

def check_directory_exists(path: str, description: str) -> bool:
    """Check if directory exists"""
    if Path(path).is_dir():
        print(f"[OK] {description}: {path}")
        return True
    else:
        print(f"[FAIL] {description} MISSING: {path}")
        return False

def check_import(module: str) -> bool:
    """Check if module can be imported"""
    try:
        __import__(module)
        print(f"[OK] Module imports successfully: {module}")
        return True
    except ImportError as e:
        print(f"[FAIL] Module import FAILED: {module} - {e}")
        return False

def main():
    print("=" * 60)
    print("BACKEND VERIFICATION")
    print("=" * 60)
    print()
    
    checks_passed = 0
    checks_total = 0
    
    # Check entry point
    print("[*] Checking Entry Point...")
    checks_total += 1
    if check_file_exists("main.py", "Entry point"):
        checks_passed += 1
    print()
    
    # Check API files
    print("[*] Checking API Layer...")
    api_files = [
        ("api/bot_control.py", "Bot control API"),
        ("api/health.py", "Health API"),
        ("api/sync.py", "Sync API"),
    ]
    for file, desc in api_files:
        checks_total += 1
        if check_file_exists(file, desc):
            checks_passed += 1
    print()
    
    # Check bot engine files
    print("[*] Checking Bot Engine...")
    bot_files = [
        ("bot/scheduler.py", "Scheduler"),
        ("bot/worker.py", "Worker"),
        ("bot/engine.py", "Engine"),
        ("bot/data_manager.py", "Data manager"),
        ("bot/session_manager.py", "Session manager"),
    ]
    for file, desc in bot_files:
        checks_total += 1
        if check_file_exists(file, desc):
            checks_passed += 1
    print()
    
    # Check data files
    print("[*] Checking Data Files...")
    checks_total += 2
    if check_json_valid("data/users.json", "Users data"):
        checks_passed += 1
    if check_json_valid("data/stats.json", "Stats data"):
        checks_passed += 1
    print()
    
    # Check directories
    print("[*] Checking Directories...")
    dirs = [
        ("sessions/assigned", "Assigned sessions"),
        ("sessions/unused", "Unused sessions"),
        ("sessions/banned", "Banned sessions"),
        ("data", "Data directory"),
        ("api", "API directory"),
        ("bot", "Bot directory"),
    ]
    for dir_path, desc in dirs:
        checks_total += 1
        if check_directory_exists(dir_path, desc):
            checks_passed += 1
    print()
    
    # Check dependencies
    print("[*] Checking Dependencies...")
    deps = ["fastapi", "uvicorn", "telethon", "jwt"]
    for dep in deps:
        checks_total += 1
        if check_import(dep):
            checks_passed += 1
    print()
    
    # Check requirements file
    print("[*] Checking Requirements...")
    checks_total += 1
    if check_file_exists("requirements.txt", "Requirements file"):
        checks_passed += 1
    print()
    
    # Summary
    print("=" * 60)
    print(f"VERIFICATION COMPLETE: {checks_passed}/{checks_total} checks passed")
    print("=" * 60)
    
    if checks_passed == checks_total:
        print("[OK] Backend is READY TO RUN!")
        print()
        print("To start backend:")
        print("  python main.py")
        print()
        print("To test health:")
        print("  curl http://localhost:8000/api/health")
        return 0
    else:
        print(f"[ERROR] {checks_total - checks_passed} checks FAILED")
        print("Please fix the issues above before running backend.")
        return 1

if __name__ == "__main__":
    os.chdir(Path(__file__).parent)
    sys.exit(main())

