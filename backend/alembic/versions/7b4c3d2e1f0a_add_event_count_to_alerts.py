"""add event_count to IntrusionsAlerts

Revision ID: 7b4c3d2e1f0a
Revises: cd7c6e63ceaa
Create Date: 2026-08-15 11:22:41.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7b4c3d2e1f0a'
down_revision: Union[str, Sequence[str], None] = 'cd7c6e63ceaa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('IntrusionsAlerts', sa.Column('event_count', sa.Integer(), nullable=False, server_default='1'))
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('IntrusionsAlerts', 'event_count')
    # ### end Alembic commands ###
