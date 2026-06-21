-- CreateTable
CREATE TABLE "EmgSample" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "deviceTimestampUs" BIGINT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" DOUBLE PRECISION[],
    "envelope" DOUBLE PRECISION[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmgSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmgSample_sessionId_deviceTimestampUs_idx" ON "EmgSample"("sessionId", "deviceTimestampUs");

-- AddForeignKey
ALTER TABLE "EmgSample" ADD CONSTRAINT "EmgSample_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
