-- CreateEnum
CREATE TYPE "share_permission" AS ENUM ('READ', 'READ_WRITE');

-- DropIndex
DROP INDEX "budgets_user_id_month_year_key";

-- CreateTable
CREATE TABLE "account_shares" (
    "account_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "permission" "share_permission" NOT NULL,

    CONSTRAINT "account_shares_pkey" PRIMARY KEY ("account_id","user_id")
);

-- CreateTable
CREATE TABLE "category_mappings" (
    "shared_user_id" UUID NOT NULL,
    "their_category_id" UUID NOT NULL,
    "owner_category_id" UUID NOT NULL,

    CONSTRAINT "category_mappings_pkey" PRIMARY KEY ("shared_user_id","their_category_id")
);

-- CreateTable
CREATE TABLE "budget_accounts" (
    "budget_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,

    CONSTRAINT "budget_accounts_pkey" PRIMARY KEY ("budget_id","account_id")
);

-- CreateTable
CREATE TABLE "budget_shares" (
    "budget_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "budget_shares_pkey" PRIMARY KEY ("budget_id","user_id")
);

-- AddForeignKey
ALTER TABLE "account_shares" ADD CONSTRAINT "account_shares_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_shares" ADD CONSTRAINT "account_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_mappings" ADD CONSTRAINT "category_mappings_shared_user_id_fkey" FOREIGN KEY ("shared_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_mappings" ADD CONSTRAINT "category_mappings_their_category_id_fkey" FOREIGN KEY ("their_category_id") REFERENCES "user_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_mappings" ADD CONSTRAINT "category_mappings_owner_category_id_fkey" FOREIGN KEY ("owner_category_id") REFERENCES "user_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_accounts" ADD CONSTRAINT "budget_accounts_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_accounts" ADD CONSTRAINT "budget_accounts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_shares" ADD CONSTRAINT "budget_shares_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_shares" ADD CONSTRAINT "budget_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add name as nullable first
ALTER TABLE "budgets" ADD COLUMN "name" TEXT;

-- DataMigration: name budgets from month/year
UPDATE "budgets" SET name = CONCAT('Budget ', month, '/', year) WHERE name IS NULL OR name = '';

-- DataMigration: link existing in_budget accounts to budgets
INSERT INTO "budget_accounts" (budget_id, account_id)
SELECT b.id, a.id
FROM "budgets" b
JOIN "accounts" a ON a.user_id = b.user_id AND a.in_budget = true;

-- AlterTable: make name NOT NULL now that all rows are populated
ALTER TABLE "budgets" ALTER COLUMN "name" SET NOT NULL;

-- AlterTable: drop in_budget from accounts
ALTER TABLE "accounts" DROP COLUMN "in_budget";
