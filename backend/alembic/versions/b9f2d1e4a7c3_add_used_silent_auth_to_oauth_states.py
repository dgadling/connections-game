"""add used_silent_auth to oauth_states

Revision ID: b9f2d1e4a7c3
Revises: 58aee6475783
Create Date: 2026-06-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b9f2d1e4a7c3'
down_revision: Union[str, Sequence[str], None] = '58aee6475783'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('oauth_states', sa.Column('used_silent_auth', sa.Boolean(), nullable=False, server_default=sa.text('0')))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('oauth_states', 'used_silent_auth')
