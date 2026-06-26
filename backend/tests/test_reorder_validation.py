"""test reorder validation - issue #4"""
from app import models

def test_reorder_duplicate_ids_returns_400(client, game, questions):
    q1 = questions[0]
    # duplicate q1, missing q2
    r = client.post(
        f"/api/games/{game.id}/questions/reorder",
        json={"question_ids": [q1.id, q1.id]}
    )
    assert r.status_code == 400, f"expected 400 for duplicate IDs, got {r.status_code}: {r.text}"

def test_reorder_missing_ids_returns_400(client, game, db_session):
    # create 3 questions
    qs = []
    for i, text in enumerate(["A", "B", "C"]):
        q = models.ConnQuestion(game_id=game.id, text=text, tag="warm", tag_auto=True, status="upcoming", sort_order=i)
        db_session.add(q)
        qs.append(q)
    db_session.commit()
    for q in qs:
        db_session.refresh(q)
    # only submit 2 of 3, missing one
    r = client.post(
        f"/api/games/{game.id}/questions/reorder",
        json={"question_ids": [qs[1].id, qs[0].id]}  # missing qs[2]
    )
    # Should be 400, or at least must NOT produce duplicate sort_order values
    # We accept 400 as correct fix; if 200, check for duplicate sort_order bug
    if r.status_code == 200:
        db_session.expire_all()
        ordered = db_session.query(models.ConnQuestion).filter(
            models.ConnQuestion.game_id == game.id,
            models.ConnQuestion.status == "upcoming"
        ).order_by(models.ConnQuestion.sort_order).all()
        sort_orders = [q.sort_order for q in ordered]
        # check no duplicates
        assert len(sort_orders) == len(set(sort_orders)), f"duplicate sort_order found: {sort_orders} - missing IDs bug"
        # also check that missing question still has old sort_order, causing duplicate
        # if we get here without duplicate, test still fails because we wanted 400
        raise AssertionError(f"missing IDs should return 400, got 200 with sort_orders {sort_orders}")
    else:
        assert r.status_code == 400

def test_reorder_cross_game_id_returns_400(client, game, questions, db_session, test_user):
    q1 = questions[0]
    # create second game with a question
    g2 = models.Game(name="Other", owner_discord_id=test_user.discord_id)
    db_session.add(g2)
    db_session.commit()
    db_session.refresh(g2)
    mem = models.GameMembership(game_id=g2.id, discord_id=test_user.discord_id)
    db_session.add(mem)
    q_other = models.ConnQuestion(game_id=g2.id, text="X", tag="warm", tag_auto=True, status="upcoming", sort_order=0)
    db_session.add(q_other)
    db_session.commit()
    db_session.refresh(q_other)

    r = client.post(
        f"/api/games/{game.id}/questions/reorder",
        json={"question_ids": [q1.id, q_other.id]}
    )
    assert r.status_code == 400, f"cross-game ID should be rejected, got {r.status_code}: {r.text}"

def test_reorder_empty_list_returns_400(client, game, questions):
    r = client.post(
        f"/api/games/{game.id}/questions/reorder",
        json={"question_ids": []}
    )
    # Validation moved to Pydantic (issue #25) - now returns 422 instead of 400
    assert r.status_code == 422, f"empty list should be rejected, got {r.status_code}: {r.text}"
