# Connections Game – Code Review

Reviewer: brutal code reviewer subagent
Date: 2026-06-23
Scope: Steps 1-6 + pairing/tagging

Revision: commit 25c3913 "backend: models, db, auth helpers, pairing, tagging" + untracked backend/app/schemas.py

---

## Blocker

### B1 – `game_members` name uniqueness is NOT partial – blocks re-adding deleted members
**File:** `backend/app/models.py:55-62`
```python
__table_args__ = (
    UniqueConstraint("game_id", "name", name="uq_game_member_name_active"),
    Index("ix_game_members_game_discord", "game_id", "discord_id"),
)
```
Spec requires: `UNIQUE (game_id, name) WHERE deleted_at IS NULL`

Current `UniqueConstraint` is global – a soft-deleted member blocks reusing the name forever. Violates: "Unique constraints are partial — you can re-add a previously deleted name / Discord ID."

**Fix:** Remove the ORM `UniqueConstraint`. Create partial unique indexes in Alembic migration:
```sql
CREATE UNIQUE INDEX uq_game_member_name_active ON game_members(game_id, name) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_game_member_discord_active ON game_members(game_id, discord_id) WHERE deleted_at IS NULL AND discord_id IS NOT NULL;
```
ORM Index `ix_game_members_game_discord` is non-unique and insufficient – drop it, replace with the partial unique index above.

Do this BEFORE any data exists, or add a migration that drops the bad constraint/index.

### B2 – Hard-coded Discord OAuth credentials in auth.py
**File:** `backend/app/auth.py:49-59`
```python
DISCORD_CLIENT_ID = os.environ.get("DISCORD_CLIENT_ID", "1519114145864356001")
DISCORD_CLIENT_SECRET = os.environ.get("DISCORD_CLIENT_SECRET", "")
if not DISCORD_CLIENT_SECRET:
    try:
        with open(os.path.expanduser("~/workspace/.auth/discord_oauth_client_secret"), "r") as f:
            DISCORD_CLIENT_SECRET = f.read().strip()
    except Exception:
        pass

REDIRECT_URI = os.environ.get("DISCORD_REDIRECT_URI", "https://connections-285405137493.us-central1.run.app/auth/discord/callback")
```

Spec: "No hard-coded Discord IDs, secrets, URLs – use env vars / Secret Manager"

Violations:
- Hard-coded `DISCORD_CLIENT_ID` fallback `"1519114145864356001"` – real Discord snowflake baked into source. Must fail closed if env var missing, not fall back.
- Hard-coded `REDIRECT_URI` default `"https://connections-285405137493.us-central1.run.app/auth/discord/callback"` – baked-in production URL.
- Secret fallback reading `~/workspace/.auth/discord_oauth_client_secret` – local file path, not Secret Manager, risks secret leakage into repo / container image.

**Fix:**
```python
DISCORD_CLIENT_ID = os.environ["DISCORD_CLIENT_ID"]  # fail fast if missing
DISCORD_CLIENT_SECRET = os.environ["DISCORD_CLIENT_SECRET"]
REDIRECT_URI = os.environ.get("DISCORD_REDIRECT_URI", "")  # empty is fine, or require env var too – never hard-code
```
No file-system secret fallback. Cloud Run Secret Manager mounts as env vars – that's the only allowed source.

This is a security blocker – hard-coded OAuth client IDs + redirect URLs in git history are a leak vector. Purge from git history after fixing, or rotate the Discord app credentials.

---

## Major

### M1 – Missing Alembic migration for partial unique indexes
**File:** `backend/app/models.py:58`
Comment says "partial unique index for discord_id created in migration", but no `alembic/` directory exists yet in the repo.

Ensure the initial migration includes BOTH partial unique indexes (name + discord_id). Verify:
- `game_members.discord_id` is NULLABLE – yes, correct
- Partial unique WHERE `deleted_at IS NULL AND discord_id IS NOT NULL`
- Partial unique WHERE `deleted_at IS NULL` for name

Without these indexes, the DB will allow duplicate claimed Discord IDs and block legitimate name reuse.

### M2 – `require_membership` signature deviates from spec, not yet enforced at API layer
**File:** `backend/app/auth.py:33-40`
```python
def require_membership(game_id: int, discord_id: str, db: Session):
```
Spec API doc says `require_membership(ctx, game_id)`. Current signature is `game_id, discord_id, db` – workable, but need to ensure EVERY game-scoped endpoint calls it. No API routes exist yet in this commit, so can't verify. Flagging early: when API lands, grep for all `/api/games/{game_id}/*` handlers – each must call `require_membership` before any data access. Missing one = data leak across games.

