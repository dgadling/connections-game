"""m6: invite join - POST /games/join consumes invite_token, creates admin membership"""
import hashlib
from datetime import datetime, timedelta
from app import models


def test_invite_join_creates_admin_membership(client, game, db_session, test_user):
    """POST /api/games/join with valid invite_token should create admin membership and consume invite"""
    # Create a second user who will join via invite
    joiner = models.DiscordUser(
        discord_id="555555555555555555",
        username="joiner",
        global_name="Joiner User",
    )
    db_session.add(joiner)
    db_session.commit()

    # Create invite
    invite_token = "test_invite_token_abc123xyz"
    token_hash = hashlib.sha256(invite_token.encode()).hexdigest()
    invite = models.GameInvite(
        token_hash=token_hash,
        game_id=game.id,
        created_by=test_user.discord_id,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=1),
    )
    db_session.add(invite)
    db_session.commit()

    # Override client to act as joiner user
    from app.main import app
    from app.db import get_db
    from app.auth import require_user

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    def override_require_user():
        return joiner

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[require_user] = override_require_user

    try:
        r = client.post("/api/games/join", json={"invite_token": invite_token})
        assert r.status_code == 200, f"Join failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["game_id"] == game.id
        # Issue #2: join response must include game name so UI can display title immediately
        assert "name" in data, "join response must include game name"
        assert data["name"] == game.name
    finally:
        app.dependency_overrides.clear()

    # Verify membership created
    db_session.expire_all()
    mem = db_session.query(models.GameMembership).filter(
        models.GameMembership.game_id == game.id,
        models.GameMembership.discord_id == joiner.discord_id
    ).first()
    assert mem is not None, "GameMembership should be created"

    # Verify invite was consumed (deleted)
    inv_db = db_session.query(models.GameInvite).filter(
        models.GameInvite.token_hash == token_hash
    ).first()
    assert inv_db is None, "Invite should be deleted after use"


def test_invite_cannot_be_reused(client, game, db_session, test_user):
    """An invite token is single-use - second join attempt must fail"""
    # Create two joiners
    joiner1 = models.DiscordUser(discord_id="111111111111111111", username="j1", global_name="J1")
    joiner2 = models.DiscordUser(discord_id="222222222222222222", username="j2", global_name="J2")
    db_session.add_all([joiner1, joiner2])
    db_session.commit()

    invite_token = "single_use_token_xyz"
    token_hash = hashlib.sha256(invite_token.encode()).hexdigest()
    invite = models.GameInvite(
        token_hash=token_hash,
        game_id=game.id,
        created_by=test_user.discord_id,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=1),
    )
    db_session.add(invite)
    db_session.commit()

    from app.main import app
    from app.db import get_db
    from app.auth import require_user

    def make_overrides(joiner):
        def override_get_db():
            try:
                yield db_session
            finally:
                pass
        def override_require_user():
            return joiner
        return override_get_db, override_require_user

    # First join - should succeed
    override_get_db, override_require_user = make_overrides(joiner1)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[require_user] = override_require_user
    try:
        r1 = client.post("/api/games/join", json={"invite_token": invite_token})
        assert r1.status_code == 200
    finally:
        app.dependency_overrides.clear()

    # Second join with same token - must fail
    override_get_db, override_require_user = make_overrides(joiner2)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[require_user] = override_require_user
    try:
        r2 = client.post("/api/games/join", json={"invite_token": invite_token})
        assert r2.status_code == 403, f"Reused invite should be rejected, got {r2.status_code}"
    finally:
        app.dependency_overrides.clear()

    # Verify joiner2 did NOT get membership
    db_session.expire_all()
    mem2 = db_session.query(models.GameMembership).filter(
        models.GameMembership.game_id == game.id,
        models.GameMembership.discord_id == joiner2.discord_id
    ).first()
    assert mem2 is None, "Second user should NOT get membership from consumed invite"
