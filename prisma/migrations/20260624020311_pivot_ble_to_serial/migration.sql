/*
  Warnings:

  - You are about to alter the column `clientTimestamp` on the `EventLog` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `BigInt`.
  - You are about to drop the `EmgSample` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "Phase" AS ENUM ('PREPARATION', 'ACTION', 'REST');

-- DropForeignKey
ALTER TABLE "EmgSample" DROP CONSTRAINT "EmgSample_sessionId_fkey";

-- AlterTable
ALTER TABLE "EventLog" ALTER COLUMN "clientTimestamp" SET DATA TYPE BIGINT;

-- DropTable
DROP TABLE "EmgSample";

-- CreateTable
CREATE TABLE "EmgRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sampleIndex" INTEGER NOT NULL,
    "elapsedMs" INTEGER NOT NULL,
    "phase" "Phase" NOT NULL,
    "isTransition" BOOLEAN NOT NULL DEFAULT false,
    "r1" DOUBLE PRECISION NOT NULL,
    "r2" DOUBLE PRECISION NOT NULL,
    "r3" DOUBLE PRECISION NOT NULL,
    "r4" DOUBLE PRECISION NOT NULL,
    "r5" DOUBLE PRECISION NOT NULL,
    "r6" DOUBLE PRECISION NOT NULL,
    "p1" DOUBLE PRECISION NOT NULL,
    "p2" DOUBLE PRECISION NOT NULL,
    "p3" DOUBLE PRECISION NOT NULL,
    "p4" DOUBLE PRECISION NOT NULL,
    "p5" DOUBLE PRECISION NOT NULL,
    "p6" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmgRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmgRecord_sessionId_phase_idx" ON "EmgRecord"("sessionId", "phase");

-- CreateIndex
CREATE INDEX "EmgRecord_sessionId_sampleIndex_idx" ON "EmgRecord"("sessionId", "sampleIndex");

-- AddForeignKey
ALTER TABLE "EmgRecord" ADD CONSTRAINT "EmgRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
