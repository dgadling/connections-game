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
