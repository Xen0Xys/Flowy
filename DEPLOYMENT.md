# Flowy Deployment

This guide walks through every step needed to launch Flowy locally or in production with Docker. It covers three deployment contexts:

1. **Full stack** via `docker compose` (Postgres + Nest backend + Nuxt frontend)
2. **Backend only** (standalone container)
3. **Frontend only** (standalone container)

## 1. Prerequisites

- Docker 24+ and Docker Compose v2
- Bun 1.3+ (for builds outside Docker)
- Node.js 20+ (ships inside the Bun image)
- Ports 3000 (frontend) and 4000 (backend) available; override through env vars if needed

## 2. Environment variables

Create a `.env` file at the repository root (same folder as `docker-compose.yml`):

```bash
# Database
POSTGRES_DB=flowy
POSTGRES_USER=flowy
POSTGRES_PASSWORD=flowy
POSTGRES_PORT=5432

# Backend
APP_NAME=Flowy
APP_SECRET=change-me
APP_PREFIX=""
BACKEND_PORT=4000
DATABASE_URL=postgresql://flowy:flowy@db:5432/flowy

# Frontend
FRONTEND_PORT=3000
NUXT_PUBLIC_API_BASE=http://localhost:4000
```

> **Important:** `APP_SECRET` must be a strong random string. In production, always rotate the Postgres credentials and block public access to the database.

## 3. Full stack (frontend + backend + Postgres)

```bash
docker compose up --build -d
```

- Frontend: `http://localhost:3000`
- API: `http://localhost:4000`
- Swagger: `http://localhost:4000/api`

Follow the logs:

```bash
docker compose logs -f backend
```

Stop and remove containers:

```bash
docker compose down
```

Postgres data persists through the `flowy-db-data` volume.

## 4. Backend-only deployment

### 4.1 Build the image

```bash
cd server
bun install
bun run build
cd ..
docker build -f server/Dockerfile \
    -t flowy-backend \
    --build-arg DATABASE_URL="postgresql://user:pass@host:5432/db" \
    server
```

### 4.2 Run the container

```bash
docker run -d \
    --name flowy-backend \
    -e DATABASE_URL=postgresql://user:pass@host:5432/db \
    -e APP_NAME=Flowy \
    -e APP_SECRET=change-me \
    -e PREFIX= \
    -e PORT=4000 \
    -p 4000:4000 \
    flowy-backend
```

The container automatically runs `prisma migrate deploy` and `prisma db seed` before `bun run start:prod`.

## 5. Frontend-only deployment

### 5.1 Build the image

```bash
cd web
bun install
bun run build
cd ..
docker build -f web/Dockerfile -t flowy-frontend web
```

### 5.2 Run the container

```bash
docker run -d \
    --name flowy-frontend \
    -e HOST=0.0.0.0 \
    -e PORT=3000 \
    -e NUXT_PUBLIC_API_BASE=https://api.example.com \
    -p 3000:3000 \
    flowy-frontend
```

To connect this frontend to the backend from `docker compose`, set `NUXT_PUBLIC_API_BASE=http://backend:4000`.

## 6. Best practices

- Use a strong `APP_SECRET` and rotate it regularly.
- Restrict Postgres network access (firewall or private Docker network).
- Regenerate the Prisma client (`bunx prisma generate`) after every schema change, then restart the container.
- Tail the logs (`docker compose logs -f`) to confirm automatic migrations succeed.
- Put a reverse proxy (Traefik, Nginx) in front to manage HTTPS and TLS termination.

## 7. Quick troubleshooting

| Symptom                                      | Likely cause                          | Fix                                                 |
| -------------------------------------------- | ------------------------------------- | --------------------------------------------------- |
| Backend stuck on Prisma                      | Database unreachable                  | Check `DATABASE_URL` and the Postgres service state |
| Frontend cannot reach the API                | Wrong `NUXT_PUBLIC_API_BASE` value    | Point to the public URL or `http://backend:4000`    |
| `docker compose up` fails while building API | Missing `DATABASE_URL` build argument | Provide `DATABASE_URL` during build and at runtime  |

---

You now have a reproducible Docker deployment for Flowy. Adjust ports, secrets, and network policies to match your infrastructure before going to production.
