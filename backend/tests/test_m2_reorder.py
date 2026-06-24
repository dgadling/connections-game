"""m2: question reorder – POST /questions/reorder updates sort_order"""
from app import models


def test_question_reorder_updates_sort_order(client, game, questions, db_session):
    """POST /api/games/{game_id}/questions/reorder should update sort_order to match given order"""
    # questions fixture gives us 2 questions, sort_order 0 and 1
    q1, q2 = questions[0], questions[1]
    assert q1.sort_order == 0
    assert q2.sort_order == 1

    # Reorder: swap them – q2 first, q1 second
    r = client.post(
        f"/api/games/{game.id}/questions/reorder",
        json={"question_ids": [q2.id, q1.id]}
    )
    assert r.status_code == 200

    # Verify DB sort_order updated
    db_session.expire_all()
    q1_db = db_session.query(models.ConnQuestion).filter(models.ConnQuestion.id == q1.id).first()
    q2_db = db_session.query(models.ConnQuestion).filter(models.ConnQuestion.id == q2.id).first()
    assert q2_db.sort_order == 0, "q2 should now be sort_order 0"
    assert q1_db.sort_order == 1, "q1 should now be sort_order 1"

    # Verify GET returns in new order
    r = client.get(f"/api/games/{game.id}/questions?status=upcoming")
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 2
    assert data[0]["id"] == q2.id
    assert data[1]["id"] == q1.id


def test_question_reorder_three_items(client, game, db_session):
    """Reorder with 3 questions – full reverse"""
    # Create 3 questions with known order
    qs = []
    for i, text in enumerate(["First", "Second", "Third"]):
        q = models.ConnQuestion(
            game_id=game.id,
            text=text,
            tag="warm",
            tag_auto=True,
            status="upcoming",
            sort_order=100 + i  # use high sort_order to avoid colliding with fixture questions
        )
        db_session.add(q)
        qs.append(q)
    db_session.commit()
    for q in qs:
        db_session.refresh(q)

    q_first, q_second, q_third = qs

    # Reverse order: Third, Second, First
    r = client.post(
        f"/api/games/{game.id}/questions/reorder",
        json={"question_ids": [q_third.id, q_second.id, q_first.id]}
    )
    assert r.status_code == 200

    # Check DB
    db_session.expire_all()
    qf = db_session.query(models.ConnQuestion).filter(models.ConnQuestion.id == q_first.id).first()
    qsnd = db_session.query(models.ConnQuestion).filter(models.ConnQuestion.id == q_second.id).first()
    qt = db_session.query(models.ConnQuestion).filter(models.ConnQuestion.id == q_third.id).first()

    assert qt.sort_order == 0
    assert qsnd.sort_order == 1
    assert qf.sort_order == 2
