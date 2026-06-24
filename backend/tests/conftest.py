import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Disable CSRF middleware for tests before app import
from app import middleware as app_middleware
original_csrf_dispatch = app_middleware.CSRFMiddleware.dispatch
async def no_csrf_dispatch(self, request, call_next):
    return await call_next(request)
app_middleware.CSRFMiddleware.dispatch = no_csrf_dispatch

from app.db import Base, get_db
from app.main import app
from app import models
from app.auth import require_user

# In-memory SQLite with StaticPool so all connections share same DB
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="session", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def db_session():
    conn = engine.connect()
    trans = conn.begin()
    session = TestingSessionLocal(bind=conn)
    try:
        yield session
    finally:
        session.close()
        trans.rollback()
        conn.close()

@pytest.fixture
def test_user(db_session):
    import os
    # If SUPERUSER_DISCORD_ID is set, use it for test_user so existing
    # game-creation tests pass (create_game is superuser-only when configured)
    discord_id = os.environ.get("SUPERUSER_DISCORD_ID") or "123456789012345678"
    u = models.DiscordUser(
        discord_id=discord_id,
        username="testuser",
        global_name="Test User",
        avatar_hash=None,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u

@pytest.fixture
def client(db_session, test_user):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    def override_require_user():
        return test_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[require_user] = override_require_user

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()

@pytest.fixture
def game(db_session, test_user):
    g = models.Game(
        name="Test Game",
        owner_discord_id=test_user.discord_id,
    )
    db_session.add(g)
    db_session.commit()
    db_session.refresh(g)
    # membership
    mem = models.GameMembership(
        game_id=g.id,
        discord_id=test_user.discord_id,
    )
    db_session.add(mem)
    # conn state
    state = models.ConnState(game_id=g.id, current_round=1)
    db_session.add(state)
    db_session.commit()
    return g

@pytest.fixture
def members(db_session, game):
    ms = [
        models.GameMember(game_id=game.id, name="Alice", discord_id=None),
        models.GameMember(game_id=game.id, name="Bob", discord_id="987654321098765432"),
    ]
    for m in ms:
        db_session.add(m)
    db_session.commit()
    for m in ms:
        db_session.refresh(m)
    return ms

@pytest.fixture
def questions(db_session, game):
    qs = [
        models.ConnQuestion(game_id=game.id, text="What scares you?", tag="vulnerable", tag_auto=True, status="upcoming", sort_order=0),
        models.ConnQuestion(game_id=game.id, text="Favorite memory?", tag="warm", tag_auto=True, status="upcoming", sort_order=1),
    ]
    for q in qs:
        db_session.add(q)
    db_session.commit()
    for q in qs:
        db_session.refresh(q)
    return qs
