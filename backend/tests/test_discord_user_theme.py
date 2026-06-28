from app import models


def test_discord_user_theme_defaults_to_default(db_session):
    u = models.DiscordUser(
        discord_id="theme_test_1",
        username="themer",
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    assert u.theme == "default"


def test_discord_user_valid_themes_save(db_session):
    for theme in sorted(models.ALLOWED_THEMES):
        discord_id = f"theme_test_{theme}"
        u = models.DiscordUser(
            discord_id=discord_id,
            username="themer",
            theme=theme,
        )
        db_session.add(u)
    db_session.commit()

    for theme in models.ALLOWED_THEMES:
        discord_id = f"theme_test_{theme}"
        u = db_session.get(models.DiscordUser, discord_id)
        assert u is not None
        assert u.theme == theme
