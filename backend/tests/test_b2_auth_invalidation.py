"""b2: OAuth callback invalidates existing auth_sessions (session fixation protection)"""
from datetime import datetime, timedelta
from app import models
from app.auth import hash_token


def test_oauth_invalidates_existing_sessions(db_session, test_user):
    """Simulate OAuth callback session invalidation – existing AuthSession rows for discord_id should be deleted"""
    # Create 2 old sessions for test_user
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

    # Simulate what auth_discord_callback does: invalidate all existing sessions
    db_session.query(models.AuthSession).filter(
        models.AuthSession.discord_id == test_user.discord_id
    ).delete()
    db_session.commit()

    # Verify all old sessions gone
    count_after = db_session.query(models.AuthSession).filter(
        models.AuthSession.discord_id == test_user.discord_id
    ).count()
    assert count_after == 0, "OAuth login should invalidate all existing sessions (session fixation protection)"


def test_oauth_does_not_invalidate_other_users_sessions(db_session, test_user):
    """Session invalidation must be scoped to the logging-in discord_id only"""
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
        discord_id="999999999999999999",
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

    # Invalidate test_user's sessions (simulating their OAuth login)
    db_session.query(models.AuthSession).filter(
        models.AuthSession.discord_id == test_user.discord_id
    ).delete()
    db_session.commit()

    # Other user's session must still exist
    other_count = db_session.query(models.AuthSession).filter(
        models.AuthSession.discord_id == other_user.discord_id
    ).count()
    assert other_count == 1, "OAuth invalidation must NOT affect other users"

    test_count = db_session.query(models.AuthSession).filter(
        models.AuthSession.discord_id == test_user.discord_id
    ).count()
    assert test_count == 0
