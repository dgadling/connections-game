"""require game_member discord_id

Revision ID: 2f24e8b2a145
Revises: 19eec9e832d1
Create Date: 2026-06-25 02:42:11.827319

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2f24e8b2a145'
down_revision: Union[str, Sequence[str], None] = '19eec9e832d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Drop old partial unique index that allowed NULL discord_id
    op.drop_index('uq_game_member_discord_active', table_name='game_members')
    # Make discord_id NOT NULL
    with op.batch_alter_table('game_members', schema=None) as batch_op:
        batch_op.alter_column('discord_id', existing_type=sa.String(), nullable=False)
    # Recreate unique index without discord_id IS NOT NULL clause
    op.create_index('uq_game_member_discord_active', 'game_members', ['game_id', 'discord_id'], unique=True, sqlite_where=sa.text('deleted_at IS NULL'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('uq_game_member_discord_active', table_name='game_members')
    with op.batch_alter_table('game_members', schema=None) as batch_op:
        batch_op.alter_column('discord_id', existing_type=sa.String(), nullable=True)
    op.create_index('uq_game_member_discord_active', 'game_members', ['game_id', 'discord_id'], unique=True, sqlite_where=sa.text('deleted_at IS NULL AND discord_id IS NOT NULL'))
