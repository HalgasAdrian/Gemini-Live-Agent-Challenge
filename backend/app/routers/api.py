"""
REST API endpoints for health checks, session info, and agent management.
"""

from fastapi import APIRouter

from app.agents.presets import list_agent_presets
from app.services.session_manager import session_manager

router = APIRouter(prefix="/api")


@router.get("/health")
async def health_check():
    """Health check for Cloud Run liveness probes."""
    return {
        "status": "healthy",
        "active_sessions": session_manager.active_count,
    }


@router.get("/agents")
async def list_agents():
    """List available agent presets (for frontend dropdown)."""
    return {"agents": list_agent_presets()}


@router.get("/sessions")
async def get_sessions():
    """Get stats about active sessions (for monitoring)."""
    return session_manager.get_stats()


@router.post("/sessions/{session_id}/end")
async def end_session(session_id: str):
    """Manually end a session via REST (e.g., from a 'Hang up' button)."""
    session = session_manager.get(session_id)
    if not session:
        return {"error": "Session not found"}, 404
    await session_manager.remove(session_id)
    return {"status": "ended", "session_id": session_id}