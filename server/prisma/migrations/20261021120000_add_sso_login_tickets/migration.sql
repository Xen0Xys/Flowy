-- SSO login tickets
-- The callback no longer hands the session to the frontend through cookies,
-- which never reached the frontend when it runs on another host than the API.
-- Instead it redirects with a short-lived, single-use ticket that the frontend
-- exchanges over XHR. The ticket is bound to the browser that started the flow
-- through a PKCE-style challenge (RFC 7636 S256):
--   * sso_states.client_challenge: challenge received at /start (login only).
--   * sso_login_tickets: SHA-256 of the ticket, owner and challenge to verify.

-- AlterTable
ALTER TABLE "sso_states" ADD COLUMN "client_challenge" VARCHAR(64);

-- CreateTable
CREATE TABLE "sso_login_tickets" (
    "id" VARCHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "client_challenge" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sso_login_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sso_login_tickets_user_id_idx" ON "sso_login_tickets"("user_id");

-- CreateIndex
CREATE INDEX "sso_login_tickets_expires_at_idx" ON "sso_login_tickets"("expires_at");

-- AddForeignKey
ALTER TABLE "sso_login_tickets" ADD CONSTRAINT "sso_login_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
