-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "budgeted_income" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgeted_categories" (
    "budget_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgeted_categories_pkey" PRIMARY KEY ("budget_id","category_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budgets_user_id_month_year_key" ON "budgets"("user_id", "month", "year");

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgeted_categories" ADD CONSTRAINT "budgeted_categories_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgeted_categories" ADD CONSTRAINT "budgeted_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "user_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheck
ALTER TABLE budgets ADD CONSTRAINT budgets_month_check CHECK (month >= 1 AND month <= 12), ADD CONSTRAINT budgets_year_check CHECK (year >= 0 AND year <= 9999), ADD CONSTRAINT budgets_budgeted_income_check CHECK (budgeted_income >= 0);

-- AddCheck
ALTER TABLE budgeted_categories ADD CONSTRAINT budgeted_categories_amount_check CHECK (amount >= 0);
