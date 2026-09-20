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
- `WEBAUTHN_RP_ID` (optional) is the Relying Party ID for passkeys. When unset, the server derives it from the first `CORS_ORIGINS` hostname. Set explicitly when serving multiple origins on different domains.

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

### 2.3 Single Sign-On (SSO)

Flowy supports any number of OAuth 2.0 or OIDC providers, configured entirely through environment variables. Providers are declared with the `SSO_<N>_*` prefix, where `<N>` is any positive integer that groups the variables belonging to the same provider. The order of `<N>` values controls the display order on the login page.

Restart the backend after any change to reload the configuration.

**Shared globals** (required if at least one provider is defined):

```bash
# Absolute URL of the frontend, used to redirect users back after callback.
FRONTEND_URL=https://flowy.example.com

# Optional: override the base URL the backend uses to build callback URLs.
# Defaults to http://localhost:$PORT for local dev; set this when the backend
# is behind a reverse proxy or exposed on a public hostname.
SSO_CALLBACK_BASE_URL=https://flowy.example.com/api
```

**Common fields** (every provider):

| Variable                        | Required                                                           | Description                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `SSO_<N>_KIND`                  | yes                                                                | `oidc` or `oauth2`                                                                                                                      |
| `SSO_<N>_SLUG`                  | yes                                                                | Unique lowercase identifier (`[a-z0-9-]`), appears in URLs                                                                              |
| `SSO_<N>_DISPLAY_NAME`          | yes                                                                | Label shown on the login button                                                                                                         |
| `SSO_<N>_ICON`                  | yes                                                                | Iconify icon name (`simple-icons:github`, `iconoir:key`, ...)                                                                           |
| `SSO_<N>_CLIENT_ID`             | yes                                                                | OAuth client ID                                                                                                                         |
| `SSO_<N>_CLIENT_SECRET`         | yes                                                                | OAuth client secret                                                                                                                     |
| `SSO_<N>_SCOPES`                | yes for OAuth2, optional for OIDC (default `openid,email,profile`) | Comma-separated                                                                                                                         |
| `SSO_<N>_ALLOW_SIGNUP`          | optional (default `true`)                                          | Whether to create a new account if the SSO email is unknown. Only effective when the global `REGISTRATION_ENABLED` flag is also `true`. |
| `SSO_<N>_ALLOWED_EMAIL_DOMAINS` | optional                                                           | Comma-separated allowlist                                                                                                               |

**OIDC-only fields** (OpenID Connect, when `KIND=oidc`):

| Variable                | Required | Description                            |
| ----------------------- | -------- | -------------------------------------- |
| `SSO_<N>_DISCOVERY_URL` | yes      | `.well-known/openid-configuration` URL |

**OAuth2-only fields** (plain OAuth 2.0, when `KIND=oauth2`):

| Variable                    | Required | Description                                                                                                                          |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `SSO_<N>_AUTHORIZATION_URL` | yes      | Authorization endpoint                                                                                                               |
| `SSO_<N>_TOKEN_URL`         | yes      | Token endpoint                                                                                                                       |
| `SSO_<N>_USERINFO_URL`      | yes      | Endpoint returning the current user's profile                                                                                        |
| `SSO_<N>_EMAIL_CLAIM`       | yes      | JSON path in the userinfo response holding the email                                                                                 |
| `SSO_<N>_USERNAME_CLAIM`    | yes      | JSON path holding the username                                                                                                       |
| `SSO_<N>_SUB_CLAIM`         | yes      | JSON path holding the stable subject id                                                                                              |
| `SSO_<N>_EMAILS_URL`        | optional | Fallback endpoint returning a list of `{email, primary, verified}` (used when the userinfo response has no email, typical of GitHub) |

**Redirect URI to register with the provider**:

The callback URL to declare in each identity provider console is:

```
${SSO_CALLBACK_BASE_URL or backend URL}/auth/sso/<slug>/callback
```

The admin page `Settings > SSO` (visible to the instance owner) shows the exact callback URL for each configured provider, with a copy-to-clipboard button.

#### 2.3.1 GitHub (OAuth 2.0)

```bash
SSO_1_KIND=oauth2
SSO_1_SLUG=github
SSO_1_DISPLAY_NAME=GitHub
SSO_1_ICON=simple-icons:github
SSO_1_CLIENT_ID=Iv23xxxxxxxxxxxxxxxx
SSO_1_CLIENT_SECRET=ghs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SSO_1_AUTHORIZATION_URL=https://github.com/login/oauth/authorize
SSO_1_TOKEN_URL=https://github.com/login/oauth/access_token
SSO_1_USERINFO_URL=https://api.github.com/user
SSO_1_EMAILS_URL=https://api.github.com/user/emails
SSO_1_SCOPES=read:user,user:email
SSO_1_EMAIL_CLAIM=email
SSO_1_USERNAME_CLAIM=login
SSO_1_SUB_CLAIM=id
```

