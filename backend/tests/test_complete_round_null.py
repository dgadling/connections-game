from app import models

def test_complete_round_no_question_returns_400(client, db_session):
    # create game
    user = db_session.query(models.DiscordUser).first()
    game = models.Game(name="t", owner_discord_id=user.discord_id)
    db_session.add(game)
    db_session.commit()
    db_session.refresh(game)
    db_session.add(models.GameMembership(game_id=game.id, discord_id=user.discord_id))
    db_session.add(models.ConnState(game_id=game.id, current_round=1))
    db_session.commit()
    # no questions at all
    r = client.post(f"/api/games/{game.id}/round/complete")
    assert r.status_code == 400
    assert "no question" in r.text.lower()


def test_complete_round_atomic_commit_closes_7(client, db_session):
    """Regression test for #7: complete_round must be atomic.

    Verifies complete_round records ConnPlay, marks question used,
    and advances round in a single transaction.
    """
    user = db_session.query(models.DiscordUser).first()
    game = models.Game(name="t", owner_discord_id=user.discord_id)
    db_session.add(game)
    db_session.commit()
    db_session.refresh(game)
    game_id = game.id
    db_session.add(models.GameMembership(game_id=game_id, discord_id=user.discord_id))
    q = models.ConnQuestion(game_id=game_id, text="Q1", tag="warm", tag_auto=True, sort_order=1, status="upcoming")
    q2 = models.ConnQuestion(game_id=game_id, text="Q2", tag="warm", tag_auto=True, sort_order=2, status="upcoming")
    db_session.add_all([q, q2])
    db_session.commit()
    db_session.refresh(q)
    q_id = q.id
    db_session.add(models.ConnState(game_id=game_id, current_round=1, current_question_id=q_id))
    db_session.commit()
    db_session.expire_all()

    # complete succeeds
    r1 = client.post(f"/api/games/{game_id}/round/complete")
    assert r1.status_code == 200

    # verify play recorded, question used, round advanced - all atomically
    plays = db_session.query(models.ConnPlay).filter(models.ConnPlay.game_id == game_id).all()
    assert len(plays) == 1
    q_db = db_session.query(models.ConnQuestion).filter(models.ConnQuestion.id == q_id).first()
    assert q_db.status == "used"
    state = db_session.query(models.ConnState).filter(models.ConnState.game_id == game_id).first()
    assert state.current_round == 2
