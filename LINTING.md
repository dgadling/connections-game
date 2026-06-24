# Connections Game – Linting

Lint tools wired up to catch the bugs that shipped in the last round.

## Frontend (React)

```
cd frontend
npm install          # first time only – pulls eslint + react-hooks plugin
npm run lint         # eslint src --ext .js,.jsx
npm run lint:fix     # auto-fix what it can
```

**`.eslintrc.cjs`** enforces:

- `react-hooks/rules-of-hooks: error` – **catches React #310**: hooks called conditionally / after early return / in loops. This is the one that caused the blank white page after Discord login.
- `react-hooks/exhaustive-deps: warn` – missing useEffect dependencies (the bare-identifier `useEffect(load, …)` crash our custom test catches would also be flagged here).

Run before every commit. CI should fail on eslint errors.

## Backend (FastAPI / Python)

```
cd backend
pip install ruff
ruff check .
ruff format .
```

`pyproject.toml` enables:
- pyflakes / pycodestyle (E, W, F)
- flake8-bugbear (B) – likely logic bugs
- flake8-simplify / comprehensions
- ruff-specific rules

## What these would have caught

| Bug | Tool | Rule |
|-----|------|------|
| React #310 – useEffect after conditional return | eslint-plugin-react-hooks | `rules-of-hooks` |
| useEffect bare-identifier Promise cleanup crash | eslint-plugin-react-hooks | `exhaustive-deps` (indirect – flags the pattern) + our `useEffect-cleanup.test.js` |
| Python logic bugs | ruff | B / F / SIM |

The backfilled pytest suite (20 backend tests, 3 frontend) catches the rest at CI time.