Register the app at <https://github.com/settings/developers> and set the "Authorization callback URL" to `${FRONTEND_URL}/auth/sso/github/callback` (adjust with `SSO_CALLBACK_BASE_URL` if the backend is exposed on a distinct host).

#### 2.3.2 Google (OIDC)

```bash
SSO_2_KIND=oidc
SSO_2_SLUG=google
SSO_2_DISPLAY_NAME=Google
SSO_2_ICON=simple-icons:google
SSO_2_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
SSO_2_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxxxx
SSO_2_DISCOVERY_URL=https://accounts.google.com/.well-known/openid-configuration
SSO_2_SCOPES=openid,email,profile
```

Configure the OAuth 2.0 client at <https://console.cloud.google.com/apis/credentials> and add the redirect URI reported by the SSO admin page.

#### 2.3.3 Microsoft Entra ID (OIDC, with tenant)

The Microsoft OIDC discovery URL embeds the tenant. Replace `<tenant>` with one of:

- `common` — any Microsoft account (personal, work, school)
- `organizations` — any work / school account
- `consumers` — personal accounts only
- `<tenant-guid>` — a specific Entra ID tenant (single-org SSO)
- `<domain>.onmicrosoft.com` — same, referenced by primary domain

```bash
SSO_3_KIND=oidc
SSO_3_SLUG=microsoft
SSO_3_DISPLAY_NAME=Microsoft
SSO_3_ICON=simple-icons:microsoftazure
SSO_3_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SSO_3_CLIENT_SECRET=your-client-secret
SSO_3_DISCOVERY_URL=https://login.microsoftonline.com/<tenant>/v2.0/.well-known/openid-configuration
SSO_3_SCOPES=openid,email,profile
```

Register the app at <https://entra.microsoft.com/> under "App registrations" and add the redirect URI reported by the SSO admin page.

#### 2.3.4 Discord (OAuth 2.0)

```bash
SSO_4_KIND=oauth2
SSO_4_SLUG=discord
SSO_4_DISPLAY_NAME=Discord
SSO_4_ICON=simple-icons:discord
SSO_4_CLIENT_ID=xxxxxxxxxxxxxxxxxx
SSO_4_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SSO_4_AUTHORIZATION_URL=https://discord.com/oauth2/authorize
SSO_4_TOKEN_URL=https://discord.com/api/oauth2/token
SSO_4_USERINFO_URL=https://discord.com/api/users/@me
SSO_4_SCOPES=identify,email
SSO_4_EMAIL_CLAIM=email
SSO_4_USERNAME_CLAIM=username
SSO_4_SUB_CLAIM=id
```

Register the app at <https://discord.com/developers/applications> and add the redirect URI as an OAuth2 redirect.

#### 2.3.5 GitLab (OIDC, works self-hosted)

```bash
SSO_5_KIND=oidc
SSO_5_SLUG=gitlab
SSO_5_DISPLAY_NAME=GitLab
SSO_5_ICON=simple-icons:gitlab
SSO_5_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SSO_5_CLIENT_SECRET=gloas-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SSO_5_DISCOVERY_URL=https://gitlab.com/.well-known/openid-configuration
SSO_5_SCOPES=openid,email,profile
```

For a self-hosted GitLab instance, replace the discovery URL with `https://gitlab.mycorp.com/.well-known/openid-configuration`.

#### 2.3.6 Keycloak / Authentik / any generic OIDC

```bash
SSO_6_KIND=oidc
SSO_6_SLUG=corp
SSO_6_DISPLAY_NAME=Corp SSO
SSO_6_ICON=iconoir:key
SSO_6_CLIENT_ID=flowy
SSO_6_CLIENT_SECRET=super-secret
SSO_6_DISCOVERY_URL=https://sso.corp.example.com/realms/corp/.well-known/openid-configuration
SSO_6_SCOPES=openid,email,profile
SSO_6_ALLOWED_EMAIL_DOMAINS=corp.example.com
```

Adjust the realm segment for Authentik (`https://sso.corp.example.com/application/o/<slug>/.well-known/openid-configuration`) or any other OIDC-compliant IdP.

#### 2.3.7 Account linking behaviour

- Flowy does not verify emails at sign-up, so **SSO identities are never auto-linked to an existing Flowy account by email**. Instead, if a user signs in via SSO with an email that already exists, they are asked to sign in with their password and link the SSO identity manually from `Settings > Profile > Linked accounts`.
- If `ALLOW_SIGNUP=true` **and** the global `REGISTRATION_ENABLED` flag is on, a new account is created transparently on first SSO login. The username is derived from the provider's username claim (falling back to the local part of the email) with a numeric suffix if it collides.
- Users who have enabled MFA on Flowy still see the MFA challenge after a successful SSO login. SSO does not bypass MFA.
- An account created through SSO has no password. Its owner can add a password later from `Settings > Profile > Security`.

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
