"""create jwt_keys table

Revision ID: 7c4d5e6f2a1b
Revises: 7b4c3d2e1f0a
Create Date: 2026-08-29T04:42:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c4d5e6f2a1b'
down_revision: Union[str, Sequence[str], None] = '7b4c3d2e1f0a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('jwt_keys',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('key_value', sa.String(length=64), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.false()),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('rotation_note', sa.String(length=255), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_jwt_keys_id'), 'jwt_keys', ['id'], unique=False)
    op.create_index(op.f('ix_jwt_keys_is_active'), 'jwt_keys', ['is_active'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_jwt_keys_is_active'), table_name='jwt_keys')
    op.drop_index(op.f('ix_jwt_keys_id'), table_name='jwt_keys')
    op.drop_table('jwt_keys')
