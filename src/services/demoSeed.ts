import { ControlHierarchy, RiskAssessmentPhase } from "../types/riskAssessment";
import { IncidentActionType, IncidentTimelineConfidence, IncidentType } from "../types/incident";
import type { TenantDbManager } from "./tenantDbManager";
import type { TenantServiceFactory } from "./tenantServiceFactory";
import type { RiskAssessmentService } from "./raService";
import type { JhaService } from "./jhaService";
import type { IncidentService } from "./incidentService";

export type DemoSeedResult = {
  cleared: {
    riskAssessments: number;
    jhas: number;
    incidents: number;
  };
  seeded: {
    raCaseId: string;
    jhaCaseId: string;
    incidentCaseId: string;
  };
};

type DemoSeedInput = {
  tenantDbManager: TenantDbManager;
  tenantServiceFactory: TenantServiceFactory;
  connectionString: string;
  createdBy?: string | null;
};

const seedRiskAssessmentCase = async (
  raService: RiskAssessmentService,
  createdBy?: string | null
): Promise<string> => {
  const raCase = await raService.createCase({
    activityName: "Replace hydraulic hose on forklift",
    location: "Loading bay 3",
    team: "Maintenance",
    createdBy: createdBy ?? undefined
  });

  const raWithSteps = await raService.updateSteps(raCase.id, [
    {
      activity: "Lockout forklift and chock wheels",
      equipment: ["Lockout kit", "Wheel chocks"],
      substances: [],
      description: "Isolate power and prevent movement."
    },
    {
      activity: "Drain hydraulic line and remove hose",
      equipment: ["Wrenches", "Drain pan"],
      substances: ["Hydraulic oil"],
      description: "Capture fluid and prevent spills."
    },
    {
      activity: "Install new hose and pressure test",
      equipment: ["Torque wrench", "Pressure gauge"],
      substances: ["Hydraulic oil"],
      description: "Reconnect and verify the system holds pressure."
    }
  ]);

  if (!raWithSteps || raWithSteps.steps.length < 3) {
    throw new Error("Demo seed failed: unable to create risk assessment steps.");
  }

  const [stepOne, stepTwo, stepThree] = raWithSteps.steps;
  const hazardOne = await raService.addManualHazard(raCase.id, {
    stepId: stepOne.id,
    label: "Unexpected movement",
    description: "Forklift shifts while technician is working.",
    categoryCode: "MECHANICAL",
    existingControls: ["Lockout/tagout", "Wheel chocks"]
  });
  const hazardTwo = await raService.addManualHazard(raCase.id, {
    stepId: stepTwo.id,
    label: "Hydraulic spill",
    description: "Oil leaks create slip and skin-contact risk.",
    categoryCode: "CHEMICAL",
    existingControls: ["Drain pan", "Spill kit"]
  });
  const hazardThree = await raService.addManualHazard(raCase.id, {
    stepId: stepThree.id,
    label: "High-pressure leak",
    description: "Hose failure during testing can spray fluid.",
    categoryCode: "PRESSURE",
    existingControls: ["Stand clear during test", "Use pressure relief valve"]
  });

  if (!hazardOne || !hazardTwo || !hazardThree) {
    throw new Error("Demo seed failed: unable to create hazards.");
  }

  await raService.setHazardRiskRatings(raCase.id, [
    { hazardId: hazardOne.id, severity: "C", likelihood: "3" },
    { hazardId: hazardTwo.id, severity: "D", likelihood: "2" },
    { hazardId: hazardThree.id, severity: "C", likelihood: "2" }
  ]);

  await raService.addProposedControls(raCase.id, [
    {
      hazardId: hazardOne.id,
      description: "Add lockout verification checklist before maintenance.",
      hierarchy: ControlHierarchy.ORGANIZATIONAL
    },
    {
      hazardId: hazardTwo.id,
      description: "Place absorbent mats under the hydraulic line.",
      hierarchy: ControlHierarchy.TECHNICAL
    },
    {
      hazardId: hazardThree.id,
      description: "Install a guarded pressure gauge for testing.",
      hierarchy: ControlHierarchy.TECHNICAL
    }
  ]);

  await raService.updateCaseMeta(raCase.id, { phase: RiskAssessmentPhase.CONTROL_DISCUSSION });

  return raCase.id;
};

const seedJhaCase = async (jhaService: JhaService, createdBy?: string | null): Promise<string> => {
  const jhaCase = await jhaService.createCase({
    jobTitle: "Confined space inspection",
    site: "Plant 2 - utility pit",
    supervisor: "Morgan Lee",
    workersInvolved: "Maintenance team",
    jobDate: new Date().toISOString(),
    preparedBy: "Safety lead",
    reviewedBy: "Operations manager",
    workflowStage: "review",
    createdBy: createdBy ?? undefined
  });

  const jhaWithSteps = await jhaService.updateSteps(jhaCase.id, [
    { label: "Isolate and ventilate the space" },
    { label: "Test atmosphere and enter" },
    { label: "Inspect equipment and document findings" },
    { label: "Exit, remove lockout, and restore area" }
  ]);

  if (!jhaWithSteps || jhaWithSteps.steps.length < 4) {
    throw new Error("Demo seed failed: unable to create JHA steps.");
  }

  const [jhaStepOne, jhaStepTwo, jhaStepThree] = jhaWithSteps.steps;
  await jhaService.updateHazards(jhaCase.id, [
    {
      stepId: jhaStepOne.id,
      hazard: "Oxygen deficiency",
      consequence: "Loss of consciousness or asphyxiation",
      controls: ["Ventilate before entry", "Confined space permit", "Continuous gas monitor"]
    },
    {
      stepId: jhaStepTwo.id,
      hazard: "Slip and trip hazards",
      consequence: "Falls or sprains",
      controls: ["Clear debris", "Non-slip boots", "Maintain three-point contact"]
    },
    {
      stepId: jhaStepThree.id,
      hazard: "Electrical contact",
      consequence: "Electric shock or burns",
      controls: ["Verify lockout", "Use insulated tools", "Wear rubber gloves"]
    }
  ]);

  return jhaCase.id;
};

