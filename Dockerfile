# Connections Game – Cloud Run
FROM node:20-slim AS frontend_build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --silent || npm install --silent
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    CONNECTIONS_DB=/data/connections.db \
    CONNECTIONS_DB_PATH=/data/connections.db
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 ca-certificates wget && rm -rf /var/lib/apt/lists/* \
 && wget -qO /tmp/litestream.tar.gz https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz \
 && tar -xzf /tmp/litestream.tar.gz -C /usr/local/bin litestream \
 && rm /tmp/litestream.tar.gz \
 && litestream version
COPY requirements.txt ./
RUN pip install -r requirements.txt
COPY backend/ ./backend/
# copy frontend dist into backend for FastAPI static mount
COPY --from=frontend_build /frontend/dist ./frontend/dist
# litestream config
COPY litestream.yml /etc/litestream.yml
ENV PYTHONPATH=/app/backend
WORKDIR /app/backend
# run migrations then start server – workers=1 required for in-app rate limiter
# litestream replicates /data/connections.db → GCS, restore on cold start
# litestream.yml is at /etc/litestream.yml (default config path)
CMD sh -c "mkdir -p /data && litestream restore -if-replica-exists /data/connections.db || true && alembic -c alembic.ini upgrade head && exec litestream replicate -exec \"uvicorn app.main:app --host 0.0.0.0 --port \${PORT:-8080} --workers 1\""
