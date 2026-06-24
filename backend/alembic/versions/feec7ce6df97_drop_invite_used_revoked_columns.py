"""drop invite used/revoked columns

Revision ID: feec7ce6df97
Revises: 279a3f2ade8a
Create Date: 2026-06-24 20:29:00.651278

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'feec7ce6df97'
down_revision: Union[str, Sequence[str], None] = '279a3f2ade8a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('game_invites', schema=None) as batch_op:
        batch_op.drop_column('used_by')
        batch_op.drop_column('used_at')
        batch_op.drop_column('revoked_at')


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('game_invites', schema=None) as batch_op:
        batch_op.add_column(sa.Column('revoked_at', sa.TIMESTAMP(), nullable=True))
        batch_op.add_column(sa.Column('used_at', sa.TIMESTAMP(), nullable=True))
        batch_op.add_column(sa.Column('used_by', sa.String(), nullable=True))
