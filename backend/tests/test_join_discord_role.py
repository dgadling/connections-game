"""Join response includes discord_role_id - regression test for frontend drop bug"""
import random
from app.timeutil import utcnow
import hashlib
from datetime import timedelta
from app import models


def test_join_response_includes_discord_role_id(client, db_session, test_user):
    """POST /api/games/join response must include discord_role_id so UI can display it"""
    # Create game with a discord_role_id
    game = models.Game(name="Role Game", owner_discord_id=test_user.discord_id, discord_role_id="123456789012345678")
    db_session.add(game)
    db_session.commit()
    db_session.refresh(game)

    # Create joiner - use a random discord_id to avoid fixture collision in full suite
    joiner_id = str(random.randint(10**17, 10**18 - 1))
    joiner = models.DiscordUser(
        discord_id=joiner_id,
        username="joiner",
        global_name="Joiner",
    )
    db_session.add(joiner)
    db_session.commit()

    # Create invite
    invite_token = "role_test_token"
    token_hash = hashlib.sha256(invite_token.encode()).hexdigest()
    invite = models.GameInvite(
        token_hash=token_hash,
        game_id=game.id,
        created_by=test_user.discord_id,
        created_at=utcnow(),
        expires_at=utcnow() + timedelta(days=1),
    )
    db_session.add(invite)
    db_session.commit()

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
        assert r.status_code == 200
        data = r.json()
        assert "discord_role_id" in data, "join response must include discord_role_id"
        assert data["discord_role_id"] == "123456789012345678"
    finally:
        app.dependency_overrides.clear()