const seedIncidentCase = async (incidentService: IncidentService, createdBy?: string | null): Promise<string> => {
  const incidentCase = await incidentService.createCase({
    title: "Near miss with pallet jack",
    incidentAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    incidentTimeNote: "Morning shift",
    location: "Warehouse aisle 4",
    incidentType: IncidentType.NEAR_MISS,
    coordinatorRole: "Safety lead",
    coordinatorName: "Jamie Patel",
    createdBy: createdBy ?? undefined
  });

  const person = await incidentService.addPerson(incidentCase.id, {
    role: "Forklift operator",
    name: "Alex Rivera"
  });

  const account = person
    ? await incidentService.addAccount(
        incidentCase.id,
        person.id,
        "I reversed out of the rack and a pallet jack had been left in the aisle."
      )
    : null;

  if (account) {
    await incidentService.replaceAccountFacts(incidentCase.id, account.id, [
      { text: "Pallet jack left in aisle 4 without a spotter." },
      { text: "Operator had limited visibility while reversing." }
    ]);
    await incidentService.replaceAccountPersonalEvents(incidentCase.id, account.id, [
      { timeLabel: "09:05", text: "Finished loading pallet and began to reverse." },
      { timeLabel: "09:06", text: "Stopped just before hitting the pallet jack." }
    ]);
  }

  const incidentWithTimeline = await incidentService.updateTimelineEvents(incidentCase.id, [
    {
      timeLabel: "09:03",
      text: "Pallet jack was left unattended in aisle 4.",
      confidence: IncidentTimelineConfidence.LIKELY
    },
    {
      timeLabel: "09:06",
      text: "Forklift reversed and stopped before the pallet jack.",
      confidence: IncidentTimelineConfidence.CONFIRMED
    }
  ]);

  const timelineEventId = incidentWithTimeline?.timelineEvents[1]?.id ?? incidentWithTimeline?.timelineEvents[0]?.id;
  const incidentWithDeviation = timelineEventId
    ? await incidentService.updateDeviations(incidentCase.id, [
        {
          timelineEventId,
          expected: "Aisle clear before reversing.",
          actual: "Pallet jack left in path.",
          changeObserved: "Obstacle introduced during shift change."
        }
      ])
    : incidentWithTimeline;

  const deviationId = incidentWithDeviation?.deviations[0]?.id;
  const incidentWithCause = deviationId
    ? await incidentService.updateCauses(incidentCase.id, [
        { deviationId, statement: "Housekeeping checks were skipped at shift handover." }
      ])
    : incidentWithDeviation;

  const causeId = incidentWithCause?.deviations[0]?.causes[0]?.id;
  if (causeId) {
    await incidentService.updateActions(incidentCase.id, [
      {
        causeId,
        description: "Reinforce aisle check checklist at every shift change.",
        ownerRole: "Warehouse supervisor",
        actionType: IncidentActionType.TRAINING
      }
    ]);
  }

  return incidentCase.id;
};

export const resetDemoData = async ({
  tenantDbManager,
  tenantServiceFactory,
  connectionString,
  createdBy
}: DemoSeedInput): Promise<DemoSeedResult> => {
  const db = tenantDbManager.getClient(connectionString);
  const [raCleared, jhaCleared, incidentCleared] = await db.$transaction([
    db.riskAssessmentCase.deleteMany(),
    db.jhaCase.deleteMany(),
    db.incidentCase.deleteMany()
  ]);

  const { raService, jhaService, incidentService } = tenantServiceFactory.getServices(connectionString);
  const raCaseId = await seedRiskAssessmentCase(raService, createdBy);
  const jhaCaseId = await seedJhaCase(jhaService, createdBy);
  const incidentCaseId = await seedIncidentCase(incidentService, createdBy);

  return {
    cleared: {
      riskAssessments: raCleared.count,
      jhas: jhaCleared.count,
      incidents: incidentCleared.count
    },
    seeded: {
      raCaseId,
      jhaCaseId,
      incidentCaseId
    }
  };
};

export const seedDemoRiskAssessment = async (raService: RiskAssessmentService, createdBy?: string | null) =>
  seedRiskAssessmentCase(raService, createdBy);

export const seedDemoJha = async (jhaService: JhaService, createdBy?: string | null) =>
  seedJhaCase(jhaService, createdBy);

export const seedDemoIncident = async (incidentService: IncidentService, createdBy?: string | null) =>
  seedIncidentCase(incidentService, createdBy);
