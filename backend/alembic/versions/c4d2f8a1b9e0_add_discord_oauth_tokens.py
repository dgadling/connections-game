"""add discord_oauth_tokens

Revision ID: c4d2f8a1b9e0
Revises: b9f2d1e4a7c3
Create Date: 2026-06-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4d2f8a1b9e0'
down_revision: Union[str, Sequence[str], None] = 'b9f2d1e4a7c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('discord_oauth_tokens',
        sa.Column('discord_id', sa.String(), nullable=False),
        sa.Column('access_token_encrypted', sa.Text(), nullable=False),
        sa.Column('refresh_token_encrypted', sa.Text(), nullable=False),
        sa.Column('expires_at', sa.TIMESTAMP(), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(), nullable=False),
        sa.ForeignKeyConstraint(['discord_id'], ['discord_users.discord_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('discord_id')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('discord_oauth_tokens')
