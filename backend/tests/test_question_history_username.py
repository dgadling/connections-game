"""question edit history returns username"""
from app import models


def test_question_history_includes_edited_by_name(client, game, db_session, test_user):
    # force global_name empty, username set - tests precedence fix:
    # (du.global_name or du.username) if du else ...
    test_user.global_name = None
    test_user.username = "testeditor"
    db_session.commit()

    # create a question
    q = models.ConnQuestion(game_id=game.id, text="test?", tag="warm", sort_order=0)
    db_session.add(q)
    db_session.commit()

    # add edit record
    edit = models.ConnQuestionEdit(
        question_id=q.id,
        old_text="old",
        old_tag="warm",
        edited_by=test_user.discord_id,
    )
    db_session.add(edit)
    db_session.commit()

    r = client.get(f"/api/games/{game.id}/questions/{q.id}/history")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["edited_by"] == test_user.discord_id
    assert "edited_by_name" in data[0]
    # precedence: global_name falsy → falls back to username
    assert data[0]["edited_by_name"] == "testeditor"
