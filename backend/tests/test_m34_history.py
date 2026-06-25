"""m3/m4: history enrichment - pairings[], asker/target names + discord_ids, played_by_username, question_tag"""
from app import models


def test_history_includes_pairings_with_names_and_discord_ids(client, game, questions, db_session, test_user, members):
    """GET /history must return pairings[] with asker_name, target_name, asker_discord_id, target_discord_id"""
    # Create a play record
    play = models.ConnPlay(
        game_id=game.id,
        round_num=1,
        question_id=questions[0].id,
        played_by=test_user.discord_id,
    )
    db_session.add(play)

    # Create pairing for round 1 - Alice asks about Bob
    alice, bob = members[0], members[1]
    pairing = models.ConnPairing(
        game_id=game.id,
        round_num=1,
        asker_member_id=alice.id,
        target_member_id=bob.id,
    )
    db_session.add(pairing)
    db_session.commit()

    r = client.get(f"/api/games/{game.id}/history")
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1

    row = data[0]
    assert row["round_num"] == 1
    assert "pairings" in row
    assert isinstance(row["pairings"], list)
    assert len(row["pairings"]) >= 1

    p = row["pairings"][0]
    # Verify all expected pairing fields
    assert "asker_id" in p
    assert "asker_name" in p
    assert "asker_discord_id" in p
    assert "target_id" in p
    assert "target_name" in p
    assert "target_discord_id" in p

    assert p["asker_name"] == "Alice"
    assert p["target_name"] == "Bob"
    # Both have discord_id set in fixture
    assert p["target_discord_id"] == "987654321098765432"
    assert p["asker_discord_id"] == "alice_test"


def test_history_includes_played_by_username_and_question_tag(client, game, questions, db_session, test_user):
    """History rows must include played_by_username and question_tag"""
    play = models.ConnPlay(
        game_id=game.id,
        round_num=2,
        question_id=questions[0].id,
        played_by=test_user.discord_id,
    )
    db_session.add(play)
    db_session.commit()

    r = client.get(f"/api/games/{game.id}/history")
    assert r.status_code == 200
    data = r.json()
    row = next((x for x in data if x["round_num"] == 2), None)
    assert row is not None, "Round 2 play not found in history"

    # Check played_by_username resolution
    assert "played_by_username" in row
    # test_user.global_name = "Test User", username = "testuser"
    # code uses global_name or username, so should be "Test User"
    assert row["played_by_username"] == "Test User", f"got {row['played_by_username']}"

    # Check question_tag
    assert "question_tag" in row
    assert row["question_tag"] == "vulnerable"  # questions[0] fixture tag

    # Check question_text
    assert "question_text" in row
    assert row["question_text"] == "What scares you?"

    # Check played_at ISO
    assert "played_at" in row
    assert row["played_at"] is not None
    # should be ISO parseable
    from datetime import datetime
    datetime.fromisoformat(row["played_at"].replace("Z", "+00:00"))
