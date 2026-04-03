-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL,
    "debit_transaction_id" UUID NOT NULL,
    "credit_transaction_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transfers_debit_transaction_id_key" ON "transfers"("debit_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_credit_transaction_id_key" ON "transfers"("credit_transaction_id");

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_debit_transaction_id_fkey" FOREIGN KEY ("debit_transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_credit_transaction_id_fkey" FOREIGN KEY ("credit_transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheck
ALTER TABLE "transfers" ADD CONSTRAINT "transfer_debit_neq_credit" CHECK ("debit_transaction_id" != "credit_transaction_id");
