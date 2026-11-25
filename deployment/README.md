# deployment/

```
                 host :8080
                     │
              ┌──────┴───────┐   sprpa-net (private Docker network)
              │ sprpa-nginx  │───────────────────────────────────────┐
              └──┬────────┬──┘                                       │
        /        │        │ /api/*                     /ml/health    │
   ┌─────────────┴┐   ┌───┴──────────────┐  REST + key  ┌───────────┴─┐
   │sprpa-frontend│   │  sprpa-backend   │─────────────▶│  sprpa-ml   │
   │ nginx + SPA  │   │ Express + SQLite │              │  FastAPI    │
   └──────────────┘   └───┬──────────────┘              └─────────────┘
                          └─ volume sprpa-data:/data (sprpa.db)
```

| File | Purpose |
|---|---|
| `Dockerfile.frontend` | Vite build → static files on nginx. Firebase web config passed as a BuildKit secret |
| `Dockerfile.backend` | Express API. `--target test` runs the tests; service account is injected only at deploy time |
| `Dockerfile.ml` | FastAPI ML service. `--target test` runs pytest; copies `models/` into the image |
| `Dockerfile.nginx` | Gateway image with `nginx/gateway.conf` |
| `nginx/gateway.conf` | Routes `/` → frontend, `/api/` → backend, `/ml/health` → ML; other `/ml/*` blocked |
| `nginx/frontend.conf` | SPA fallback + long cache for hashed assets |
| `Jenkinsfile` | Preflight → tests (parallel) → build 4 images → deploy → smoke test → automatic rollback |

## Jenkins

Job **`sprpa-pipeline`** (Pipeline from SCM, script path `deployment/Jenkinsfile`)
fetches **only `master`** (refspec `+refs/heads/master`) and polls it every ~2 minutes.
Pushes to `development`, `naman`, `manav`, `rishabh` and `anupam` are never fetched, so they never build.
Flow: feature branch → PR to `development` → PR to `master` → Jenkins deploys.

### Credentials (Manage Jenkins → Credentials → System → Global credentials → Add)

| ID | Kind | Value |
|---|---|---|
| `sprpa-env` | Secret file | `application/.env` |
| `sprpa-firebase-sa` | Secret file | the Firebase service-account JSON from `application/secrets/` |
| `sprpa-ml-internal-key` | Secret text | a random string, e.g. `-join ((48..57)+(97..102) \| Get-Random -Count 32 \| % {[char]$_})` |

Secrets never enter an image or the repo: `.env` and the service account are BuildKit secrets at build time,
the service account is `docker cp`'d into the running backend container, and Jenkins masks all three in logs.

### Notes
- Jenkins runs as LocalSystem while Docker Desktop is a per-user install; the Jenkinsfile points `PATH` at
  `DOCKER_HOME` (default: this machine's Docker Desktop) and uses its own `DOCKER_CONFIG` for buildx.
  Set a global env var `DOCKER_HOME` in Jenkins if Docker Desktop is installed elsewhere.
- Docker Desktop must be running (it starts with your Windows login, not as a service).
- App: <http://localhost:8080>. Add `localhost` to Firebase Authorized domains (already there for dev).
- Images are tagged with the build number; the last 3 are kept for rollback.
