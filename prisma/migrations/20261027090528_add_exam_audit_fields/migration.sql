-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "closedById" TEXT,
ADD COLUMN     "publishedById" TEXT;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
