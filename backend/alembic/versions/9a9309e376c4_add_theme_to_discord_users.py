"""add theme to discord_users

Revision ID: 9a9309e376c4
Revises: 1d9e12d0fb56
Create Date: 2026-06-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9a9309e376c4'
down_revision: Union[str, Sequence[str], None] = '1d9e12d0fb56'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('discord_users', sa.Column('theme', sa.String(), nullable=False, server_default=sa.text("'default'")))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('discord_users', 'theme')
