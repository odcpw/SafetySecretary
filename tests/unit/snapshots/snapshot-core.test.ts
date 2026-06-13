import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type {
	ApprovalSnapshotRow,
	CreateApprovalSnapshotInput,
	SnapshotApprovalStore,
	SnapshotApprovalTransaction,
	SnapshotTransactionOptions,
} from "../../../src/lib/snapshots/approve";
import type {
	IncidentWorkflowRow,
	WorkflowSerialiseStore,
} from "../../../src/lib/snapshots/serialise";
import type { ApprovalWorkflowType } from "../../../src/lib/snapshots/types";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			specifier === "./serialise" &&
			context.parentURL?.endsWith("/src/lib/snapshots/approve.ts")
		) {
			return localModuleUrl("src/lib/snapshots/serialise.ts");
		}

		return nextResolve(specifier, context);
	},
});

const serialiseModulePath = localModuleHref("src/lib/snapshots/serialise.ts");
const approveModulePath = localModuleHref("src/lib/snapshots/approve.ts");
const guardModulePath = localModuleHref("src/lib/snapshots/guard.ts");

test("serialiseWorkflow returns byte-equal deterministic II JSON", async () => {
	const { serialiseWorkflow } = (await import(
		serialiseModulePath
	)) as typeof import("../../../src/lib/snapshots/serialise");
	const store = new MemorySerialiseStore(baseIncidentWorkflow());

	const first = await serialiseWorkflow("II", CASE_ID, { store });
	const second = await serialiseWorkflow("II", CASE_ID, { store });

	assert.equal(JSON.stringify(first), JSON.stringify(second));
	assert.deepEqual(
		first.persons.map((person) => record(person).id),
		[PERSON_A_ID, PERSON_B_ID],
	);
	assert.deepEqual(
		first.timelineEvents.map((event) => record(event).id),
		[TIMELINE_A_ID, TIMELINE_B_ID],
	);
	const firstTimelineAttachments = recordArray(
		record(first.timelineEvents[0]).attachments,
	);
	assert.equal(firstTimelineAttachments[0].sizeBytes, "4200");
	assert.doesNotMatch(
		JSON.stringify(first),
		/"incidentCase"|"timelineEvent"|"causeNode"|"account":/,
	);
});

