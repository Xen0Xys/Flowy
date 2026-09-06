-- Drop obsolete Accounts.in_budget column.
-- Budget scope is now defined explicitly per-budget via the budget_accounts table.

ALTER TABLE "accounts" DROP COLUMN "in_budget";
