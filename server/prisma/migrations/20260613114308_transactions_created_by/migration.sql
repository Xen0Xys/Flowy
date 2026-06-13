-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "created_by_id" UUID;

-- Seed existing transactions
UPDATE "transactions" t
SET "created_by_id" = a."user_id"
FROM "accounts" a
WHERE a."id" = t."account_id"
  AND t."created_by_id" IS NULL;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