test("approve writes immutable v01 and v02 snapshots and links artifacts", async () => {
	const { approve } = (await import(
		approveModulePath
	)) as typeof import("../../../src/lib/snapshots/approve");
	const store = new MemoryApprovalStore(baseIncidentWorkflow());
	store.tx.artifacts = [
		{
			id: ARTIFACT_B_ID,
			workflowType: "II",
			iiCaseId: CASE_ID,
			outputType: "summary_docx",
			versionSeq: 2,
			generatedAt: new Date("2026-04-30T10:02:00.000Z"),
			storageKey: "tenants/t/ii/summary-v02.docx",
			filename: "summary-v02.docx",
			isSnapshotLinked: false,
		},
		{
			id: ARTIFACT_A_ID,
			workflowType: "II",
			iiCaseId: CASE_ID,
			outputType: "summary_docx",
			versionSeq: 1,
			generatedAt: new Date("2026-04-30T10:01:00.000Z"),
			storageKey: "tenants/t/ii/summary-v01.docx",
			filename: "summary-v01.docx",
			isSnapshotLinked: false,
		},
	];
	store.tx.attachments = [
		{
			id: ATTACHMENT_B_ID,
			eventId: TIMELINE_B_ID,
			caseId: CASE_ID,
			storageKey: "tenants/t/ii/photo-b.jpg",
			filename: "photo-b.jpg",
			createdAt: new Date("2026-04-30T10:05:00.000Z"),
		},
		{
			id: ATTACHMENT_A_ID,
			eventId: TIMELINE_A_ID,
			caseId: CASE_ID,
			storageKey: "tenants/t/ii/photo-a.jpg",
			filename: "photo-a.jpg",
			createdAt: new Date("2026-04-30T10:04:00.000Z"),
		},
	];

	const v01 = await approve(CASE_ID, "II", APPROVER_ID, {
		store,
		now: new Date("2026-04-30T12:00:00.000Z"),
	});
	const v01WorkflowJson = JSON.stringify(v01.workflowData);
	store.tx.workflow.title = "Edited title after v01";
	const v02 = await approve(CASE_ID, "II", APPROVER_ID, {
		store,
		now: new Date("2026-04-30T12:30:00.000Z"),
	});

	assert.equal(store.transactionCalls, 2);
	assert.deepEqual(store.lastTransactionOptions, {
		isolationLevel: "Serializable",
		timeout: 15_000,
	});
	assert.equal(v01.versionLabel, "v01");
	assert.equal(v02.versionLabel, "v02");
	assert.equal(record(v01.workflowData.case).title, "Original incident");
	assert.equal(record(v02.workflowData.case).title, "Edited title after v01");
	assert.equal(JSON.stringify(v01.workflowData), v01WorkflowJson);
	assert.deepEqual(
		v01.artifactRefs.map((ref) => ref.artifactId),
		[ARTIFACT_A_ID, ARTIFACT_B_ID],
	);
	assert.deepEqual(v01.attachmentRefs, [
		{
			attachmentId: ATTACHMENT_A_ID,
			storageKey: "tenants/t/ii/photo-a.jpg",
			filename: "photo-a.jpg",
			parentType: "incident_timeline_event",
			parentId: TIMELINE_A_ID,
		},
		{
			attachmentId: ATTACHMENT_B_ID,
			storageKey: "tenants/t/ii/photo-b.jpg",
			filename: "photo-b.jpg",
			parentType: "incident_timeline_event",
			parentId: TIMELINE_B_ID,
		},
	]);
	assert.deepEqual(
		store.tx.artifacts.map((artifact) => artifact.isSnapshotLinked),
		[true, true],
	);
});

test("write-once guard exposes no update/delete API and throws typed errors", async () => {
	const guardModule = (await import(
		guardModulePath
	)) as typeof import("../../../src/lib/snapshots/guard");

	assert.equal("updateSnapshot" in guardModule, false);
	assert.equal("deleteSnapshot" in guardModule, false);
	assert.throws(
		() => guardModule.guardSnapshotMutation("update", SNAPSHOT_ID),
		(error: unknown) =>
			error instanceof guardModule.SnapshotImmutableError &&
			error.code === "snapshot_immutable" &&
			error.action === "update" &&
			error.snapshotId === SNAPSHOT_ID,
	);
});

test("source guard detects raw SQL approval_snapshot mutations", () => {
	const probes = [
		{
			label: "$executeRawUnsafe string",
			source: `
				export async function cod3RawSnapshotMutationProbe(client: {
					$executeRawUnsafe(sql: string): Promise<unknown>;
				}): Promise<void> {
					await client.$executeRawUnsafe(
						"UPDATE approval_snapshot SET version_label = version_label",
					);
				}
			`,
		},
		{
			label: "$executeRaw tagged template",
			source: `
				await prisma.$executeRaw\`
					DELETE FROM "approval_snapshot" WHERE id = \${snapshotId}
				\`;
			`,
		},
		{
			label: "Prisma.sql tagged template",
			source: `
				const statement = Prisma.sql\`
					TRUNCATE TABLE tenant_abc."approval_snapshot"
				\`;
			`,
		},
		{
			label: "sql tagged template",
			source: `
				const statement = sql\`
					ALTER TABLE "tenant_abc"."approval_snapshot" ADD COLUMN bad text
				\`;
			`,
		},
	];

	for (const probe of probes) {
		assert.notDeepEqual(
			directSnapshotMutations(probe.source),
			[],
			`${probe.label} probe should be rejected`,
		);
	}

	assert.deepEqual(
		directSnapshotMutations(
			"await client.$executeRawUnsafe('UPDATE generated_artifact SET is_snapshot_linked = true')",
		),
		[],
	);
});

