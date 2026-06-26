"""fix_conn_pairing_fk_cascade

Revision ID: 1d9e12d0fb56
Revises: 51b4f735d9de
Create Date: 2026-06-26 23:39:48.165833

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '1d9e12d0fb56'
down_revision: Union[str, Sequence[str], None] = '51b4f735d9de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ConnPairing.asker_member_id / target_member_id: RESTRICT -> CASCADE
    # Required so GameMember deletion cascades to pairings, and Game deletion
    # cascades cleanly without manual pairing deletion in delete_game().
    # SQLite FKs are unnamed, so use naming_convention to assign predictable names
    # during batch_alter so drop_constraint can target them.
    naming_convention = {
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    }
    with op.batch_alter_table('conn_pairings', schema=None, naming_convention=naming_convention) as batch_op:
        batch_op.drop_constraint('fk_conn_pairings_asker_member_id_game_members', type_='foreignkey')
        batch_op.drop_constraint('fk_conn_pairings_target_member_id_game_members', type_='foreignkey')
        batch_op.create_foreign_key(
            'fk_conn_pairings_asker_member_id_game_members',
            'game_members', ['asker_member_id'], ['id'], ondelete='CASCADE'
        )
        batch_op.create_foreign_key(
            'fk_conn_pairings_target_member_id_game_members',
            'game_members', ['target_member_id'], ['id'], ondelete='CASCADE'
        )


def downgrade() -> None:
    """Downgrade schema."""
    naming_convention = {
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    }
    with op.batch_alter_table('conn_pairings', schema=None, naming_convention=naming_convention) as batch_op:
        batch_op.drop_constraint('fk_conn_pairings_asker_member_id_game_members', type_='foreignkey')
        batch_op.drop_constraint('fk_conn_pairings_target_member_id_game_members', type_='foreignkey')
        batch_op.create_foreign_key(
            'fk_conn_pairings_asker_member_id_game_members',
            'game_members', ['asker_member_id'], ['id'], ondelete='RESTRICT'
        )
        batch_op.create_foreign_key(
            'fk_conn_pairings_target_member_id_game_members',
            'game_members', ['target_member_id'], ['id'], ondelete='RESTRICT'
        )
