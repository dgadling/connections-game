def test_patch_question_invalid_tag_returns_400(client, game, questions):
    q = questions[0]
    r = client.patch(f"/api/games/{game.id}/questions/{q.id}", json={"tag": "invalid_tag"})
    # Should be 400/422, NOT 500
    assert r.status_code != 500, f"got 500, body={r.text}"
    assert r.status_code == 422, f"expected 422 validation error, got {r.status_code}: {r.text}"