test("source guard blocks direct snapshot mutations outside snapshot module", () => {
	const offenders = scanSourceFiles(path.resolve("src"))
		.filter(
			(filePath) => !relativeUnix(filePath).startsWith("src/lib/snapshots/"),
		)
		.flatMap((filePath) => {
			const source = readFileSync(filePath, "utf8");
			return directSnapshotMutations(source).map(
				(match) => `${relativeUnix(filePath)}: ${match}`,
			);
		});

	assert.deepEqual(offenders, []);
});

class MemorySerialiseStore implements WorkflowSerialiseStore {
	private readonly workflow: IncidentWorkflowRow;

	constructor(workflow: IncidentWorkflowRow) {
		this.workflow = workflow;
	}

	async findIncidentWorkflow(
		caseId: string,
	): Promise<IncidentWorkflowRow | null> {
		return caseId === this.workflow.id ? cloneWorkflow(this.workflow) : null;
	}
}

class MemoryApprovalStore implements SnapshotApprovalStore {
	readonly tx: MemoryApprovalTransaction;
	transactionCalls = 0;
	lastTransactionOptions: SnapshotTransactionOptions | undefined;

	constructor(workflow: IncidentWorkflowRow) {
		this.tx = new MemoryApprovalTransaction(workflow);
	}

	async transaction<T>(
		fn: (tx: SnapshotApprovalTransaction) => Promise<T>,
		options?: SnapshotTransactionOptions,
	): Promise<T> {
		this.transactionCalls += 1;
		this.lastTransactionOptions = structuredClone(options);
		return fn(this.tx);
	}
}

class MemoryApprovalTransaction implements SnapshotApprovalTransaction {
	workflow: IncidentWorkflowRow;
	artifacts: MemoryGeneratedArtifact[] = [];
	attachments: MemoryAttachment[] = [];
	readonly snapshots: ApprovalSnapshotRow[] = [];

	constructor(workflow: IncidentWorkflowRow) {
		this.workflow = workflow;
	}

	async findIncidentWorkflow(
		caseId: string,
	): Promise<IncidentWorkflowRow | null> {
		return caseId === this.workflow.id ? cloneWorkflow(this.workflow) : null;
	}

	async findGeneratedArtifactRefs(
		workflowType: ApprovalWorkflowType,
		caseId: string,
	) {
		return this.artifacts
			.filter(
				(artifact) =>
					artifact.workflowType === workflowType &&
					artifact.iiCaseId === caseId,
			)
			.sort(
				(left, right) =>
					[
						left.outputType.localeCompare(right.outputType),
						left.versionSeq - right.versionSeq,
						left.generatedAt.getTime() - right.generatedAt.getTime(),
						left.id.localeCompare(right.id),
					].find((result) => result !== 0) ?? 0,
			)
			.map((artifact) => ({
				artifactId: artifact.id,
				outputType: artifact.outputType,
				storageKey: artifact.storageKey,
				filename: artifact.filename,
			}));
	}

	async findAttachmentRefs(workflowType: ApprovalWorkflowType, caseId: string) {
		if (workflowType !== "II") {
			return [];
		}

		return this.attachments
			.filter((attachment) => attachment.caseId === caseId)
			.sort(
				(left, right) =>
					left.createdAt.getTime() - right.createdAt.getTime() ||
					left.id.localeCompare(right.id),
			)
			.map((attachment) => ({
				attachmentId: attachment.id,
				storageKey: attachment.storageKey,
				filename: attachment.filename,
				parentType: "incident_timeline_event",
				parentId: attachment.eventId,
			}));
	}

	async countApprovalSnapshots(
		workflowType: ApprovalWorkflowType,
		caseId: string,
	): Promise<number> {
		return this.snapshots.filter(
			(snapshot) =>
				snapshot.workflowType === workflowType && snapshot.iiCaseId === caseId,
		).length;
	}

