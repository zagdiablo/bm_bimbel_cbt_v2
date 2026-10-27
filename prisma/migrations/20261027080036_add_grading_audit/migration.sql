-- AlterTable
ALTER TABLE "answers" ADD COLUMN     "gradedAt" TIMESTAMP(3),
ADD COLUMN     "gradedById" TEXT;

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "gradedById" TEXT;

-- CreateIndex
CREATE INDEX "answers_gradedById_idx" ON "answers"("gradedById");

-- CreateIndex
CREATE INDEX "attempts_status_submittedAt_idx" ON "attempts"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "attempts_gradedById_idx" ON "attempts"("gradedById");

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
