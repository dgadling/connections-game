# Connections Game – Code Review

Reviewer: brutal code reviewer subagent
Date: 2026-06-23
Scope: Steps 1-6 + pairing/tagging (initial pass – models + db + tagging only; pairing algo, auth, API, CSRF, rate limiting not yet present)

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

### M2 – Tag classifier missing `from __future__ import annotations`
**File:** `backend/app/tagging.py:1`
Source `~/workspace/spaces/corvessa/actions/lib/sentiment.py` includes `from __future__ import annotations`.

Spec: "port verbatim". Add the import line to match source exactly. Functional impact none, but spec compliance.

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
Or at least log when falling back.

Not blocking, but easy to fix.

### m2 – `datetime.utcnow()` is deprecated
**File:** `backend/app/models.py:11-12`
`datetime.utcnow()` – use `datetime.now(timezone.utc).replace(tzinfo=None)` or just keep for SQLite compatibility. Low risk, SQLite stores naive timestamps anyway. Optional.

### m3 – Missing indexes on FK columns
Spec: "Indexes on all `(game_id, …)` foreign key paths."

Currently ORM defines no indexes beyond PKs. Add indexes in migration for:
- `game_invites.game_id`
- `conn_questions.game_id`
- `conn_pairings.game_id`
- `conn_plays.game_id`
- etc.

Performance only, not a correctness blocker for small data, but spec calls it out.

### m4 – No `__repr__` / validation helpers
Not required, but consider Pydantic `CheckConstraint` for question length is DB-side only – add Pydantic validator for 500 char limit on API input to fail fast. Will be needed when API layer lands.

---

## Spec compliance checklist (incomplete – code not yet present)

- [x] `game_members.discord_id` NULLABLE – yes
- [ ] Partial unique index `WHERE discord_id IS NOT NULL AND deleted_at IS NULL` – **MISSING / BLOCKER B1**
- [ ] Self-claim API: `POST /api/games/{game_id}/members/claim`, `GET /unclaimed`, join returns `claim_needed` – **not implemented yet**
- [ ] Question tag override: PATCH with `tag_auto`, revert re-classifies immediately – **not implemented yet**
- [ ] Session tokens: `secrets.token_urlsafe()`, SHA256 hash storage, httpOnly Secure SameSite=Lax – **not implemented yet**
- [ ] CSRF Origin/Referer + double-submit X-CSRF-Token – **not implemented yet**
- [ ] Rate limiting token bucket, X-Forwarded-For leftmost IP, workers=1 – **not implemented yet**
- [ ] `require_membership(ctx, game_id)` everywhere – **not implemented yet**
- [ ] Pairing algo ported verbatim from `~/workspace/spaces/corvessa/actions/lib/groups.py` – **not present yet**
- [x] Tag classifier ported from `~/workspace/spaces/corvessa/actions/lib/sentiment.py` – **yes, minor import missing (M2)**
- [ ] No hard-coded Discord IDs, secrets, URLs – **so far clean**
- [x] DB PRAGMAs: foreign_keys=ON, journal_mode=WAL, synchronous=NORMAL, busy_timeout=5000 – **yes**
- [ ] Copy to Discord formatting: date in viewer TZ, claimed = `<@id>`, unclaimed = plain name – **not implemented yet**

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
