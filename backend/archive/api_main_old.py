"""
FastAPI Application - API Wrapper for AdBot
This layer provides HTTP API endpoints that control the existing AdBot without modifying it.
"""

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import uvicorn
import os
from typing import Optional

from backend.api.routes import bot, config, logs, stats, groups, sessions, sessions_admin
from backend.api.core.process_manager import ProcessManager
from backend.api.core.auth import verify_api_key, get_current_user
from backend.api.core.config_loader import ConfigLoader

# Initialize process manager
process_manager = ProcessManager()
config_loader = ConfigLoader()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for FastAPI app"""
    # Startup
    print("🚀 FastAPI AdBot API starting...")
    print("📁 AdBot location: backend/Adbot/")
    
    # Verify AdBot exists
    adbot_path = os.path.join(os.path.dirname(__file__), "..", "Adbot", "main.py")
    if not os.path.exists(adbot_path):
        print(f"⚠️  WARNING: AdBot not found at {adbot_path}")
    else:
        print(f"✅ AdBot found at {adbot_path}")
    
    yield
    
    # Shutdown
    print("🛑 FastAPI AdBot API shutting down...")
    # Stop bot if running
    if process_manager.is_running():
        process_manager.stop()

# Create FastAPI app
app = FastAPI(
    title="AdBot API",
    description="HTTP API wrapper for Telegram AdBot control",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware (configure for your frontend domain)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Next.js dev
        "https://your-frontend-domain.vercel.app",  # Production
        os.getenv("FRONTEND_URL", "http://localhost:3000"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(bot.router, prefix="/api/bot", tags=["Bot Control"])
app.include_router(config.router, prefix="/api/config", tags=["Configuration"])
app.include_router(logs.router, prefix="/api/logs", tags=["Logs"])
app.include_router(stats.router, prefix="/api/stats", tags=["Statistics"])
app.include_router(groups.router, prefix="/api/groups", tags=["Groups"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["Sessions"])
app.include_router(sessions_admin.router, prefix="/api/admin/sessions", tags=["Admin - Sessions"])

@app.get("/")
async def root():
    """Root endpoint - API health check"""
    return {
        "status": "online",
        "service": "AdBot API",
        "version": "1.0.0",
        "bot_status": process_manager.get_status()
    }

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "bot_running": process_manager.is_running(),
        "bot_pid": process_manager.get_pid()
    }

if __name__ == "__main__":
    # Run with: python -m backend.api.main
    uvicorn.run(
        "backend.api.main:app",
        host="0.0.0.0",
        port=int(os.getenv("API_PORT", "8000")),
        reload=os.getenv("ENV", "development") == "development"
    )