	async createApprovalSnapshot(
		input: CreateApprovalSnapshotInput,
	): Promise<ApprovalSnapshotRow> {
		const row: ApprovalSnapshotRow = {
			id: randomUUID(),
			workflowType: input.workflowType,
			hiraCaseId: input.workflowType === "HIRA" ? input.caseId : null,
			jhaCaseId: input.workflowType === "JHA" ? input.caseId : null,
			iiCaseId: input.workflowType === "II" ? input.caseId : null,
			versionLabel: input.versionLabel,
			approvedById: input.approvedById,
			approvedAt: input.approvedAt,
			schemaVersion: 1,
			workflowData: structuredClone(input.workflowData) as Record<
				string,
				unknown
			>,
			artifactRefs: structuredClone(input.artifactRefs),
			attachmentRefs: structuredClone(input.attachmentRefs),
		};
		this.snapshots.push(row);
		return structuredClone(row);
	}

	async markGeneratedArtifactsSnapshotLinked(
		artifactIds: readonly string[],
	): Promise<void> {
		const artifactIdSet = new Set(artifactIds);
		for (const artifact of this.artifacts) {
			if (artifactIdSet.has(artifact.id)) {
				artifact.isSnapshotLinked = true;
			}
		}
	}
}

type MemoryGeneratedArtifact = {
	id: string;
	workflowType: ApprovalWorkflowType;
	iiCaseId: string;
	outputType: string;
	versionSeq: number;
	generatedAt: Date;
	storageKey: string;
	filename: string | null;
	isSnapshotLinked: boolean;
};

type MemoryAttachment = {
	id: string;
	eventId: string;
	caseId: string;
	storageKey: string;
	filename: string | null;
	createdAt: Date;
};

const CASE_ID = "00000000-0000-4000-8000-000000000001";
const PERSON_A_ID = "00000000-0000-4000-8000-000000000011";
const PERSON_B_ID = "00000000-0000-4000-8000-000000000012";
const ACCOUNT_A_ID = "00000000-0000-4000-8000-000000000021";
const ACCOUNT_B_ID = "00000000-0000-4000-8000-000000000022";
const TIMELINE_A_ID = "00000000-0000-4000-8000-000000000031";
const TIMELINE_B_ID = "00000000-0000-4000-8000-000000000032";
const ATTACHMENT_A_ID = "00000000-0000-4000-8000-000000000041";
const ATTACHMENT_B_ID = "00000000-0000-4000-8000-000000000042";
const ARTIFACT_A_ID = "00000000-0000-4000-8000-000000000051";
const ARTIFACT_B_ID = "00000000-0000-4000-8000-000000000052";
const APPROVER_ID = "00000000-0000-4000-8000-000000000061";
const SNAPSHOT_ID = "00000000-0000-4000-8000-000000000071";

