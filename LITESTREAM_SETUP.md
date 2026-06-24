# Litestream setup – Connections Game

SQLite persistence on Cloud Run via Litestream → GCS.

## One-time GCP setup (already done)

```bash
# Create GCS bucket for WAL replication
gcloud storage buckets create gs://connections-game-litestream \
  --location=us-central1 \
  --project=connections-500320 \
  --uniform-bucket-level-access

# Grant Cloud Run runtime SA write access
gcloud storage buckets add-iam-policy-binding gs://connections-game-litestream \
  --member=serviceAccount:285405137493-compute@developer.gserviceaccount.com \
  --role=roles/storage.objectAdmin
```

Bucket: `gs://connections-game-litestream`
Replica path: `gcs://connections-game-litestream/db`

## How it works

- `litestream.yml` → replicates `/data/connections.db` → GCS, 1s sync interval (default)
- Dockerfile installs Litestream 0.3.13
- Container start:
  1. `litestream restore -if-replica-exists -if-db-not-exists /data/connections.db`
  2. `alembic upgrade head`
  3. `litestream replicate -exec "uvicorn … --workers 1"`
- Cloud Run: `--min-instances=1` (eliminates cold start, ~$2-3/mo memory-only idle cost)
- `--workers 1` is required – in-app token-bucket rate limiter is in-memory

## Verify

```bash
# Check Cloud Run logs – should see "replicating"
gcloud run services logs read connections --region=us-central1 --project=connections-500320 --limit=50

# Check GCS bucket has generation files
gcloud storage ls gs://connections-game-litestream/db/
```

## Manual restore

```bash
litestream restore -o /tmp/restore.db gcs://connections-game-litestream/db
sqlite3 /tmp/restore.db "SELECT count(*) FROM games;"
```

## Environment

- `CONNECTIONS_DB=/data/connections.db` (WAL mode enabled in `backend/app/db.py`)
- `REPLICA_URL=gcs://connections-game-litestream/db` (set in deploy.yml, overridable)
