"""Question delete must be graveyard-only"""
from app import models


def test_delete_upcoming_question_blocked(client, db_session, game):
    q = models.ConnQuestion(game_id=game.id, text="Delete me?", tag="warm", status="upcoming", sort_order=0)
    db_session.add(q)
    db_session.commit()
    db_session.refresh(q)
    r = client.delete(f"/api/games/{game.id}/questions/{q.id}")
    assert r.status_code == 400
    assert "archived" in r.json()["detail"].lower()
    q2 = db_session.query(models.ConnQuestion).filter_by(id=q.id).first()
    assert q2 is not None


def test_delete_graveyard_question_allowed(client, db_session, game):
    q = models.ConnQuestion(game_id=game.id, text="Delete me?", tag="warm", status="graveyard", sort_order=0)
    db_session.add(q)
    db_session.commit()
    db_session.refresh(q)
    r = client.delete(f"/api/games/{game.id}/questions/{q.id}")
    assert r.status_code == 200
    db_session.expire_all()
    q2 = db_session.query(models.ConnQuestion).filter_by(id=q.id).first()
    assert q2 is None
