"""Game archive permission tests

Verifies: game admins (members) can archive/unarchive their game,
superuser can archive/unarchive any game,
non-members CANNOT archive/unarchive.
"""
import os
os.environ["SUPERUSER_DISCORD_ID"] = "999999999999999999"

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db import get_db
from app import models
from app.auth import require_user

SUPERUSER_DISCORD_ID = "999999999999999999"


@pytest.fixture
def super_user(db_session):
    u = models.DiscordUser(
        discord_id=SUPERUSER_DISCORD_ID,
        username="superuser",
        global_name="Super User",
        avatar_hash=None,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture
def admin_a(db_session):
    u = models.DiscordUser(
        discord_id="111111111111111111",
        username="admin_a",
        global_name="Admin A",
        avatar_hash=None,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture
def outsider(db_session):
    u = models.DiscordUser(
        discord_id="333333333333333333",
        username="outsider",
        global_name="Outsider",
        avatar_hash=None,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture
def game_a(db_session, admin_a):
    g = models.Game(name="Game A", owner_discord_id=admin_a.discord_id)
    db_session.add(g)
    db_session.commit()
    db_session.refresh(g)
    mem = models.GameMembership(game_id=g.id, discord_id=admin_a.discord_id)
    db_session.add(mem)
    state = models.ConnState(game_id=g.id, current_round=1)
    db_session.add(state)
    db_session.commit()
    return g


def make_client(db_session, user):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    def override_require_user():
        return user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[require_user] = override_require_user
    client = TestClient(app)
    return client


def test_archive_requires_admin(db_session, admin_a, outsider, game_a):
    client = make_client(db_session, outsider)
    try:
        resp = client.post(f"/api/games/{game_a.id}/archive")
        assert resp.status_code == 403, f"non-member should get 403, got {resp.status_code}: {resp.text}"
    finally:
        app.dependency_overrides.clear()


def test_archive_as_member(db_session, admin_a, game_a):
    client = make_client(db_session, admin_a)
    try:
        resp = client.post(f"/api/games/{game_a.id}/archive")
        assert resp.status_code == 200, resp.text
        # verify archived_at set
        db_session.expire_all()
        g = db_session.query(models.Game).filter(models.Game.id == game_a.id).first()
        assert g.archived_at is not None
    finally:
        app.dependency_overrides.clear()


def test_archive_as_superuser(db_session, super_user, admin_a, game_a):
    client = make_client(db_session, super_user)
    try:
        resp = client.post(f"/api/games/{game_a.id}/archive")
        assert resp.status_code == 200, resp.text
    finally:
        app.dependency_overrides.clear()


def test_unarchive_requires_admin(db_session, admin_a, outsider, game_a):
    # archive first as admin
    from datetime import datetime
    game_a.archived_at = datetime.utcnow()
    db_session.commit()

    client = make_client(db_session, outsider)
    try:
        resp = client.post(f"/api/games/{game_a.id}/unarchive")
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_unarchive_as_member(db_session, admin_a, game_a):
    from datetime import datetime
    game_a.archived_at = datetime.utcnow()
    db_session.commit()

    client = make_client(db_session, admin_a)
    try:
        resp = client.post(f"/api/games/{game_a.id}/unarchive")
        assert resp.status_code == 200, resp.text
        db_session.expire_all()
        g = db_session.query(models.Game).filter(models.Game.id == game_a.id).first()
        assert g.archived_at is None
    finally:
        app.dependency_overrides.clear()


def test_unarchive_as_superuser(db_session, super_user, game_a):
    from datetime import datetime
    game_a.archived_at = datetime.utcnow()
    db_session.commit()

    client = make_client(db_session, super_user)
    try:
        resp = client.post(f"/api/games/{game_a.id}/unarchive")
        assert resp.status_code == 200, resp.text
    finally:
        app.dependency_overrides.clear()


def test_archived_game_blocks_mutations(db_session, admin_a, game_a):
    from datetime import datetime
    game_a.archived_at = datetime.utcnow()
    db_session.commit()

    client = make_client(db_session, admin_a)
    try:
        # round_complete
        resp = client.post(f"/api/games/{game_a.id}/round/complete")
        assert resp.status_code == 403, f"round_complete should 403 on archived, got {resp.status_code}"
        # question_add
        resp = client.post(f"/api/games/{game_a.id}/questions", json={"text": "x"})
        assert resp.status_code == 403
        # member_add
        resp = client.post(f"/api/games/{game_a.id}/members", json={"name": "Test", "discord_id": "test_user"})
        assert resp.status_code == 403
        # rename
        resp = client.patch(f"/api/games/{game_a.id}", json={"name": "new"})
        assert resp.status_code == 403
        # invite create
        resp = client.post(f"/api/games/{game_a.id}/invites")
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_archived_game_allows_reads(db_session, admin_a, game_a):
    from datetime import datetime
    game_a.archived_at = datetime.utcnow()
    db_session.commit()

    client = make_client(db_session, admin_a)
    try:
        for path in [
            f"/api/games/{game_a.id}",
            f"/api/games/{game_a.id}/questions",
            f"/api/games/{game_a.id}/members",
            f"/api/games/{game_a.id}/history",
            f"/api/games/{game_a.id}/pairings",
            f"/api/games/{game_a.id}/round",
        ]:
            resp = client.get(path)
            assert resp.status_code == 200, f"{path} should allow read on archived, got {resp.status_code}"
    finally:
        app.dependency_overrides.clear()


def test_archived_game_allows_unarchive(db_session, admin_a, game_a):
    from datetime import datetime
    game_a.archived_at = datetime.utcnow()
    db_session.commit()

    client = make_client(db_session, admin_a)
    try:
        resp = client.post(f"/api/games/{game_a.id}/unarchive")
        assert resp.status_code == 200, f"unarchive must work on archived game, got {resp.status_code}: {resp.text}"
    finally:
        app.dependency_overrides.clear()


def test_list_games_includes_archived(db_session, admin_a):
    from datetime import datetime
    # create active game
    g_active = models.Game(name="Active", owner_discord_id=admin_a.discord_id)
    db_session.add(g_active)
    db_session.flush()
    db_session.add(models.GameMembership(game_id=g_active.id, discord_id=admin_a.discord_id))
    db_session.add(models.ConnState(game_id=g_active.id, current_round=1))
    # create archived game
    g_arch = models.Game(name="Archived", owner_discord_id=admin_a.discord_id, archived_at=datetime.utcnow())
    db_session.add(g_arch)
    db_session.flush()
    db_session.add(models.GameMembership(game_id=g_arch.id, discord_id=admin_a.discord_id))
    db_session.add(models.ConnState(game_id=g_arch.id, current_round=1))
    db_session.commit()

    client = make_client(db_session, admin_a)
    try:
        resp = client.get("/api/games")
        assert resp.status_code == 200
        games_by_id = {g["id"]: g for g in resp.json()}
        assert g_active.id in games_by_id
        assert g_arch.id in games_by_id, "archived game should appear in list"
        assert games_by_id[g_active.id]["archived_at"] is None
        assert games_by_id[g_arch.id]["archived_at"] is not None
    finally:
        app.dependency_overrides.clear()


def test_delete_archived_game_as_admin(db_session, admin_a, game_a):
    from datetime import datetime
    game_a.archived_at = datetime.utcnow()
    db_session.commit()

    client = make_client(db_session, admin_a)
    try:
        resp = client.delete(f"/api/games/{game_a.id}")
        assert resp.status_code == 200, resp.text
        db_session.expire_all()
        g = db_session.query(models.Game).filter(models.Game.id == game_a.id).first()
        assert g is None, "game should be deleted"
    finally:
        app.dependency_overrides.clear()


def test_delete_unarchived_game_blocked(db_session, admin_a, game_a):
    # game_a is active (not archived)
    client = make_client(db_session, admin_a)
    try:
        resp = client.delete(f"/api/games/{game_a.id}")
        assert resp.status_code == 400, f"delete of unarchived game should 400, got {resp.status_code}"
        assert "archived" in resp.text.lower()
    finally:
        app.dependency_overrides.clear()


def test_delete_as_non_member(db_session, admin_a, outsider, game_a):
    from datetime import datetime
    game_a.archived_at = datetime.utcnow()
    db_session.commit()

    client = make_client(db_session, outsider)
    try:
        resp = client.delete(f"/api/games/{game_a.id}")
        assert resp.status_code == 403, f"non-member should get 403, got {resp.status_code}"
    finally:
        app.dependency_overrides.clear()


def test_delete_archived_cascades(db_session, admin_a, game_a):
    from datetime import datetime
    # seed related rows
    m1 = models.GameMember(game_id=game_a.id, name="Alice", discord_id="alice_test")
    m2 = models.GameMember(game_id=game_a.id, name="Bob", discord_id="bob_test")
    db_session.add_all([m1, m2])
    db_session.flush()
    q = models.ConnQuestion(game_id=game_a.id, text="Q?", tag="warm", tag_auto=True, status="upcoming", sort_order=0)
    db_session.add(q)
    db_session.flush()
    # pairing (RESTRICT FK - this is why we delete pairings first in the endpoint)
    pair = models.ConnPairing(game_id=game_a.id, round_num=1, asker_member_id=m1.id, target_member_id=m2.id)
    db_session.add(pair)
    play = models.ConnPlay(game_id=game_a.id, round_num=1, question_id=q.id, played_by=admin_a.discord_id)
    db_session.add(play)
    # archive game
    game_a.archived_at = datetime.utcnow()
    db_session.commit()

    gid = game_a.id

    client = make_client(db_session, admin_a)
    try:
        resp = client.delete(f"/api/games/{gid}")
        assert resp.status_code == 200, resp.text
    finally:
        app.dependency_overrides.clear()

    db_session.expire_all()
    assert db_session.query(models.Game).filter(models.Game.id == gid).first() is None
    assert db_session.query(models.GameMember).filter(models.GameMember.game_id == gid).count() == 0
    assert db_session.query(models.ConnQuestion).filter(models.ConnQuestion.game_id == gid).count() == 0
    assert db_session.query(models.ConnPlay).filter(models.ConnPlay.game_id == gid).count() == 0
    assert db_session.query(models.ConnPairing).filter(models.ConnPairing.game_id == gid).count() == 0
    # ConnQuestionEdit cascades from question
    assert db_session.query(models.ConnState).filter(models.ConnState.game_id == gid).first() is None
    # GameMembership cascades
    assert db_session.query(models.GameMembership).filter(models.GameMembership.game_id == gid).count() == 0
