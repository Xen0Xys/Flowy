-- CreateIndex
CREATE INDEX "transactions_account_id_date_created_at_idx" ON "transactions"("account_id", "date" DESC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "transactions_date_idx" ON "transactions"("date" DESC);

-- CreateIndex
CREATE INDEX "transactions_category_id_idx" ON "transactions"("category_id");

-- CreateIndex
CREATE INDEX "transactions_merchant_id_idx" ON "transactions"("merchant_id");
