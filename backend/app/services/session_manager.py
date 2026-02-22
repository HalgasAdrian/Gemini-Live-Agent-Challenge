"""
Manages active user sessions. Tracks connections, enforces limits,
and handles cleanup of stale sessions.
"""

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field

from app.config import get_settings
from app.services.gemini_live import LiveSession

logger = logging.getLogger(__name__)

@dataclass
class UserSession:
    """Represents one user's active connection."""
    session_id: str
    live_session: LiveSession | None = None
    created_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    agent_preset_id: str = "general"
    is_connected: bool = True

    # Conversation log (in-memory, also mirrored to Firestore)
    turns: list[dict] = field(default_factory=list)

    def touch(self):
        self.last_activity = time.time()

    def log_turn(self, role: str, content_type: str, content: str = ""):
        self.turns.append({
            "role": role,
            "type": content_type,
            "content": content[:500],  # Truncate for memory
            "timestamp": time.time(),
        })

class SessionManager:
    """Singleton that manages all active sessions."""

    def __init__(self):
        self._sessions: dict[str, UserSession] = {}
        self._cleanup_task: asyncio.Task | None = None

    @property
    def active_count(self) -> int:
        return len(self._sessions)

    def create_session_id(self) -> str:
        return str(uuid.uuid4())

    def register(self, session_id: str, preset_id: str = "general") -> UserSession:
        """Register a new user session."""
        settings = get_settings()
        if len(self._sessions) >= settings.max_sessions:
            raise RuntimeError(f"Max sessions ({settings.max_sessions}) reached")

        user_session = UserSession(
            session_id=session_id,
            agent_preset_id=preset_id,
        )
        self._sessions[session_id] = user_session
        logger.info(f"Session registered: {session_id} (active={self.active_count})")
        return user_session

    def get(self, session_id: str) -> UserSession | None:
        return self._sessions.get(session_id)

    async def remove(self, session_id: str) -> None:
        """Clean up and remove a session."""
        session = self._sessions.pop(session_id, None)
        if session and session.live_session:
            await session.live_session.close()
        logger.info(f"Session removed: {session_id} (active={self.active_count})")

    async def cleanup_stale(self) -> None:
        """Remove sessions that have been inactive past the timeout."""
        settings = get_settings()
        now = time.time()
        stale_ids = [
            sid
            for sid, s in self._sessions.items()
            if now - s.last_activity > settings.session_timeout_seconds
        ]
        for sid in stale_ids:
            logger.warning(f"Cleaning up stale session: {sid}")
            await self.remove(sid)

    async def start_cleanup_loop(self, interval: int = 60) -> None:
        """Background task that periodically cleans up stale sessions."""
        async def _loop():
            while True:
                await asyncio.sleep(interval)
                try:
                    await self.cleanup_stale()
                except Exception as e:
                    logger.error(f"Cleanup error: {e}")

        self._cleanup_task = asyncio.create_task(_loop())

    async def shutdown(self) -> None:
        """Graceful shutdown: close all sessions."""
        if self._cleanup_task:
            self._cleanup_task.cancel()
        for sid in list(self._sessions.keys()):
            await self.remove(sid)
        logger.info("All sessions closed.")

    def get_stats(self) -> dict:
        return {
            "active_sessions": self.active_count,
            "sessions": [
                {
                    "session_id": s.session_id,
                    "agent": s.agent_preset_id,
                    "turns": len(s.turns),
                    "connected": s.is_connected,
                    "age_seconds": int(time.time() - s.created_at),
                }
                for s in self._sessions.values()
            ],
        }

# Global singleton
session_manager = SessionManager()