-- AlterTable
ALTER TABLE "user_categories" ADD COLUMN     "auto_complete_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "primary_keyword" VARCHAR(50);

-- AlterTable
ALTER TABLE "user_merchants" ADD COLUMN     "auto_complete_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "primary_keyword" VARCHAR(50);
