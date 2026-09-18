-- MFA (TOTP + backup codes + passkeys + challenge tokens)
-- Adds an aggregate `mfa_enabled` flag on Users (fast-path for the login gate)
-- and dedicated tables so future factors can be added as additive tables
-- without a destructive migration.
--
-- Also drops the redundant user_settings_user_id_key index inherited from
-- the init migration: user_settings.user_id is already the primary key,
-- so the extra unique b-tree was a no-op duplicate.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "mfa_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "user_totp_secrets" (
    "user_id" UUID NOT NULL,
    "encrypted_secret" TEXT,
    "pending_secret" TEXT,
    "last_used_step" BIGINT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_totp_secrets_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "mfa_backup_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_backup_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mfa_backup_codes_user_id_idx" ON "mfa_backup_codes"("user_id");

-- AddForeignKey
ALTER TABLE "user_totp_secrets" ADD CONSTRAINT "user_totp_secrets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_backup_codes" ADD CONSTRAINT "mfa_backup_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Passkeys (WebAuthn) as an additive MFA factor alongside TOTP and backup codes.

-- CreateTable
CREATE TABLE "user_passkeys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "device_type" TEXT NOT NULL,
    "backed_up" BOOLEAN NOT NULL DEFAULT false,
    "label" VARCHAR(50) NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_passkeys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_passkeys_credential_id_key" ON "user_passkeys"("credential_id");

-- CreateIndex
CREATE INDEX "user_passkeys_user_id_idx" ON "user_passkeys"("user_id");

-- AddForeignKey
ALTER TABLE "user_passkeys" ADD CONSTRAINT "user_passkeys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "webauthn_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "challenge" TEXT NOT NULL,
    "purpose" VARCHAR(20) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webauthn_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webauthn_challenges_user_id_purpose_key" ON "webauthn_challenges"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "webauthn_challenges_expires_at_idx" ON "webauthn_challenges"("expires_at");

-- AddForeignKey
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MFA challenge tokens (single-use, attempt-bounded)
-- Backs the JWT `jti` used at MFA verify time so a challenge can be:
--   - deleted on first successful verification (single-use)
--   - decremented on every failed attempt and deleted when exhausted
-- Prevents brute-force and replay of a captured challenge token.

-- CreateTable
CREATE TABLE "mfa_challenge_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "attempts_remaining" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_challenge_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mfa_challenge_tokens_user_id_idx" ON "mfa_challenge_tokens"("user_id");

-- CreateIndex
CREATE INDEX "mfa_challenge_tokens_expires_at_idx" ON "mfa_challenge_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "mfa_challenge_tokens" ADD CONSTRAINT "mfa_challenge_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop the redundant user_settings_user_id_key index (Q5 review finding).
-- user_settings.user_id is already the primary key; the extra unique b-tree
-- created by the init migration is a duplicate. IF EXISTS makes it safe on
-- fresh databases that will never see the previous index.
DROP INDEX IF EXISTS "user_settings_user_id_key";