### M3 – Session fixation protection not implemented in `create_session`
**File:** `backend/app/auth.py:42-58`
`create_session()` does not invalidate existing sessions for the discord_id. Comment acknowledges this: "invalidate existing sessions … do that in oauth callback, not here".

Spec: "Session fixation protection: fresh token issued at every OAuth login, any existing session invalidated"

Ensure the OAuth callback handler (not yet committed?) deletes ALL existing `auth_sessions` rows for that `discord_id` BEFORE calling `create_session`, AND invalidates any pre-existing `connections_session` cookie. Verify this when auth routes land – easy to miss, critical for security.

### M4 – CSRF token generated but never validated
**File:** `backend/app/auth.py:60-61`
`generate_csrf_token()` exists, but no middleware / dependency validates `Origin/Referer + X-CSRF-Token` double-submit. Expected – API layer not committed yet. When it lands, verify:
- Origin/Referer check matches our own origin
- `X-CSRF-Token` header == `csrf_token` cookie value
- Applies to ALL mutating endpoints (POST/PATCH/DELETE)
- Token rotated per session

### M5 – No rate limiting code yet
Spec requires in-app token bucket, `X-Forwarded-For` leftmost IP, 429 with Retry-After, uvicorn `--workers 1`. None present in commit 25c3913 – expected, API layer incomplete.

### M6 – Tag classifier missing `from __future__ import annotations`
**File:** `backend/app/tagging.py:1`
Source `~/workspace/spaces/corvessa/actions/lib/sentiment.py` includes `from __future__ import annotations`.

Spec: "port verbatim". Add the import line to match source exactly. Functional impact none, but spec compliance.

### M7 – `ClaimRequest` allows invalid combinations
**File:** `backend/app/schemas.py` (untracked, not in commit yet)
```python
class ClaimRequest(BaseModel):
    member_id: Optional[int] = None
    name: Optional[str] = None
```
Spec: "claim existing: { member_id } … add new: { name } … one or the other, not both, not neither"

Pydantic model allows both None, both set, empty string, etc. Add a `@model_validator(mode='after')` to enforce XOR:
- exactly one of `member_id` / `name` must be provided
- if `name`, strip/validate non-empty, check uniqueness (active members only)

Validate in the API handler before touching DB, otherwise you'll get confusing constraint errors.

### M8 – Member Discord ID validation missing in Pydantic schemas
**File:** `backend/app/schemas.py`
`MemberCreate.discord_id: Optional[str] = None` – no validation.

Spec requires server-side validation:
- Regex: `^\d{17,20}$`
- Snowflake timestamp check: extract timestamp, verify between 2015-01-01 and now + 1 day
- Reject with: "That doesn't look like a Discord ID — [how to find it]"

Add a Pydantic validator, or enforce in the API handler. Same for `MemberPatch`.

Without validation, junk IDs get stored and break `<@discord_id>` mentions in Copy-to-Discord output.

---

## Minor

### m1 – `DB_PATH` fallback logic is fragile
**File:** `backend/app/db.py:7-9`
```python
if not os.path.exists(os.path.dirname(DB_PATH)) or os.path.dirname(DB_PATH) == "":
```
If `DB_PATH = "connections.db"` (no directory), `os.path.dirname` returns `""`, triggering fallback to `"./connections.db"` – same path, harmless but pointless. If `CONNECTIONS_DB=/data/connections.db` and `/data` doesn't exist (local dev), silently falls back to `./connections.db` – could cause confusion.

Suggestion:
```python
db_dir = os.path.dirname(DB_PATH)
if db_dir and not os.path.exists(db_dir):
    os.makedirs(db_dir, exist_ok=True)
```

### m2 – `datetime.utcnow()` deprecated, used in 3 files
**Files:** `backend/app/models.py`, `backend/app/auth.py`
`datetime.utcnow()` is deprecated. Use `datetime.now(timezone.utc)` stripped to naive, or keep for SQLite. Low risk. Optional.

### m3 – Missing indexes on FK columns
Spec: "Indexes on all `(game_id, …)` foreign key paths."
Add in Alembic migration.

### m4 – Pydantic question length validation is present – resolved
`schemas.py` has `Field(max_length=500)` – good.

