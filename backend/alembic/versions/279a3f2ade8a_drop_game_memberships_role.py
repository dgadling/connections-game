"""drop game_memberships.role

Revision ID: 279a3f2ade8a
Revises: c4d2f8a1b9e0
Create Date: 2026-06-24 20:10:02.908177

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '279a3f2ade8a'
down_revision: Union[str, Sequence[str], None] = 'c4d2f8a1b9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('game_memberships', schema=None) as batch_op:
        batch_op.drop_constraint('ck_membership_role', type_='check')
        batch_op.drop_column('role')


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('game_memberships', schema=None) as batch_op:
        batch_op.add_column(sa.Column('role', sa.VARCHAR(), nullable=False, server_default='admin'))
