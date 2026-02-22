"""
Firestore integration for session logging and persistence.
Satisfies the "at least one Google Cloud service" requirement.

Falls back gracefully if Firestore is unavailable (e.g., local dev
without credentials).
"""

import logging
import time

from app.config import get_settings

logger = logging.getLogger(__name__)

_db = None
_firestore_available = False


def init_firestore() -> None:
    """Initialize Firestore client. Call once at startup."""
    global _db, _firestore_available
    settings = get_settings()

    if not settings.enable_firestore:
        logger.info("Firestore disabled by config.")
        return

    try:
        from google.cloud import firestore as fs

        if settings.gcp_project_id:
            _db = fs.AsyncClient(project=settings.gcp_project_id)
        else:
            _db = fs.AsyncClient()  # Uses default credentials
        _firestore_available = True
        logger.info("Firestore initialized successfully.")
    except Exception as e:
        logger.warning(f"Firestore unavailable (running locally?): {e}")
        _firestore_available = False


async def log_session_start(session_id: str, agent_preset: str) -> None:
    """Log the start of a new session."""
    if not _firestore_available:
        return
    try:
        settings = get_settings()
        doc_ref = _db.collection(settings.firestore_collection).document(session_id)
        await doc_ref.set(
            {
                "session_id": session_id,
                "agent_preset": agent_preset,
                "started_at": time.time(),
                "status": "active",
            }
        )
    except Exception as e:
        logger.error(f"Firestore log_session_start error: {e}")


async def log_turn(session_id: str, role: str, content_type: str, content: str = "") -> None:
    """Log a single conversation turn."""
    if not _firestore_available:
        return
    try:
        settings = get_settings()
        turns_ref = (
            _db.collection(settings.firestore_collection)
            .document(session_id)
            .collection("turns")
        )
        await turns_ref.add(
            {
                "role": role,
                "type": content_type,
                "content": content[:1000],  # Truncate large content
                "timestamp": time.time(),
            }
        )
    except Exception as e:
        logger.error(f"Firestore log_turn error: {e}")


async def log_session_end(session_id: str, turn_count: int) -> None:
    """Log the end of a session."""
    if not _firestore_available:
        return
    try:
        settings = get_settings()
        doc_ref = _db.collection(settings.firestore_collection).document(session_id)
        await doc_ref.update(
            {
                "ended_at": time.time(),
                "status": "completed",
                "total_turns": turn_count,
            }
        )
    except Exception as e:
        logger.error(f"Firestore log_session_end error: {e}")