"""add discord_role_id, make member discord_id nullable

Revision ID: 19cf72399d88
Revises: 2028e3c0e1a2
Create Date: 2026-06-25 21:20:31.482243

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '19cf72399d88'
down_revision: Union[str, Sequence[str], None] = '2028e3c0e1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add discord_role_id to games
    op.add_column('games', sa.Column('discord_role_id', sa.String(), nullable=True))
    # Make game_members.discord_id nullable, update unique index to allow multiple NULLs
    op.drop_index('uq_game_member_discord_active', table_name='game_members')
    with op.batch_alter_table('game_members', schema=None) as batch_op:
        batch_op.alter_column('discord_id', existing_type=sa.String(), nullable=True)
    op.create_index('uq_game_member_discord_active', 'game_members', ['game_id', 'discord_id'], unique=True, sqlite_where=sa.text('deleted_at IS NULL AND discord_id IS NOT NULL'))


def downgrade() -> None:
    """Downgrade schema."""
    # Revert unique index
    op.drop_index('uq_game_member_discord_active', table_name='game_members')
    # Make discord_id NOT NULL again – will fail if NULLs exist
    with op.batch_alter_table('game_members', schema=None) as batch_op:
        batch_op.alter_column('discord_id', existing_type=sa.String(), nullable=False)
    op.create_index('uq_game_member_discord_active', 'game_members', ['game_id', 'discord_id'], unique=True, sqlite_where=sa.text('deleted_at IS NULL'))
    # Drop discord_role_id
    op.drop_column('games', 'discord_role_id')
