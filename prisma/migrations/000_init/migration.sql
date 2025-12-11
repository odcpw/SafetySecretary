-- CreateEnum
CREATE TYPE "RiskAssessmentPhase" AS ENUM ('PROCESS_STEPS', 'HAZARD_NARRATIVE', 'HAZARD_PER_STEP', 'RISK_RATING', 'CONTROLS', 'ACTIONS', 'SIGN_OFF', 'COMPLETE');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETE');

-- CreateTable
CREATE TABLE "RiskAssessmentCase" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "activityName" TEXT NOT NULL,
    "location" TEXT,
    "team" TEXT,
    "phase" "RiskAssessmentPhase" NOT NULL DEFAULT 'PROCESS_STEPS',

    CONSTRAINT "RiskAssessmentCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessStep" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "caseId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "ProcessStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hazard" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "caseId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT,
    "likelihood" TEXT,
    "riskRating" TEXT,

    CONSTRAINT "Hazard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HazardStep" (
    "hazardId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,

    CONSTRAINT "HazardStep_pkey" PRIMARY KEY ("hazardId","stepId")
);

-- CreateTable
CREATE TABLE "CorrectiveAction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "caseId" TEXT NOT NULL,
    "hazardId" TEXT,
    "description" TEXT NOT NULL,
    "owner" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "ActionStatus" NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "CorrectiveAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcessStep_caseId_idx" ON "ProcessStep"("caseId");

-- CreateIndex
CREATE INDEX "Hazard_caseId_idx" ON "Hazard"("caseId");

-- CreateIndex
CREATE INDEX "CorrectiveAction_caseId_idx" ON "CorrectiveAction"("caseId");

-- CreateIndex
CREATE INDEX "CorrectiveAction_hazardId_idx" ON "CorrectiveAction"("hazardId");

-- AddForeignKey
ALTER TABLE "ProcessStep" ADD CONSTRAINT "ProcessStep_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RiskAssessmentCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hazard" ADD CONSTRAINT "Hazard_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RiskAssessmentCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HazardStep" ADD CONSTRAINT "HazardStep_hazardId_fkey" FOREIGN KEY ("hazardId") REFERENCES "Hazard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HazardStep" ADD CONSTRAINT "HazardStep_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ProcessStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectiveAction" ADD CONSTRAINT "CorrectiveAction_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RiskAssessmentCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectiveAction" ADD CONSTRAINT "CorrectiveAction_hazardId_fkey" FOREIGN KEY ("hazardId") REFERENCES "Hazard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

