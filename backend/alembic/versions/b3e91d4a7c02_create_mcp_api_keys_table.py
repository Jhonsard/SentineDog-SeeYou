"""create_mcp_api_keys_table

Registre des clés d'accès du plan MCP (hash SHA-256 + scopes).
Jamais de secret en clair en base.

Revision ID: b3e91d4a7c02
Revises: 7c4d5e6f2a1b
Create Date: 2026-09-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b3e91d4a7c02'
down_revision: Union[str, Sequence[str], None] = '7c4d5e6f2a1b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'mcp_api_keys',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('key_hash', sa.String(length=64), nullable=False),
        sa.Column('fingerprint', sa.String(length=16), nullable=False),
        sa.Column('scopes', sa.String(length=100), nullable=False, server_default='read'),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('note', sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('key_hash'),
    )
    op.create_index(op.f('ix_mcp_api_keys_id'), 'mcp_api_keys', ['id'], unique=False)
    op.create_index(op.f('ix_mcp_api_keys_key_hash'), 'mcp_api_keys', ['key_hash'], unique=True)
    op.create_index(op.f('ix_mcp_api_keys_fingerprint'), 'mcp_api_keys', ['fingerprint'], unique=False)
    op.create_index(op.f('ix_mcp_api_keys_is_active'), 'mcp_api_keys', ['is_active'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_mcp_api_keys_is_active'), table_name='mcp_api_keys')
    op.drop_index(op.f('ix_mcp_api_keys_fingerprint'), table_name='mcp_api_keys')
    op.drop_index(op.f('ix_mcp_api_keys_key_hash'), table_name='mcp_api_keys')
    op.drop_index(op.f('ix_mcp_api_keys_id'), table_name='mcp_api_keys')
    op.drop_table('mcp_api_keys')