### m5 – `get_current_user` uses FastAPI `Depends` in a non-route function
**File:** `backend/app/auth.py:14**
```python
def get_current_user(request: Request, db: Session = Depends(get_db)) -> ...
```
`Depends(get_db)` only works when FastAPI injects it. If called manually, `db` will be a `Depends` object, not a Session. Will break at runtime. Change signature to `db: Session` required (no default), or make it a proper dependency only.

---

## Spec compliance checklist

Auth / sessions:
- [x] Session tokens: `secrets.token_urlsafe()` – yes, `token_urlsafe(32)`
- [x] SHA256 hash storage – yes, `hash_token()`
- [ ] httpOnly Secure SameSite=Lax cookie – **not verified – API layer missing**
- [x] 30-day sliding refresh – yes
- [x] 90-day absolute cap – yes, checked in `get_current_user`
- [ ] Session fixation protection (fresh token, invalidate old) – **partially – `create_session` does NOT invalidate, must be done in OAuth callback – verify when auth routes land – M3**
- [ ] OAuth state CSRF, redirect_after whitelist – **not present yet**

Game members / claim:
- [x] `game_members.discord_id` NULLABLE – yes
- [ ] Partial unique index `WHERE discord_id IS NOT NULL AND deleted_at IS NULL` – **MISSING / BLOCKER B1**
- [ ] Self-claim API: `POST /api/games/{game_id}/members/claim`, `GET /unclaimed`, join returns `claim_needed` – **schemas exist (untracked), API routes not committed yet – ClaimRequest validation missing (M7)**
- [ ] Discord ID validation: regex `^\d{17,20}$` + snowflake timestamp – **missing – M8**

Questions / tagging:
- [x] Tag classifier ported from `~/workspace/spaces/corvessa/actions/lib/sentiment.py` – **yes, minor import missing (M6)**
- [ ] Question tag override: PATCH with `tag_auto`, revert re-classifies immediately – **not implemented yet – API missing**
- [x] Question text ≤500 chars – **yes, Pydantic `Field(max_length=500)`**
- [ ] Edit history inserts BEFORE UPDATE – **not verified – API missing**

Pairing:
- [x] Pairing algo ported verbatim from `~/workspace/spaces/corvessa/actions/lib/groups.py` – **yes – core `generate_groups`, `_additive`, `_backtrack_search`, `_find_derangement` are byte-identical. `regenerate_groups` DB helper omitted (was sqlite3-specific with different column names) – acceptable, caller will reimplement for SQLAlchemy.**
- [ ] Pairings auto-regenerate on roster change – **not verified – API missing**
- [x] DB constraints: UNIQUE asker + target per round, CHECK no self-pair – yes

Security:
- [ ] CSRF Origin/Referer + double-submit X-CSRF-Token – **token generator exists, validation missing – M4**
- [ ] Rate limiting token bucket, X-Forwarded-For leftmost IP, workers=1 – **not implemented – M5**
- [ ] `require_membership(ctx, game_id)` everywhere – **function exists, API routes not yet committed – verify full coverage when they land – M2**
- [x] No hard-coded Discord IDs, secrets, URLs – **FAIL – B2: hard-coded DISCORD_CLIENT_ID, REDIRECT_URI, local secret file fallback**
- [x] DB PRAGMAs: foreign_keys=ON, journal_mode=WAL, synchronous=NORMAL, busy_timeout=5000 – **yes**
- [ ] Copy to Discord formatting: date in viewer TZ, claimed = `<@id>`, unclaimed = plain name – **not implemented yet**

Infrastructure:
- [ ] Alembic migration with correct partial unique indexes – **missing – M1**
- [ ] uvicorn `--workers 1` – **not verified**
- [ ] Health check `/healthz` – **not present yet**

---

## Next steps for coder

1. Fix **B1** immediately – drop the bad `UniqueConstraint`, add proper partial unique indexes in Alembic initial migration. Do NOT commit API code that touches `game_members` until this is fixed – you'll get unique violations on restore/rename flows.
2. Create Alembic env + initial migration that matches the spec exactly – include both partial unique indexes, all FK `ON DELETE` actions as specified, and FK-path indexes.
3. Add the missing `from __future__ import annotations` to tagging.py (trivial).
4. Then proceed with pairing algo port – must be verbatim from `~/workspace/spaces/corvessa/actions/lib/groups.py`, including odd-N additive, even-N backtracking, N=4 special case.
5. Auth / CSRF / rate limiting – follow spec verbatim, especially:
   - session_token = `secrets.token_urlsafe()`, store SHA256 hash only
   - cookie: httpOnly, Secure, SameSite=Lax
   - CSRF double-submit + Origin check
   - rate limit parsing `X-Forwarded-For` leftmost
   - uvicorn `--workers 1`
6. When API endpoints land, I will re-review for `require_membership` coverage, self-claim flow, tag_auto handling, and Discord copy formatting.

Post a ping when Steps 1-6 are committed – I'll do a full pass.
