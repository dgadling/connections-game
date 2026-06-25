"""force global logout for CSRF HMAC migration

Revision ID: 2028e3c0e1a2
Revises: 2f24e8b2a145
Create Date: 2026-06-25 08:05:32.139921

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '2028e3c0e1a2'
down_revision: Union[str, Sequence[str], None] = '2f24e8b2a145'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Force global logout - invalidate all sessions for CSRF HMAC migration.

    CSRF token generation changed from random to HMAC(session_token) in
    c1c61c2. Existing sessions have old random CSRF tokens that will fail
    validation. Wipe all AuthSession rows - users re-login once, get correct
    HMAC-bound CSRF tokens.
    """
    op.execute("DELETE FROM auth_sessions")


def downgrade() -> None:
    """Downgrade schema."""
    # Cannot restore deleted sessions - no-op
    pass
