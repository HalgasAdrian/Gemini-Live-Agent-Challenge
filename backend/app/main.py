"""
FastAPI application entry point.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import ws, api
from app.services.session_manager import session_manager
from app.services.firestore import init_firestore

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    settings = get_settings()
    logger.info(f"Starting Live Agent backend (debug={settings.debug})")

    # Initialize Firestore
    init_firestore()

    # Start session cleanup background task
    await session_manager.start_cleanup_loop(interval=60)

    yield

    # Shutdown
    logger.info("Shutting down...")
    await session_manager.shutdown()


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Gemini Live Agent",
        version="1.0.0",
        lifespan=lifespan,
    )

    # CORS — allow frontend origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routers
    app.include_router(ws.router)
    app.include_router(api.router)

    return app


app = create_app()