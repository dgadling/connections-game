"""add unique index question_game_status_sort

Revision ID: 47fd0e00c59a
Revises: 19cf72399d88
Create Date: 2026-06-25 17:35:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '47fd0e00c59a'
down_revision: Union[str, Sequence[str], None] = '19cf72399d88'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Partial unique index to prevent duplicate sort_order for upcoming questions
    # Allows used/graveyard questions to retain old sort_order values
    op.create_index(
        'uq_question_game_status_sort',
        'conn_questions',
        ['game_id', 'status', 'sort_order'],
        unique=True,
        sqlite_where=sa.text("status='upcoming'"),
        postgresql_where=sa.text("status='upcoming'"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('uq_question_game_status_sort', table_name='conn_questions')
