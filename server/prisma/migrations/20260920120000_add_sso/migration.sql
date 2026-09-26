-- SSO (OAuth 2.0 / OIDC) support
-- Providers are configured entirely via environment variables (SSO_1_*, SSO_2_*,...)
-- so no provider table exists here. Only the two runtime tables:
--   * user_sso_identities: durable link between a Flowy user and a provider
--     identity (subject).
--   * sso_states: short-lived state store for the OAuth2/OIDC redirect flow
--     (nonce + PKCE code_verifier + optional link_user_id when linking from
--     the settings page).
--
-- Also makes users.password nullable so an SSO-only account can exist without
-- a password. The application layer enforces that a user must always retain
-- at least one authentication factor (password OR at least one SSO identity).

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;

-- CreateTable
CREATE TABLE "user_sso_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider_slug" VARCHAR(64) NOT NULL,
    "provider_user_id" VARCHAR(255) NOT NULL,
    "email_at_link" VARCHAR(320),
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "user_sso_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_sso_identities_provider_slug_provider_user_id_key" ON "user_sso_identities"("provider_slug", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sso_identities_user_id_provider_slug_key" ON "user_sso_identities"("user_id", "provider_slug");

-- CreateIndex
CREATE INDEX "user_sso_identities_user_id_idx" ON "user_sso_identities"("user_id");

-- AddForeignKey
ALTER TABLE "user_sso_identities" ADD CONSTRAINT "user_sso_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "sso_states" (
    "id" VARCHAR(64) NOT NULL,
    "provider_slug" VARCHAR(64) NOT NULL,
    "code_verifier" VARCHAR(128) NOT NULL,
    "nonce" VARCHAR(64),
    "purpose" VARCHAR(16) NOT NULL,
    "link_user_id" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sso_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sso_states_expires_at_idx" ON "sso_states"("expires_at");

-- AddForeignKey
ALTER TABLE "sso_states" ADD CONSTRAINT "sso_states_link_user_id_fkey" FOREIGN KEY ("link_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
