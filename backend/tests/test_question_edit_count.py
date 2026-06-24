"""edit_count in list_questions API"""
from app import models


def test_list_questions_includes_edit_count(client, game, questions, db_session, test_user):
    # questions[0] has 0 edits initially
    r = client.get(f"/api/games/{game.id}/questions?status=upcoming")
    assert r.status_code == 200
    data = r.json()
    q0 = next(q for q in data if q["id"] == questions[0].id)
    assert "edit_count" in q0
    assert q0["edit_count"] == 0

    # add an edit record
    edit = models.ConnQuestionEdit(
        question_id=questions[0].id,
        old_text=questions[0].text,
        old_tag=questions[0].tag,
        edited_by=test_user.discord_id,
    )
    db_session.add(edit)
    db_session.commit()

    r = client.get(f"/api/games/{game.id}/questions?status=upcoming")
    assert r.status_code == 200
    data = r.json()
    q0 = next(q for q in data if q["id"] == questions[0].id)
    assert q0["edit_count"] == 1
