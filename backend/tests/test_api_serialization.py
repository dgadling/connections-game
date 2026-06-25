from datetime import datetime

def assert_iso_or_none(s):
    if s is None:
        return
    assert isinstance(s, str), f"expected str or None, got {type(s)}: {s}"
    # should parse
    datetime.fromisoformat(s.replace("Z", "+00:00"))

def test_list_games_serialization(client, game):
    r = client.get("/api/games")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    g = data[0]
    assert "archived_at" in g
    assert_iso_or_none(g["archived_at"])

def test_list_members_serialization(client, game, members):
    r = client.get(f"/api/games/{game.id}/members")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 2
    for m in data:
        assert "created_at" in m
        assert "deleted_at" in m
        assert_iso_or_none(m["created_at"])
        assert_iso_or_none(m["deleted_at"])

def test_list_questions_serialization(client, game, questions):
    r = client.get(f"/api/games/{game.id}/questions?status=upcoming")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 2
    for q in data:
        assert_iso_or_none(q["created_at"])
        assert_iso_or_none(q["updated_at"])

def test_question_history_serialization(client, game, questions, db_session, test_user):
    from app import models
    q = questions[0]
    edit = models.ConnQuestionEdit(
        question_id=q.id,
        old_text="old",
        old_tag="warm",
        edited_by=test_user.discord_id,
        edited_at=datetime.utcnow()
    )
    db_session.add(edit)
    db_session.commit()
    r = client.get(f"/api/games/{game.id}/questions/{q.id}/history")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert_iso_or_none(data[0]["edited_at"])

def test_list_invites_serialization(client, game, db_session, test_user):
    from app import models
    from datetime import timedelta
    inv = models.GameInvite(
        token_hash="abc123",
        game_id=game.id,
        created_by=test_user.discord_id,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=1),
    )
    db_session.add(inv)
    db_session.commit()
    r = client.get(f"/api/games/{game.id}/invites")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    i = data[0]
    assert_iso_or_none(i["created_at"])
    assert_iso_or_none(i["expires_at"])

def test_list_admins_serialization(client, game):
    r = client.get(f"/api/games/{game.id}/admins")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    a = data[0]
    assert_iso_or_none(a["joined_at"])

def test_game_history_serialization(client, game, questions, db_session, test_user):
    from app import models
    play = models.ConnPlay(
        game_id=game.id,
        round_num=1,
        question_id=questions[0].id,
        played_by=test_user.discord_id,
    )
    db_session.add(play)
    db_session.commit()
    r = client.get(f"/api/games/{game.id}/history")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert_iso_or_none(data[0]["played_at"])
