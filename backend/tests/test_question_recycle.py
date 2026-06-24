def test_recycle_used_questions(client, db_session, game, test_user):
    from app import models
    # clear auto-created questions
    db_session.query(models.ConnQuestion).filter(models.ConnQuestion.game_id == game.id).delete()
    db_session.commit()
    # add membership for require_membership check (uses GameMembership table)
    mem = models.GameMembership(game_id=game.id, discord_id=test_user.discord_id)
    db_session.merge(mem)
    db_session.commit()
    # add 3 used questions
    q1 = models.ConnQuestion(game_id=game.id, text="Q1", tag="warm", status="used", sort_order=5)
    q2 = models.ConnQuestion(game_id=game.id, text="Q2", tag="warm", status="used", sort_order=2)
    q3 = models.ConnQuestion(game_id=game.id, text="Q3", tag="warm", status="used", sort_order=9)
    db_session.add_all([q1, q2, q3])
    db_session.commit()
    q1_id, q2_id, q3_id = q1.id, q2.id, q3.id

    r = client.post(f"/api/games/{game.id}/questions/recycle")
    assert r.status_code == 200, r.text
    assert r.json()["recycled_count"] == 3

    # verify via API
    r = client.get(f"/api/games/{game.id}/questions?status=upcoming")
    assert r.status_code == 200
    qs = r.json()
    assert len(qs) == 3
    ids = [q["id"] for q in qs]
    assert ids == [q1_id, q2_id, q3_id], f"got {ids}"
    sort_orders = [q["sort_order"] for q in qs]
    assert sort_orders == [0, 1, 2]


def test_recycle_appends_after_existing_upcoming(client, db_session, game, test_user):
    from app import models
    db_session.query(models.ConnQuestion).filter(models.ConnQuestion.game_id == game.id).delete()
    db_session.commit()
    mem = models.GameMembership(game_id=game.id, discord_id=test_user.discord_id)
    db_session.merge(mem)
    db_session.commit()

    # existing upcoming
    up = models.ConnQuestion(game_id=game.id, text="upcoming", tag="warm", status="upcoming", sort_order=0)
    db_session.add(up)
    db_session.commit()
    db_session.refresh(up)
    up_id = up.id

    # used questions
    q1 = models.ConnQuestion(game_id=game.id, text="used1", tag="warm", status="used", sort_order=10)
    q2 = models.ConnQuestion(game_id=game.id, text="used2", tag="warm", status="used", sort_order=11)
    db_session.add_all([q1, q2])
    db_session.commit()

    r = client.post(f"/api/games/{game.id}/questions/recycle")
    assert r.status_code == 200
    assert r.json()["recycled_count"] == 2

    r = client.get(f"/api/games/{game.id}/questions?status=upcoming")
    qs = r.json()
    assert len(qs) == 3
    assert qs[0]["id"] == up_id
    assert qs[0]["sort_order"] == 0
    assert qs[1]["sort_order"] == 1
    assert qs[2]["sort_order"] == 2
