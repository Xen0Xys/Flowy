# Flowy Deployment

This guide is based directly on the 3 Compose files in this repository:

1. `docker-compose.yaml` (runtime with prebuilt images)
2. `docker-compose.dev.yaml` (local build for development)
3. `docker-compose.coolify.yaml` (Coolify deployment)

## 1. Prerequisites

- Docker 24+ and Docker Compose v2
- A `.env` file at the project root
- Ports `3000` (web) and `4000` (API) available for local variants

## 2. Environment variables

### 2.1 Shared variables (local)

These variables cover `docker-compose.yaml` and `docker-compose.dev.yaml`:

```bash
# Postgres
POSTGRES_DB=flowy
POSTGRES_USER=flowy
POSTGRES_PASSWORD=flowy

# API (Nest)
APP_SECRET=change-me
APP_PREFIX=
CORS_ORIGINS=http://localhost:3000

# Web (Nuxt)
NUXT_PUBLIC_API_BASE=http://localhost:4000
```

Notes:

- `APP_NAME` is fixed to `Flowy Server` in the Compose files.
- `DATABASE_URL` is built automatically in services from Postgres variables.
- Use a strong value for `APP_SECRET` in real environments.

### 2.2 Coolify-specific variables

`docker-compose.coolify.yaml` expects variables injected by Coolify:

- `SERVICE_USER_POSTGRES`
- `SERVICE_PASSWORD_POSTGRES`
- `SERVICE_BASE64_128_APPSECRET`
- `SERVICE_URL_FLOWY_WEB`
- `SERVICE_URL_FLOWY_SERVER`
- `SERVICE_URL_FLOWY_WEB_3000`
- `SERVICE_URL_FLOWY_SERVER_4000`

You can keep `POSTGRES_DB` and `APP_PREFIX` if you need to override defaults.

## 3. `docker-compose.yaml` variant (prebuilt images)

This file uses:

- `tensorchord/vchord-postgres:pg18-v1.1.1`
- `flowy-server:latest`
- `flowy-web:latest`

Commands:

```bash
docker compose up -d
docker compose logs -f
docker compose down
```

Access:

- Frontend: `http://localhost:3000`
- API: `http://localhost:4000`

Important: this variant has no `build` section for `server` and `web`. Make sure `flowy-server:latest` and `flowy-web:latest` are available locally or in your registry.

## 4. `docker-compose.dev.yaml` variant (local build)

This file builds locally:

- `./server/Dockerfile` with `DATABASE_URL` passed as a build arg
- `./web/Dockerfile`

Commands:

```bash
docker compose -f docker-compose.dev.yaml up --build -d
docker compose -f docker-compose.dev.yaml logs -f
docker compose -f docker-compose.dev.yaml down
```

Access:

- Frontend: `http://localhost:3000`
- API: `http://localhost:4000`

## 5. `docker-compose.coolify.yaml` variant (Coolify)

This file is intended for Coolify:

- services named `flowy-postgres`, `flowy-server`, `flowy-web`
- no explicit `ports` mapping (routing handled by Coolify)
- `CORS_ORIGINS` points to `${SERVICE_URL_FLOWY_WEB}`
- `NUXT_PUBLIC_API_BASE` points to `${SERVICE_URL_FLOWY_SERVER}`

Local validation command:

```bash
docker compose -f docker-compose.coolify.yaml config
```

In production, deploy this file via the Coolify UI with all required `SERVICE_*` variables configured.

## 6. Health checks and persistence

- Postgres: `pg_isready` healthcheck
- API: `curl http://<service>:4000/health` healthcheck
- Web: `curl http://<service>:3000/` healthcheck
- Persistent volume: `flowy-db-data` mounted to `/var/lib/postgresql`

## 7. Quick troubleshooting

| Symptom                         | Likely cause                           | Fix                                                                          |
| ------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| API healthcheck failing         | Missing `APP_SECRET` or unreachable DB | Check `.env`, `DATABASE_URL`, then run `docker compose logs -f flowy-server` |
| Frontend cannot reach API       | Wrong `NUXT_PUBLIC_API_BASE`           | Set the API public URL (Coolify) or `http://localhost:4000` locally          |
| Postgres auth errors            | Credentials mismatch                   | Align `POSTGRES_USER` / `POSTGRES_PASSWORD` (or `SERVICE_*` on Coolify)      |
| `flowy-server:latest` not found | Image unavailable                      | Use `docker-compose.dev.yaml` or publish images to a registry                |

---

You now have deployment documentation aligned with the 3 Compose strategies in this project.