function baseIncidentWorkflow(): IncidentWorkflowRow {
	const createdAt = new Date("2026-04-30T08:00:00.000Z");
	const updatedAt = new Date("2026-04-30T09:00:00.000Z");

		return {
			id: CASE_ID,
			caseNumber: "II-2026-00000000",
			suvaCaseNumber: null,
			title: "Original incident",
			incidentAt: new Date("2026-04-29T07:30:00.000Z"),
			incidentTimeNote: null,
			location: "Packaging line",
			incidentType: "NEAR_MISS",
			actualInjuryOutcome: "NO_INJURY",
			actualSeverityCode: null,
			actualSeverityReason: null,
			potentialOutcomeText: "A worker could have been struck by the pallet jack.",
			potentialSeverityCode: "B",
			potentialLikelihoodCode: "3",
			potentialRiskBand: "MEDIUM",
			hazardCategoryCode: null,
			departmentText: null,
			areaText: null,
			workActivity: null,
			workType: null,
			eventType: null,
			processInvolved: null,
			ppeRequired: [],
			ppeWorn: [],
			injuryNature: null,
			bodyPart: null,
			lostDays: null,
			contractorFlag: null,
			timeInRoleBand: null,
			reportableUvg: null,
			controlFailure: null,
			immediateCause: null,
			contributingCauses: [],
			closedAt: null,
			coordinatorRole: "Shift lead",
		coordinatorName: "Sam Coordinator",
		workflowStage: "REVIEW",
		contentLanguage: "en",
		visionConsent: "ASK",
		hiraFollowupNeeded: true,
		hiraFollowupText: "Review pallet movement HIRA.",
		createdById: APPROVER_ID,
		createdAt,
		updatedAt,
		persons: [
			{
				id: PERSON_B_ID,
				caseId: CASE_ID,
				role: "Witness",
				name: "Bea",
				otherInfo: null,
				yearsWithCompany: null,
				createdAt,
				updatedAt,
			},
			{
				id: PERSON_A_ID,
				caseId: CASE_ID,
				role: "Injured",
				name: "Ada",
				otherInfo: "No injury.",
				yearsWithCompany: null,
				createdAt,
				updatedAt,
			},
		],
		accounts: [
			{
				id: ACCOUNT_B_ID,
				caseId: CASE_ID,
				personId: PERSON_B_ID,
				rawStatement: "Forklift reversed quickly.",
				createdAt,
				updatedAt,
				facts: [
					{
						id: "00000000-0000-4000-8000-000000000082",
						accountId: ACCOUNT_B_ID,
						orderIndex: 2,
						text: "Alarm was audible.",
						createdAt,
						updatedAt,
					},
					{
						id: "00000000-0000-4000-8000-000000000081",
						accountId: ACCOUNT_B_ID,
						orderIndex: 1,
						text: "Forklift entered aisle.",
						createdAt,
						updatedAt,
					},
				],
				personalEvents: [],
			},
			{
				id: ACCOUNT_A_ID,
				caseId: CASE_ID,
				personId: PERSON_A_ID,
				rawStatement: "I stepped back.",
				createdAt,
				updatedAt,
				facts: [],
				personalEvents: [
					{
						id: "00000000-0000-4000-8000-000000000091",
						accountId: ACCOUNT_A_ID,
						orderIndex: 1,
						eventAt: new Date("2026-04-29T07:31:00.000Z"),
						timeLabel: null,
						text: "Stepped away from pallet.",
						createdAt,
						updatedAt,
					},
				],
			},
		],
		timelineEvents: [
			{
				id: TIMELINE_B_ID,
				caseId: CASE_ID,
				orderIndex: 2,
				eventAt: new Date("2026-04-29T07:32:00.000Z"),
				timeLabel: null,
				text: "Supervisor stopped work.",
				confidence: "CONFIRMED",
				createdAt,
				updatedAt,
				sources: [],
				deviations: [],
				attachments: [],
			},
			{
				id: TIMELINE_A_ID,
				caseId: CASE_ID,
				orderIndex: 1,
				eventAt: new Date("2026-04-29T07:30:00.000Z"),
				timeLabel: null,
				text: "Forklift entered aisle.",
				confidence: "LIKELY",
				createdAt,
				updatedAt,
				sources: [
					{
						id: "00000000-0000-4000-8000-0000000000a1",
						timelineEventId: TIMELINE_A_ID,
						accountId: ACCOUNT_B_ID,
						factId: "00000000-0000-4000-8000-000000000081",
						personalEventId: null,
						createdAt,
						updatedAt,
					},
				],
				deviations: [
					{
						id: "00000000-0000-4000-8000-0000000000b1",
						eventId: TIMELINE_A_ID,
						orderIndex: 1,
						expected: "Aisle clear",
						actual: "Pedestrian present",
						createdAt,
						updatedAt,
					},
				],
				attachments: [
					{
						id: ATTACHMENT_A_ID,
						eventId: TIMELINE_A_ID,
						storageKey: "tenants/t/ii/photo-a.jpg",
						filename: "photo-a.jpg",
						mimeType: "image/jpeg",
						sizeBytes: BigInt(4200),
						createdAt,
						createdById: APPROVER_ID,
					},
				],
			},
		],
		causeNodes: [
			{
				id: "00000000-0000-4000-8000-0000000000c2",
				caseId: CASE_ID,
				parentId: "00000000-0000-4000-8000-0000000000c1",
				timelineEventId: TIMELINE_A_ID,
				orderIndex: 1,
				statement: "Pedestrian route crossed forklift path.",
				question: "Why was the crossing uncontrolled?",
				isRootCause: true,
				createdAt,
				updatedAt,
				actions: [
					{
						id: "00000000-0000-4000-8000-0000000000d1",
						causeNodeId: "00000000-0000-4000-8000-0000000000c2",
						orderIndex: 1,
						description: "Mark pedestrian crossing.",
						ownerRole: "Facilities",
						dueDate: new Date("2026-05-15T00:00:00.000Z"),
						actionType: "TECHNICAL",
						status: "OPEN",
						createdAt,
						updatedAt,
					},
				],
			},
			{
				id: "00000000-0000-4000-8000-0000000000c1",
				caseId: CASE_ID,
				parentId: null,
				timelineEventId: null,
				orderIndex: 1,
				statement: "Forklift and pedestrian nearly collided.",
				question: "Why did they meet?",
				isRootCause: false,
				createdAt,
				updatedAt,
				actions: [],
			},
		],
	};
}

