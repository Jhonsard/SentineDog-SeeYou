from app.mcp.server import mcp, create_mcp_app
import app.mcp.tools  # Charge et enregistre automatiquement les décorateurs @mcp.tool

__all__ = ["mcp", "create_mcp_app"]
