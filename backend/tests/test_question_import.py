def test_seed_questions(client, game, db_session):
    # seed first time - should insert 38
    r = client.post(f"/api/games/{game.id}/questions/seed")
    assert r.status_code == 200
    data = r.json()
    assert data["inserted"] == 38
    assert data["total_bank"] == 38
    # seed again - duplicates skipped
    r2 = client.post(f"/api/games/{game.id}/questions/seed")
    assert r2.status_code == 200
    assert r2.json()["inserted"] == 0

def test_import_export(client, game):
    # import 3 questions, 1 duplicate
    payload = {"questions": ["Q one?", "Q two?", "Q three?", "Q one?"]}
    r = client.post(f"/api/games/{game.id}/questions/import", json=payload)
    assert r.status_code == 200
    assert r.json() == {"inserted": 3, "skipped": 1}
    # export
    r = client.get(f"/api/games/{game.id}/questions/export")
    assert r.status_code == 200
    texts = [q["text"] for q in r.json()]
    assert "Q one?" in texts
    assert "Q two?" in texts
    assert "Q three?" in texts