function cloneWorkflow(workflow: IncidentWorkflowRow): IncidentWorkflowRow {
	return structuredClone(workflow);
}

function record(value: unknown): Record<string, unknown> {
	assert.equal(typeof value, "object");
	assert.notEqual(value, null);
	assert.equal(Array.isArray(value), false);
	return value as Record<string, unknown>;
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
	assert.ok(Array.isArray(value));
	return value.map(record);
}

function scanSourceFiles(root: string): string[] {
	const entries = readdirSync(root);
	return entries.flatMap((entry) => {
		const filePath = path.join(root, entry);
		const stat = statSync(filePath);

		if (stat.isDirectory()) {
			return scanSourceFiles(filePath);
		}

		return filePath.endsWith(".ts") || filePath.endsWith(".tsx")
			? [filePath]
			: [];
	});
}

function directSnapshotMutations(source: string): string[] {
	return [
		...source.matchAll(
			/approvalSnapshot\s*\.\s*(?:update|updateMany|delete|deleteMany|upsert)\s*\(/g,
		),
		...source.matchAll(snapshotTableMutationPattern),
	].map((match) => describeSourceMatch(source, match));
}

function describeSourceMatch(source: string, match: RegExpMatchArray): string {
	const index = match.index ?? 0;
	const line = source.slice(0, index).split("\n").length;
	const text = match[0].replace(/\s+/g, " ").trim();
	return `line ${line}: ${text}`;
}

function localModuleUrl(relativePath: string) {
	return {
		shortCircuit: true,
		url: localModuleHref(relativePath),
	};
}

function localModuleHref(relativePath: string): string {
	return pathToFileURL(path.resolve(relativePath)).href;
}

function relativeUnix(filePath: string): string {
	return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}

const snapshotTableNamePattern =
	'(?:(?:"[^"]+"|[a-z_][a-z0-9_]*|\\$\\{[^}]+\\})\\s*\\.\\s*)?"?approval_snapshot"?';
const snapshotTableTerminatorPattern = "(?=\\s|[;),`]|$)";
const snapshotTableMutationPattern = new RegExp(
	[
		`\\bupdate\\s+(?:only\\s+)?${snapshotTableNamePattern}${snapshotTableTerminatorPattern}`,
		`\\bdelete\\s+from\\s+(?:only\\s+)?${snapshotTableNamePattern}${snapshotTableTerminatorPattern}`,
		`\\btruncate(?:\\s+table)?\\s+(?:only\\s+)?${snapshotTableNamePattern}${snapshotTableTerminatorPattern}`,
		`\\balter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${snapshotTableNamePattern}${snapshotTableTerminatorPattern}`,
	].join("|"),
	"gi",
);
