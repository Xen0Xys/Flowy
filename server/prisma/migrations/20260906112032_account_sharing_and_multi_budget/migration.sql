-- Account sharing + multi-budget + drop obsolete Accounts.in_budget.
-- Combines three moves into a single migration:
--   1. Introduce AccountShares (read/write permission per family member).
--   2. Introduce BudgetAccounts + Budgets.name and drop the single-budget-per-month unique.
--   3. Drop Accounts.in_budget now that each budget defines its own account scope.

-- CreateEnum
CREATE TYPE "account_share_permissions" AS ENUM ('READ', 'WRITE');

-- DropIndex
DROP INDEX "budgets_user_id_month_year_key";

-- AlterTable
ALTER TABLE "budgets" ADD COLUMN     "name" VARCHAR(50);

-- CreateTable
CREATE TABLE "account_shares" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "shared_with_id" UUID NOT NULL,
    "permission" "account_share_permissions" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_accounts" (
    "budget_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_accounts_pkey" PRIMARY KEY ("budget_id","account_id")
);

-- CreateIndex
CREATE INDEX "account_shares_shared_with_id_idx" ON "account_shares"("shared_with_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_shares_account_id_shared_with_id_key" ON "account_shares"("account_id", "shared_with_id");

-- CreateIndex
CREATE INDEX "budget_accounts_account_id_idx" ON "budget_accounts"("account_id");

-- CreateIndex
CREATE INDEX "budgets_user_id_year_month_idx" ON "budgets"("user_id", "year", "month");

-- AddForeignKey
ALTER TABLE "account_shares" ADD CONSTRAINT "account_shares_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_shares" ADD CONSTRAINT "account_shares_shared_with_id_fkey" FOREIGN KEY ("shared_with_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_accounts" ADD CONSTRAINT "budget_accounts_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_accounts" ADD CONSTRAINT "budget_accounts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: link every existing budget to all in-budget accounts owned by the budget owner
-- so the pre-migration behavior of BudgetService.getSpending (implicitly scoped to
-- `accounts WHERE user_id = budget.user_id AND in_budget = true`) is preserved.
-- The subsequent DROP COLUMN then removes the now-redundant flag.
INSERT INTO "budget_accounts" ("budget_id", "account_id")
SELECT b."id", a."id"
FROM "budgets" b
JOIN "accounts" a ON a."user_id" = b."user_id" AND a."in_budget" = true
ON CONFLICT DO NOTHING;

-- AlterTable
ALTER TABLE "accounts" DROP COLUMN "in_budget";
