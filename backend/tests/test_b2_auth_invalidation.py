"""b2: OAuth callback preserves existing auth_sessions (multi-device support)"""
from datetime import datetime, timedelta
from app import models
from app.auth import hash_token


def test_oauth_preserves_existing_sessions(db_session, test_user):
    """OAuth login / token refresh must NOT invalidate existing AuthSession rows - multi-device support"""
    # Create 2 old sessions for test_user (simulating phone + desktop already logged in)
    old_tokens = ["old_token_1", "old_token_2"]
    for t in old_tokens:
        sess = models.AuthSession(
            session_token_hash=hash_token(t),
            discord_id=test_user.discord_id,
            created_at=datetime.utcnow() - timedelta(days=1),
            expires_at=datetime.utcnow() + timedelta(days=10),
            absolute_expires_at=datetime.utcnow() + timedelta(days=80),
            last_used_at=datetime.utcnow(),
        )
        db_session.add(sess)
    db_session.commit()

    # Verify sessions exist
    count_before = db_session.query(models.AuthSession).filter(
        models.AuthSession.discord_id == test_user.discord_id
    ).count()
    assert count_before == 2

    # Simulate OAuth login / token refresh creating a NEW session
    # (old code would delete all existing sessions here - BUG)
    # New behavior: old sessions must persist for multi-device support
    new_sess = models.AuthSession(
        session_token_hash=hash_token("new_token"),
        discord_id=test_user.discord_id,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=30),
        absolute_expires_at=datetime.utcnow() + timedelta(days=90),
        last_used_at=datetime.utcnow(),
    )
    db_session.add(new_sess)
    db_session.commit()

    # Verify ALL sessions still exist (old + new)
    count_after = db_session.query(models.AuthSession).filter(
        models.AuthSession.discord_id == test_user.discord_id
    ).count()
    assert count_after == 3, "OAuth login must preserve existing sessions for multi-device support"

    # Verify old session tokens still resolve
    for t in old_tokens:
        sess = db_session.query(models.AuthSession).filter(
            models.AuthSession.session_token_hash == hash_token(t)
        ).first()
        assert sess is not None, f"old session {t} must still be valid after new login"


def test_sessions_are_scoped_per_user(db_session, test_user):
    """Sessions are isolated per discord_id - one user's login never affects another's sessions"""
    # Create session for test_user
    sess1 = models.AuthSession(
        session_token_hash=hash_token("user1_token"),
        discord_id=test_user.discord_id,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=10),
        absolute_expires_at=datetime.utcnow() + timedelta(days=80),
        last_used_at=datetime.utcnow(),
    )
    db_session.add(sess1)

    # Create session for another user
    other_user = models.DiscordUser(
        discord_id="888888888888888888",
        username="other",
        global_name="Other",
    )
    db_session.add(other_user)
    db_session.commit()

    sess2 = models.AuthSession(
        session_token_hash=hash_token("other_token"),
        discord_id=other_user.discord_id,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=10),
        absolute_expires_at=datetime.utcnow() + timedelta(days=80),
        last_used_at=datetime.utcnow(),
    )
    db_session.add(sess2)
    db_session.commit()

    # Simulate test_user logging in again (new session)
    new_sess = models.AuthSession(
        session_token_hash=hash_token("user1_token_2"),
        discord_id=test_user.discord_id,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=30),
        absolute_expires_at=datetime.utcnow() + timedelta(days=90),
        last_used_at=datetime.utcnow(),
    )
    db_session.add(new_sess)
    db_session.commit()

    # Other user's session must still exist
    other_count = db_session.query(models.AuthSession).filter(
        models.AuthSession.discord_id == other_user.discord_id
    ).count()
    assert other_count == 1, "one user's login must NOT affect other users' sessions"

    # Test user's old + new sessions must both exist
    test_count = db_session.query(models.AuthSession).filter(
        models.AuthSession.discord_id == test_user.discord_id
    ).count()
    assert test_count == 2, "user's own old sessions must persist across new logins"

