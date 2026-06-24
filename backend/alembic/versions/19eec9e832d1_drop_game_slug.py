"""drop game slug

Revision ID: 19eec9e832d1
Revises: feec7ce6df97
Create Date: 2026-06-24 22:01:27.540596

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '19eec9e832d1'
down_revision: Union[str, Sequence[str], None] = 'feec7ce6df97'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('games', schema=None) as batch_op:
        batch_op.drop_column('slug')


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('games', schema=None) as batch_op:
        batch_op.add_column(sa.Column('slug', sa.VARCHAR(), nullable=True))
        batch_op.create_unique_constraint('uq_games_slug', ['slug'])
