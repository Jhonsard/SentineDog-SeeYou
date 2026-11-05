"""add full_name to users

Revision ID: 9e1d2c3b4a5f
Revises: b3e91d4a7c02
Create Date: 2026-11-05 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9e1d2c3b4a5f'
down_revision: Union[str, Sequence[str], None] = 'b3e91d4a7c02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _users_columns() -> set[str]:
    """Retourne les colonnes existantes de la table users."""
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns("users")}


def upgrade() -> None:
    """Upgrade schema (idempotent : certaines bases ont déjà la colonne)."""
    if "full_name" not in _users_columns():
        op.add_column('users', sa.Column('full_name', sa.String(length=100), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    if "full_name" in _users_columns():
        op.drop_column('users', 'full_name')
