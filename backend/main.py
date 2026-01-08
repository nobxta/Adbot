"""
FastAPI Main Entry Point
Backend bot execution engine
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import os
import uvicorn
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
# This MUST be done BEFORE importing other modules that use os.getenv()
env_path = Path(__file__).parent / '.env'
if env_path.exists():
    load_dotenv(env_path, override=True)  # override=True ensures .env values take precedence
    print(f"✓ Loaded environment variables from {env_path}")
    
    # Verify JWT_SECRET was loaded
    jwt_secret = os.getenv("JWT_SECRET")
    if jwt_secret and jwt_secret != "your-super-secret-jwt-key-change-in-production":
        print(f"✓ JWT_SECRET loaded successfully (first 10 chars): {jwt_secret[:10]}...")
    else:
        print("⚠️  WARNING: JWT_SECRET not set in .env file or using default value!")
        print("   Add JWT_SECRET=your-secret-here to backend/.env file")
else:
    print(f"⚠️  Warning: .env file not found at {env_path}")
    print("   Create backend/.env file with JWT_SECRET=your-secret-here")
    print("   Using default environment variables (INSECURE)")

from api.bot_control import router as bot_router
from api.sync import router as sync_router
from api.health import router as health_router
from api.admin_sessions import router as admin_sessions_router
from api.admin_api_pairs import router as admin_api_pairs_router
from api.admin_groups import router as admin_groups_router
from bot.scheduler import start_scheduler, stop_scheduler


app = FastAPI(
    title="AdBot Backend API",
    description="Bot execution engine for Telegram AdBot",
    version="1.0.0"
)

# CORS - Only allow requests from frontend URL
# This is the FIRST layer of security (origin restriction)
frontend_urls = os.getenv("FRONTEND_URLS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_urls,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
print(f"✓ CORS configured to allow origins: {frontend_urls}")
print("  Note: CORS only protects browsers. JWT authentication is still required for security.")

# Include routers
app.include_router(bot_router, prefix="/api/bot", tags=["Bot Control"])
app.include_router(sync_router, prefix="/api/sync", tags=["Sync"])
app.include_router(health_router, prefix="/api/health", tags=["Health"])
app.include_router(admin_sessions_router, prefix="/api/admin/sessions", tags=["Admin - Sessions"])
app.include_router(admin_api_pairs_router, prefix="/api/admin/api-pairs", tags=["Admin - API Pairs"])
app.include_router(admin_groups_router, prefix="/api/admin/groups", tags=["Admin - Groups"])


@app.on_event("startup")
async def startup():
    """
    Start scheduler on startup
    CRITICAL: Force all bots to STOPPED state on backend restart
    This ensures no bots resume automatically after restart, preventing:
    - Bots running with stale state
    - Bots running after plan expiration during downtime
    - Race conditions from partial state recovery
    """
    from bot.data_manager import load_users, save_users
    
    # CRITICAL: Reset all bots to stopped state on restart
    # This enforces explicit user action to restart bots after backend restart
    users = load_users()
    bots_reset = 0
    for user_id, user_data in users.items():
        if user_data.get("bot_status") == "running":
            user_data["bot_status"] = "stopped"
            bots_reset += 1
    
    if bots_reset > 0:
        # Save atomically - all bots reset in one operation
        save_users(users)
        print(f"INFO: Backend restart - reset {bots_reset} bot(s) to stopped state")
    
    # Start scheduler with clean slate (no active bots)
    delay_between_cycles = int(os.getenv("DELAY_BETWEEN_CYCLES", "300"))
    asyncio.create_task(start_scheduler(delay_between_cycles))


@app.on_event("shutdown")
async def shutdown():
    """Stop scheduler on shutdown"""
    await stop_scheduler()


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "AdBot Backend API",
        "version": "1.0.0",
        "status": "online"
    }


if __name__ == "__main__":
    port = int(os.getenv("API_PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)

