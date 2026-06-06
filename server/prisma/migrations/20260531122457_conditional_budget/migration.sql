-- AlterTable
ALTER TABLE "accounts" ADD COLUMN "in_budget" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: add as nullable first to allow backfilling before applying NOT NULL constraint
ALTER TABLE "transactions" ADD COLUMN "in_budget" BOOLEAN;

-- Regular transactions: true
UPDATE "transactions" SET "in_budget" = true
WHERE "is_rebalance" = false
  AND id NOT IN (
    SELECT debit_transaction_id FROM "transfers"
    UNION
    SELECT credit_transaction_id FROM "transfers"
);

-- Rebalances and transfers: false
UPDATE "transactions" SET "in_budget" = false
WHERE "is_rebalance" = true
   OR id IN (
    SELECT debit_transaction_id FROM "transfers"
    UNION
    SELECT credit_transaction_id FROM "transfers"
);

-- Apply NOT NULL constraint and default value
ALTER TABLE "transactions" ALTER COLUMN "in_budget" SET NOT NULL;
ALTER TABLE "transactions" ALTER COLUMN "in_budget" SET DEFAULT true;
