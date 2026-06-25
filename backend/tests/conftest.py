import pytest
import os
# Set test secrets before importing app (crypto.py / auth.py fail hard if missing)
os.environ.setdefault("DISCORD_OAUTH_FERNET_KEY", "90foexqFdX4NAEKsnTCevgfgtbK2yzSG0Sccebc1PA8=")
os.environ.setdefault("DISCORD_CLIENT_SECRET", "test_csrf_secret_for_pytest_only_do_not_use_in_prod_12345")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app import models
from app.auth import require_user, generate_csrf_token, hash_token
import secrets
import datetime

# In-memory SQLite with StaticPool so all connections share same DB
from sqlalchemy import event
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()
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


def make_authed_client(db_session, user):
    """Create TestClient with valid session + CSRF HMAC for `user`.
    Use this in tests that construct their own TestClient instead of using the `client` fixture.
    Caller must clear app.dependency_overrides when done.
    Returns client (with X-CSRF-Token header set, session/csrf cookies set).
    """
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    def override_require_user():
        return user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[require_user] = override_require_user

    session_token = secrets.token_urlsafe(32)
    token_hash = hash_token(session_token)
    now = datetime.datetime.now(datetime.timezone.utc)
    expires_at = now + datetime.timedelta(days=30)
    auth_sess = models.AuthSession(
        session_token_hash=token_hash,
        discord_id=user.discord_id,
        created_at=now,
        expires_at=expires_at,
        absolute_expires_at=expires_at,
        last_used_at=now,
    )
    db_session.add(auth_sess)
    db_session.commit()

    csrf_token = generate_csrf_token(session_token)
    client = TestClient(app, cookies={
        "connections_session": session_token,
        "csrf_token": csrf_token,
    })
    client.headers["X-CSRF-Token"] = csrf_token
    # stash for cleanup / inspection if needed
    client._test_session_token = session_token
    client._test_csrf_token = csrf_token
    return client


@pytest.fixture
def client(db_session, test_user):
    c = make_authed_client(db_session, test_user)
    try:
        yield c
    finally:
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
        models.GameMember(game_id=game.id, name="Alice", discord_id="alice_test"),
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
