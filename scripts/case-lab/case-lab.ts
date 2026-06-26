#!/usr/bin/env node
import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	createWriteStream,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { registerHooks } from "node:module";
import { createServer } from "node:net";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !isLocalImport(specifier)) {
			return nextResolve(specifier, context);
		}

		const candidates = [
			new URL(`${specifier}.ts`, context.parentURL),
			new URL(`${specifier}.tsx`, context.parentURL),
			new URL(`${specifier}.json`, context.parentURL),
			new URL(`${specifier}/index.ts`, context.parentURL),
		];
		const resolved = candidates.find((candidate) => existsSync(candidate));

		if (resolved) {
			return {
				shortCircuit: true,
				url: resolved.href,
			};
		}

		return nextResolve(specifier, context);
	},
});

const {
	buildCaseStudyFromBundle,
	caseStudyEvaluationMarkdown,
	caseStudyMarkdown,
	evaluateCaseStudyRun,
	nextCaseStudyUserTurn,
} = (await import(moduleUrl("scripts/case-lab/case-study.ts"))) as typeof import("./case-study");
const { recordCoachOperationDecision, runCoachChatTurn } = (await import(
	moduleUrl("src/lib/incident/coach-chat.ts")
)) as typeof import("../../src/lib/incident/coach-chat");
const { resolveFlueModel } = (await import(
	moduleUrl("src/lib/incident/coach-flue-config.ts")
)) as typeof import("../../src/lib/incident/coach-flue-config");
const { applyIncidentCoachOperation } = (await import(
	moduleUrl("src/lib/agent/incident-investigation/apply-operation.ts")
)) as typeof import("../../src/lib/agent/incident-investigation/apply-operation");
const { prisma, provisionTenantSchema, dropTenantSchema, withTenantConnection } =
	(await import(moduleUrl("src/lib/db/index.ts"))) as typeof import("../../src/lib/db");

type JsonRecord = Record<string, unknown>;

type CoachMessage = {
	readonly id?: string;
	readonly role: "user" | "assistant";
	readonly content: string;
	readonly operations?: readonly JsonRecord[];
	readonly operation_decisions?: JsonRecord;
	readonly operationDecisions?: JsonRecord;
	readonly created_at?: string;
};

type CaseBundle = {
	readonly case?: JsonRecord;
	readonly facts?: readonly JsonRecord[];
	readonly timelineEvents?: readonly JsonRecord[];
	readonly causeNodes?: readonly JsonRecord[];
	readonly causeActions?: readonly JsonRecord[];
	readonly persons?: readonly JsonRecord[];
	readonly coachMessages?: readonly CoachMessage[];
};

type CaseLabManifest = {
	readonly version: 1;
	readonly importedAt: string;
	readonly sourceFolder: string;
	readonly sourceBundlePath: string;
	readonly labTenantId: string;
	readonly labUserId: string;
	readonly labCaseId: string;
	readonly sourceSummary: JsonRecord;
};

type CaseStudy = import("./case-study").CaseStudy;
type CaseStudyState = import("./case-study").CaseStudyState;

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));

try {
	if (!command || args.help) {
		printHelp();
		process.exit(command ? 0 : 1);
	}

	if (command === "import") {
		await runImport(args);
	} else if (command === "study") {
		await runStudy(args);
	} else if (command === "replay") {
		await runStudyReplay(args);
	} else if (command === "evaluate") {
		await runStudyEvaluate(args);
	} else if (command === "janitor") {
		await runJanitor(args);
	} else {
		throw new Error(`Unknown command: ${command}`);
	}
} finally {
	await prisma.$disconnect();
}

async function runImport(args: ParsedArgs): Promise<void> {
	requireAdminDatabaseUrl("case-lab import provisions a tenant schema");
	const caseFolder = requiredPath(args.caseFolder, "--case-folder");
	const bundlePath = resolve(caseFolder, "postgres", "case-bundle.json");
	if (!existsSync(bundlePath)) {
		throw new Error(`Missing case bundle: ${bundlePath}`);
	}

	const bundle = readJson<CaseBundle>(bundlePath);
	const sourceCase = requireCase(bundle);
	const outDir = resolve(
		optionalString(args.outDir, "--out-dir") ?? ".tmp/case-lab/imports",
		importFolderName(caseFolder, sourceCase),
	);
	const { tenantId, userId } = await createLabTenant("source");
	const labCaseId = String(sourceCase.id ?? randomUUID());

	try {
		await importFinalCaseBundle({
			bundle,
			caseId: labCaseId,
			tenantId,
			userId,
		});

		const manifest: CaseLabManifest = {
				importedAt: new Date().toISOString(),
				labCaseId,
				labTenantId: tenantId,
				labUserId: userId,
				sourceBundlePath: bundlePath,
				sourceFolder: caseFolder,
				sourceSummary: summarizeSourceCase(bundle),
			version: 1,
			};

			mkdirSync(outDir, { recursive: true });
			writeJson(join(outDir, "case-lab-manifest.json"), manifest);

			console.log(
				JSON.stringify(
					{
						importDir: outDir,
						labCaseId,
						labTenantId: tenantId,
					},
					null,
					2,
			),
		);
	} catch (error) {
		await cleanupLabTenant({ tenantId, userId });
		throw error;
	}
}

async function runStudy(args: ParsedArgs): Promise<void> {
	const caseFolder = requiredPath(args.caseFolder, "--case-folder");
	const bundlePath = resolve(caseFolder, "postgres", "case-bundle.json");
	if (!existsSync(bundlePath)) {
		throw new Error(`Missing case bundle: ${bundlePath}`);
	}

	const bundle = readJson<CaseBundle>(bundlePath);
	const study = buildCaseStudyFromBundle(bundle);
	const studyDir = resolve(
		optionalString(args.outDir, "--out-dir") ?? ".tmp/case-lab/studies",
		`${timestamp(new Date())}-${safeSegment(String(study.caseNumber ?? study.id))}`,
	);
	mkdirSync(studyDir, { recursive: true });
	writeJson(join(studyDir, "case-study.json"), study);
	writeFileSync(join(studyDir, "case-study.md"), caseStudyMarkdown(study), "utf8");
	console.log(
		JSON.stringify(
			{
				caseNumber: study.caseNumber,
				facts: study.facts.length,
				studyDir,
				studyPath: join(studyDir, "case-study.json"),
				title: study.title,
			},
			null,
			2,
		),
	);
}

async function runStudyReplay(args: ParsedArgs): Promise<void> {
	requireAdminDatabaseUrl("case-lab replay provisions and drops a simulation tenant schema");
	const studyPath = requiredPath(args.study, "--study");
	const study = readJson<CaseStudy>(studyPath);
	const maxTurns = Number(optionalString(args.maxTurns, "--max-turns") ?? "12");
	if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 50) {
		throw new Error("--max-turns must be an integer from 1 to 50.");
	}
	const artifactDir = resolve(
		optionalString(args.outDir, "--out-dir") ?? ".tmp/case-lab/study-runs",
		`${timestamp(new Date())}-${safeSegment(String(study.caseNumber ?? study.id))}`,
	);
	mkdirSync(artifactDir, { recursive: true });

	if (!existsSync(".flue-dist/server.mjs")) {
		throw new Error("Missing .flue-dist/server.mjs. Run `pnpm flue:build` first.");
	}

	const { tenantId, userId } = await createLabTenant("sim");
	const incidentId = randomUUID();
	const sqlitePath = resolve(artifactDir, "flue.db");
	const flueLogPath = resolve(artifactDir, "flue-server.log");
	const port = Number(optionalString(args.port, "--port") ?? (await getFreePort()));
	const baseUrl = `http://127.0.0.1:${port}`;
	const model = optionalString(args.model, "--model") ?? resolveFlueModel(process.env);
	const variant = optionalString(args.variant, "--variant") ?? "current";

	const previousEnv = snapshotEnv([
		"SAFETYSECRETARY_II_COACH_RUNTIME",
		"SSFW_II_COACH_RUNTIME",
		"SAFETYSECRETARY_FLUE_BASE_URL",
		"SSFW_FLUE_BASE_URL",
		"SAFETYSECRETARY_FLUE_SQLITE_PATH",
		"SSFW_FLUE_SQLITE_PATH",
		"SAFETYSECRETARY_FLUE_MODEL",
		"SSFW_FLUE_MODEL",
	]);
	setEnvPair("SAFETYSECRETARY_II_COACH_RUNTIME", "SSFW_II_COACH_RUNTIME", "flue");
	setEnvPair("SAFETYSECRETARY_FLUE_BASE_URL", "SSFW_FLUE_BASE_URL", baseUrl);
	setEnvPair(
		"SAFETYSECRETARY_FLUE_SQLITE_PATH",
		"SSFW_FLUE_SQLITE_PATH",
		sqlitePath,
	);
	setEnvPair("SAFETYSECRETARY_FLUE_MODEL", "SSFW_FLUE_MODEL", model);

	let flue: ChildProcess | null = null;
	const flueLog = createWriteStream(flueLogPath, { flags: "a" });
	const transcript: JsonRecord[] = [];
	const progressEvents: JsonRecord[] = [];
	let assistantText: string | undefined;
	let state: CaseStudyState = { revealedFactIds: [] };

	try {
		await insertSeedIncidentCase({
			caseId: incidentId,
			sourceCase: {
				content_language: study.language,
				coordinator_role: "Investigation coordinator",
				incident_type: study.expected.incidentType ?? "NEAR_MISS",
				title: study.title,
				vision_consent: "ASK",
			},
			tenantId,
			userId,
			warmStart: false,
		});
		flue = await startFlueServer({ baseUrl, flueLog, port, sqlitePath });

		for (let index = 1; index <= maxTurns; index += 1) {
			const simulated = nextCaseStudyUserTurn({
				assistantText,
				state,
				study,
			});
			if (simulated.done) {
				break;
			}
			const before = await readCaseRecord({ incidentId, tenantId });
			const result = await runCoachChatTurn({
				incidentId,
				locale: study.language,
				message: simulated.message,
				onProgress: (event) => {
					progressEvents.push({ event: toJson(event), turnIndex: index });
				},
				tenantId,
				userId,
			});
			assert.ok(result);
			const applied = await applyOperations({
				incidentId,
				messageId: result.assistantMessage.id,
				operations: result.assistantMessage.operations,
				tenantId,
			});
			const after = await readCaseRecord({ incidentId, tenantId });
			transcript.push({
				after,
				applied,
				assistant: result.assistantMessage,
				before,
				simulation: simulated,
				turn: { index, message: simulated.message },
				user: result.userMessage,
			});
			assistantText = result.assistantMessage.content;
			state = {
				lastNoMatch: simulated.reason === "no-matching-case-fact",
				revealedFactIds: [...state.revealedFactIds, ...simulated.revealedFactIds],
			};
		}

		const finalRecord = await readCaseRecord({ incidentId, tenantId });
		const coachMessages = await readCoachMessages({ incidentId, tenantId });
		const simulationTurns = transcript.map((turn) => turn.simulation as JsonRecord);
		const evaluation = evaluateCaseStudyRun({
			finalRecord,
			simulationTurns,
			study,
			transcript,
		});
		const report = {
			artifactDir,
			caseStudy: study,
			coachMessages,
			environment: {
				baseUrl,
				flueLogPath,
				model,
				sqlitePath,
				variant,
			},
			evaluation,
			finalRecord,
			progressEvents,
			replay: {
				incidentId,
				tenantId,
				userId,
			},
			simulationTurns,
			studyPath,
			transcript,
		};
		writeJson(join(artifactDir, "report.json"), report);
		writeJson(join(artifactDir, "evaluation.json"), evaluation);
		writeFileSync(join(artifactDir, "evaluation.md"), caseStudyEvaluationMarkdown(evaluation), "utf8");
		console.log(
			JSON.stringify(
				{
					artifactDir,
					evaluation: evaluation.summary,
					reportPath: join(artifactDir, "report.json"),
					sqlitePath,
				},
				null,
				2,
			),
		);
	} finally {
		restoreEnv(previousEnv);
		if (flue) {
			await stopFlueServer(flue).catch(() => undefined);
		}
		await new Promise<void>((resolve) => flueLog.end(resolve));
		await cleanupLabTenant({ tenantId, userId });
	}
}

async function runStudyEvaluate(args: ParsedArgs): Promise<void> {
	const reportPath = requiredPath(args.report, "--report");
	const report = readJson<{
		caseStudy?: CaseStudy;
		finalRecord: Awaited<ReturnType<typeof readCaseRecord>>;
		simulationTurns?: readonly JsonRecord[];
		transcript: readonly JsonRecord[];
	}>(reportPath);
	if (!report.caseStudy) {
		throw new Error("Case Lab evaluate expects a case-study replay report.");
	}
	const simulationTurns =
		report.simulationTurns ??
		report.transcript.map((turn) => (turn.simulation as JsonRecord | undefined) ?? {});
	const evaluation = evaluateCaseStudyRun({
		finalRecord: report.finalRecord,
		simulationTurns,
		study: report.caseStudy,
		transcript: report.transcript,
	});
	const outPath = optionalString(args.out, "--out") ?? reportPath.replace(/\.json$/, ".evaluation.json");
	writeJson(outPath, evaluation);
	writeFileSync(outPath.replace(/\.json$/, ".md"), caseStudyEvaluationMarkdown(evaluation), "utf8");
	console.log(JSON.stringify({ outPath, summary: evaluation.summary }, null, 2));
}

async function runJanitor(args: ParsedArgs): Promise<void> {
	requireAdminDatabaseUrl("case-lab janitor drops tenant schemas");
	const includeSource = Boolean(args.all ?? args.includeSource);
	const tenantPrefix = includeSource ? "case-lab-" : "case-lab-sim-";
	const tenants = await prisma.tenant.findMany({
		select: { id: true, memberships: { select: { userId: true } }, name: true },
		where: { name: { startsWith: tenantPrefix } },
	});

	const cleaned = [];
	for (const tenant of tenants) {
		const userIds = tenant.memberships.map((membership) => membership.userId);
		await cleanupLabTenant({ tenantId: tenant.id, userId: userIds[0] });
		cleaned.push({ id: tenant.id, name: tenant.name });
	}

	console.log(JSON.stringify({ cleaned, includeSource }, null, 2));
}

async function importFinalCaseBundle(input: {
	readonly bundle: CaseBundle;
	readonly caseId: string;
	readonly tenantId: string;
	readonly userId: string;
}): Promise<void> {
	const sourceCase = requireCase(input.bundle);
	await insertFinalIncidentCase({
		caseId: input.caseId,
		sourceCase,
		tenantId: input.tenantId,
		userId: input.userId,
	});

	await withTenantConnection(input.tenantId, async (tx) => {
		for (const row of input.bundle.persons ?? []) {
			await tx.$executeRaw`
				INSERT INTO incident_person (
					id,
					case_id,
					role,
					name,
					other_info,
					years_with_company,
					created_at,
					updated_at
				) VALUES (
					${String(row.id)}::uuid,
					${input.caseId}::uuid,
					${String(row.role ?? "UNKNOWN")},
					${nullableString(row.name)},
					${nullableString(row.other_info)},
					${nullableNumber(row.years_with_company)},
					${dateOrNow(row.created_at)},
					${dateOrNow(row.updated_at)}
				)
				ON CONFLICT (id) DO NOTHING
			`;
		}

		for (const row of input.bundle.facts ?? []) {
			await tx.$executeRaw`
				INSERT INTO incident_fact (id, case_id, account_id, order_index, text, created_at, updated_at)
				VALUES (
					${String(row.id)}::uuid,
					${input.caseId}::uuid,
					NULL,
					${Number(row.order_index ?? 0)},
					${String(row.text ?? "")},
					${dateOrNow(row.created_at)},
					${dateOrNow(row.updated_at)}
				)
			`;
		}

		for (const row of input.bundle.timelineEvents ?? []) {
			await tx.$executeRaw`
				INSERT INTO incident_timeline_event (
					id,
					case_id,
					order_index,
					event_at,
					time_label,
					text,
					confidence,
					created_at,
					updated_at
				) VALUES (
					${String(row.id)}::uuid,
					${input.caseId}::uuid,
					${Number(row.order_index ?? 0)},
					${nullableDate(row.event_at)},
					${nullableString(row.time_label)},
					${String(row.text ?? "")},
					${String(row.confidence ?? "LIKELY")}::incident_timeline_confidence,
					${dateOrNow(row.created_at)},
					${dateOrNow(row.updated_at)}
				)
			`;
		}

		for (const row of sortCauseNodes(input.bundle.causeNodes ?? [])) {
			await tx.$executeRaw`
				INSERT INTO incident_cause_node (
					id,
					case_id,
					parent_id,
					timeline_event_id,
					order_index,
					statement,
					question,
					is_root_cause,
					branch_status,
					created_at,
					updated_at
				) VALUES (
					${String(row.id)}::uuid,
					${input.caseId}::uuid,
					${nullableUuid(row.parent_id)}::uuid,
					${nullableUuid(row.timeline_event_id)}::uuid,
					${Number(row.order_index ?? 0)},
					${String(row.statement ?? "")},
					${nullableString(row.question)},
					${Boolean(row.is_root_cause)},
					${String(row.branch_status ?? "OPEN")},
					${dateOrNow(row.created_at)},
					${dateOrNow(row.updated_at)}
				)
			`;
		}

		for (const row of input.bundle.causeActions ?? []) {
			await tx.$executeRaw`
				INSERT INTO incident_cause_action (
					id,
					cause_node_id,
					order_index,
					description,
					owner_role,
					due_date,
					action_type,
					status,
					created_at,
					updated_at
				) VALUES (
					${String(row.id)}::uuid,
					${String(row.cause_node_id)}::uuid,
					${Number(row.order_index ?? 0)},
					${String(row.description ?? "")},
					${nullableString(row.owner_role)},
					${nullableDate(row.due_date)},
					${String(row.action_type ?? "ORGANIZATIONAL")}::incident_action_type,
					${String(row.status ?? "OPEN")}::incident_action_status,
					${dateOrNow(row.created_at)},
					${dateOrNow(row.updated_at)}
				)
			`;
		}

		for (const message of input.bundle.coachMessages ?? []) {
			await tx.$executeRaw`
				INSERT INTO incident_coach_message (
					id,
					case_id,
					role,
					content,
					operations,
					operation_decisions,
					created_at
				) VALUES (
					${String(message.id ?? randomUUID())}::uuid,
					${input.caseId}::uuid,
					${message.role},
					${message.content},
					${JSON.stringify(message.operations ?? [])}::jsonb,
					${JSON.stringify(message.operation_decisions ?? message.operationDecisions ?? {})}::jsonb,
					${dateOrNow(message.created_at)}
				)
			`;
		}
	});
}

async function insertFinalIncidentCase(input: {
	readonly caseId: string;
	readonly sourceCase: JsonRecord;
	readonly tenantId: string;
	readonly userId: string;
}): Promise<void> {
	await withTenantConnection(input.tenantId, async (tx) => {
		await tx.$executeRaw`
			INSERT INTO incident_case (
				id,
				case_number,
				suva_case_number,
				title,
				incident_at,
				incident_time_note,
				location,
				incident_type,
				actual_injury_outcome,
				actual_severity_code,
				actual_severity_reason,
				potential_outcome_text,
				potential_severity_code,
				potential_likelihood_code,
				potential_risk_band,
				hazard_category_code,
				department_text,
				area_text,
				shift_text,
				work_activity,
				work_type,
				event_type,
				process_involved,
				ppe_required,
				ppe_worn,
				injury_nature,
				body_part,
				lost_days,
				contractor_flag,
				time_in_role_band,
				reportable_uvg,
				control_failure,
				immediate_cause,
				contributing_causes,
				closed_at,
				coordinator_role,
				coordinator_name,
				workflow_stage,
				cause_method,
				content_language,
				vision_consent,
				hira_followup_needed,
				hira_followup_text,
				created_by,
				created_at,
				updated_at
			) VALUES (
				${input.caseId}::uuid,
				${nullableString(input.sourceCase.case_number)},
				${nullableString(input.sourceCase.suva_case_number)},
				${String(input.sourceCase.title ?? "Imported case")},
				${nullableDate(input.sourceCase.incident_at)},
				${nullableString(input.sourceCase.incident_time_note)},
				${nullableString(input.sourceCase.location)},
				${String(input.sourceCase.incident_type ?? "NEAR_MISS")}::incident_type,
				${nullableString(input.sourceCase.actual_injury_outcome)}::incident_actual_injury_outcome,
				${nullableString(input.sourceCase.actual_severity_code)},
				${nullableString(input.sourceCase.actual_severity_reason)},
				${nullableString(input.sourceCase.potential_outcome_text)},
				${nullableString(input.sourceCase.potential_severity_code)},
				${nullableString(input.sourceCase.potential_likelihood_code)},
				${nullableString(input.sourceCase.potential_risk_band)},
				${nullableString(input.sourceCase.hazard_category_code)},
				${nullableString(input.sourceCase.department_text)},
				${nullableString(input.sourceCase.area_text)},
				${nullableString(input.sourceCase.shift_text)},
				${nullableString(input.sourceCase.work_activity)},
				${nullableString(input.sourceCase.work_type)},
				${nullableString(input.sourceCase.event_type)},
				${nullableString(input.sourceCase.process_involved)},
				${stringArray(input.sourceCase.ppe_required)}::text[],
				${stringArray(input.sourceCase.ppe_worn)}::text[],
				${nullableString(input.sourceCase.injury_nature)},
				${nullableString(input.sourceCase.body_part)},
				${nullableNumber(input.sourceCase.lost_days)},
				${nullableBoolean(input.sourceCase.contractor_flag)},
				${nullableString(input.sourceCase.time_in_role_band)},
				${nullableBoolean(input.sourceCase.reportable_uvg)},
				${nullableString(input.sourceCase.control_failure)},
				${nullableString(input.sourceCase.immediate_cause)},
				${stringArray(input.sourceCase.contributing_causes)}::text[],
				${nullableDate(input.sourceCase.closed_at)},
				${String(input.sourceCase.coordinator_role ?? "Investigation coordinator")},
				${nullableString(input.sourceCase.coordinator_name)},
				${String(input.sourceCase.workflow_stage ?? "FACTS")}::incident_workflow_stage,
				${String(input.sourceCase.cause_method ?? "FIVE_WHYS")},
				${String(input.sourceCase.content_language ?? "en")}::shared.language_code,
				${String(input.sourceCase.vision_consent ?? "ASK")}::incident_vision_consent,
				${Boolean(input.sourceCase.hira_followup_needed)},
				${nullableString(input.sourceCase.hira_followup_text)},
				${input.userId}::uuid,
				${dateOrNow(input.sourceCase.created_at)},
				${dateOrNow(input.sourceCase.updated_at)}
			)
		`;
	});
}

async function insertSeedIncidentCase(input: {
	readonly caseId: string;
	readonly sourceCase: JsonRecord;
	readonly tenantId: string;
	readonly userId: string;
	readonly warmStart: boolean;
}): Promise<void> {
	await withTenantConnection(input.tenantId, async (tx) => {
		await tx.$executeRaw`
			INSERT INTO incident_case (
				id,
				title,
				incident_at,
				incident_time_note,
				incident_type,
				coordinator_role,
				content_language,
				vision_consent,
				created_by
			) VALUES (
				${input.caseId}::uuid,
				${String(input.sourceCase.title ?? "New investigation")},
				${input.warmStart ? nullableDate(input.sourceCase.incident_at) : null},
				${input.warmStart ? nullableString(input.sourceCase.incident_time_note) : null},
				${String(input.sourceCase.incident_type ?? "NEAR_MISS")}::incident_type,
				${String(input.sourceCase.coordinator_role ?? "Investigation coordinator")},
				${String(input.sourceCase.content_language ?? "en")}::shared.language_code,
				${String(input.sourceCase.vision_consent ?? "ASK")}::incident_vision_consent,
				${input.userId}::uuid
			)
		`;
	});
}

async function createLabTenant(kind: "source" | "sim"): Promise<{
	tenantId: string;
	userId: string;
}> {
	const id = randomUUID();
	const tenant = await prisma.tenant.create({
		data: {
			defaultLanguage: "en",
			name: `case-lab-${kind}-${id}`,
		},
	});
	const user = await prisma.user.create({
		data: {
			email: `case-lab-${kind}-${id}@example.invalid`,
			uiLocale: "en",
		},
	});
	await prisma.tenantMembership.create({
		data: { tenantId: tenant.id, userId: user.id },
	});
	try {
		const appLoginRole = labAppLoginRole();
		await provisionTenantSchema(
			tenant.id,
			undefined,
			appLoginRole ? { appLoginRole } : undefined,
		);
	} catch (error) {
		await cleanupLabTenant({ tenantId: tenant.id, userId: user.id });
		throw error;
	}
	return { tenantId: tenant.id, userId: user.id };
}

async function cleanupLabTenant(input: {
	readonly tenantId: string;
	readonly userId?: string;
}): Promise<void> {
	const errors = [];
	try {
		await dropTenantSchema(input.tenantId);
	} catch (error) {
		errors.push(`dropTenantSchema: ${errorMessage(error)}`);
	}
	await prisma.session.deleteMany({ where: { tenantId: input.tenantId } }).catch((error) => {
		errors.push(`session cleanup: ${errorMessage(error)}`);
	});
	await prisma.tenantMembership
		.deleteMany({ where: { tenantId: input.tenantId } })
		.catch((error) => errors.push(`membership cleanup: ${errorMessage(error)}`));
	await prisma.tenant
		.deleteMany({ where: { id: input.tenantId } })
		.catch((error) => errors.push(`tenant cleanup: ${errorMessage(error)}`));
	if (input.userId) {
		await prisma.user
			.deleteMany({ where: { id: input.userId } })
			.catch((error) => errors.push(`user cleanup: ${errorMessage(error)}`));
	}
	if (errors.length > 0) {
		console.error(JSON.stringify({ cleanupErrors: errors, tenantId: input.tenantId }, null, 2));
	}
}

async function applyOperations(input: {
	readonly tenantId: string;
	readonly incidentId: string;
	readonly messageId: string;
	readonly operations: readonly unknown[];
}) {
	const operationRecordMap: Record<string, string> = {};
	const results = [];

	for (const operation of input.operations) {
		const op = operation as { id: string; kind: string };
		const result = await applyIncidentCoachOperation({
			incidentId: input.incidentId,
			operation: operation as never,
			operationRecordMap,
			tenantId: input.tenantId,
		});

		if (result.ok) {
			if (result.recordId) {
				operationRecordMap[op.id] = result.recordId;
			}
			await recordCoachOperationDecision({
				decision: { recordId: result.recordId, status: "applied" },
				incidentId: input.incidentId,
				messageId: input.messageId,
				operationId: op.id,
				tenantId: input.tenantId,
			});
		}

		results.push({ kind: op.kind, operationId: op.id, result });
	}

	return results;
}

async function readCaseRecord(input: {
	readonly tenantId: string;
	readonly incidentId: string;
}) {
	return withTenantConnection(input.tenantId, async (tx) => {
		const [incident] = await tx.$queryRaw<JsonRecord[]>`
			SELECT
				id::text AS id,
				case_number AS "caseNumber",
				title,
				incident_at AS "incidentAt",
				incident_time_note AS "incidentTimeNote",
				location,
				incident_type::text AS "incidentType",
				actual_injury_outcome::text AS "actualInjuryOutcome",
				actual_severity_code AS "actualSeverityCode",
				actual_severity_reason AS "actualSeverityReason",
				potential_outcome_text AS "potentialOutcomeText",
				potential_severity_code AS "potentialSeverityCode",
				potential_likelihood_code AS "potentialLikelihoodCode",
				potential_risk_band AS "potentialRiskBand",
				hazard_category_code AS "hazardCategoryCode",
				event_type AS "eventType",
				injury_nature AS "injuryNature",
				body_part AS "bodyPart",
				workflow_stage::text AS "workflowStage",
				cause_method AS "causeMethod",
				hira_followup_needed AS "hiraFollowupNeeded",
				hira_followup_text AS "hiraFollowupText",
				updated_at AS "updatedAt"
			FROM incident_case
			WHERE id = ${input.incidentId}::uuid
			LIMIT 1
		`;
		const facts = await tx.$queryRaw<JsonRecord[]>`
			SELECT id::text AS id, order_index AS "orderIndex", text
			FROM incident_fact
			WHERE case_id = ${input.incidentId}::uuid
			ORDER BY order_index ASC, id ASC
		`;
		const timelineEvents = await tx.$queryRaw<JsonRecord[]>`
			SELECT
				id::text AS id,
				order_index AS "orderIndex",
				event_at AS "eventAt",
				time_label AS "timeLabel",
				text,
				confidence
			FROM incident_timeline_event
			WHERE case_id = ${input.incidentId}::uuid
			ORDER BY order_index ASC, id ASC
		`;
		const causeNodes = await tx.$queryRaw<JsonRecord[]>`
			SELECT
				id::text AS id,
				parent_id::text AS "parentId",
				order_index AS "orderIndex",
				statement,
				question,
				is_root_cause AS "isRootCause",
				branch_status AS "branchStatus"
			FROM incident_cause_node
			WHERE case_id = ${input.incidentId}::uuid
			ORDER BY order_index ASC, id ASC
		`;
		const causeActions = await tx.$queryRaw<JsonRecord[]>`
			SELECT
				action.id::text AS id,
				action.cause_node_id::text AS "causeNodeId",
				action.order_index AS "orderIndex",
				action.description,
				action.owner_role AS "ownerRole",
				action.due_date AS "dueDate",
				action.status
			FROM incident_cause_action action
			JOIN incident_cause_node cause ON cause.id = action.cause_node_id
			WHERE cause.case_id = ${input.incidentId}::uuid
			ORDER BY action.order_index ASC, action.id ASC
		`;
		const persons = await tx.$queryRaw<JsonRecord[]>`
			SELECT id::text AS id, role, name, other_info AS "otherInfo"
			FROM incident_person
			WHERE case_id = ${input.incidentId}::uuid
			ORDER BY created_at ASC, id ASC
		`;
		return { causeActions, causeNodes, facts, incident, persons, timelineEvents };
	});
}

async function readCoachMessages(input: {
	readonly tenantId: string;
	readonly incidentId: string;
}) {
	return withTenantConnection(input.tenantId, async (tx) => {
		return tx.$queryRaw<JsonRecord[]>`
			SELECT
				id::text AS id,
				role,
				content,
				operations,
				operation_decisions AS "operationDecisions",
				created_at AS "createdAt"
			FROM incident_coach_message
			WHERE case_id = ${input.incidentId}::uuid
			ORDER BY created_at ASC, id ASC
		`;
	});
}

async function startFlueServer(input: {
	readonly baseUrl: string;
	readonly flueLog: NodeJS.WritableStream;
	readonly port: number;
	readonly sqlitePath: string;
}): Promise<ChildProcess> {
	const child = spawn(process.execPath, [".flue-dist/server.mjs"], {
		env: {
			...process.env,
			PORT: String(input.port),
			SAFETYSECRETARY_FLUE_SQLITE_PATH: input.sqlitePath,
			SSFW_FLUE_SQLITE_PATH: input.sqlitePath,
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	child.stdout?.on("data", (chunk) => {
		input.flueLog.write(`[stdout] ${chunk.toString()}`);
	});
	child.stderr?.on("data", (chunk) => {
		input.flueLog.write(`[stderr] ${chunk.toString()}`);
	});
	await waitForFlue({ baseUrl: input.baseUrl, child });
	return child;
}

async function stopFlueServer(child: ChildProcess): Promise<void> {
	if (hasExited(child)) return;
	child.kill("SIGTERM");
	if (await waitForChildExit(child, 5_000)) return;
	child.kill("SIGKILL");
	await waitForChildExit(child, 5_000);
}

async function waitForFlue(input: {
	readonly baseUrl: string;
	readonly child: ChildProcess;
}): Promise<void> {
	const deadline = Date.now() + 30_000;
	let lastError: unknown;
	while (Date.now() < deadline) {
		if (input.child.exitCode !== null) {
			throw new Error(`Flue server exited early with code ${input.child.exitCode}`);
		}
		try {
			const response = await fetch(`${input.baseUrl}/openapi.json`);
			if (response.ok) return;
			lastError = new Error(`HTTP ${response.status}`);
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`Flue server did not become ready: ${errorMessage(lastError)}`);
}

async function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (hasExited(child)) return true;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	return hasExited(child);
}

function hasExited(child: ChildProcess): boolean {
	return child.exitCode !== null || child.signalCode !== null;
}

async function getFreePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			server.close(() => {
				if (typeof address === "object" && address?.port) {
					resolvePort(address.port);
				} else {
					reject(new Error("Could not reserve free port."));
				}
			});
		});
	});
}

function requireCase(bundle: CaseBundle): JsonRecord {
	if (!bundle.case || typeof bundle.case !== "object") {
		throw new Error("case-bundle.json does not contain a case object.");
	}
	return bundle.case;
}

function summarizeSourceCase(bundle: CaseBundle): JsonRecord {
	const sourceCase = requireCase(bundle);
	return {
		caseNumber: sourceCase.case_number,
		id: sourceCase.id,
		messageCount: bundle.coachMessages?.length ?? 0,
		title: sourceCase.title,
	};
}

function sortCauseNodes(nodes: readonly JsonRecord[]): readonly JsonRecord[] {
	const byId = new Map<string, JsonRecord>();
	for (const node of nodes) {
		if (!node.id) {
			throw new Error("Cannot import cause node without id.");
		}
		byId.set(String(node.id), node);
	}

	const ordered: JsonRecord[] = [];
	const visited = new Set<string>();
	const visiting = new Set<string>();
	const sorted = [...nodes].sort(compareCauseNodes);

	const visit = (node: JsonRecord) => {
		const id = String(node.id);
		if (visited.has(id)) {
			return;
		}
		if (visiting.has(id)) {
			throw new Error(`Cannot import cyclic cause node parent chain at ${id}.`);
		}

		visiting.add(id);
		const parentId = nullableUuid(node.parent_id);
		if (parentId) {
			const parent = byId.get(parentId);
			if (!parent) {
				throw new Error(`Cannot import cause node ${id}: missing parent ${parentId}.`);
			}
			visit(parent);
		}
		visiting.delete(id);
		visited.add(id);
		ordered.push(node);
	};

	for (const node of sorted) {
		visit(node);
	}

	return ordered;
}

function compareCauseNodes(left: JsonRecord, right: JsonRecord): number {
	const order = Number(left.order_index ?? 0) - Number(right.order_index ?? 0);
	if (order !== 0) {
		return order;
	}
	const created = String(left.created_at ?? "").localeCompare(String(right.created_at ?? ""));
	if (created !== 0) {
		return created;
	}
	return String(left.id ?? "").localeCompare(String(right.id ?? ""));
}

function importFolderName(caseFolder: string, sourceCase: JsonRecord): string {
	return `${timestamp(new Date())}-${safeSegment(basename(caseFolder))}-${safeSegment(String(sourceCase.case_number ?? sourceCase.id ?? "case"))}`;
}

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(values: readonly string[]): ParsedArgs {
	const parsed: ParsedArgs = {};
	const booleanFlags = new Set(["all", "include-source"]);
	for (let index = 0; index < values.length; index += 1) {
		const value = values[index];
		if (value === "--") {
			continue;
		}
		if (value === "--help" || value === "-h") {
			parsed.help = true;
		} else if (value.startsWith("--")) {
			const [key, inline] = value.slice(2).split("=", 2);
			if (booleanFlags.has(key) && inline === undefined) {
				parsed[toCamel(key)] = true;
				continue;
			}
			const argValue = inline ?? values[++index];
			if (!argValue || argValue.startsWith("--")) {
				throw new Error(`${value} requires a value.`);
			}
			parsed[toCamel(key)] = argValue;
		} else {
			throw new Error(`Unknown argument: ${value}`);
		}
	}
	return parsed;
}

type ParsedArgs = Record<string, string | boolean | undefined>;

function requiredPath(value: unknown, flag: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(`${flag} is required.`);
	}
	return resolve(value);
}

function optionalString(value: unknown, flag: string): string | undefined {
	if (value === undefined || value === false) {
		return undefined;
	}
	if (typeof value === "string") {
		return value;
	}
	throw new Error(`${flag} requires a value.`);
}

function requireAdminDatabaseUrl(reason: string): void {
	if (!process.env.ADMIN_DATABASE_URL?.trim()) {
		throw new Error(
			`${reason}; set ADMIN_DATABASE_URL to a privileged local database connection before running this command.`,
		);
	}
}

function labAppLoginRole(): string | null {
	const configured =
		process.env.SAFETY_SECRETARY_APP_LOGIN_ROLE ?? process.env.DATABASE_APP_LOGIN_ROLE;
	if (configured?.trim()) {
		return configured.trim();
	}
	const databaseUrl = process.env.DATABASE_URL?.trim();
	if (!databaseUrl) {
		return null;
	}
	try {
		const username = decodeURIComponent(new URL(databaseUrl).username);
		return username || null;
	} catch {
		return null;
	}
}

function toCamel(value: string): string {
	return value.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function nullableString(value: unknown): string | null {
	return value === null || value === undefined ? null : String(value);
}

function nullableNumber(value: unknown): number | null {
	return value === null || value === undefined || value === "" ? null : Number(value);
}

function nullableBoolean(value: unknown): boolean | null {
	return value === null || value === undefined ? null : Boolean(value);
}

function nullableDate(value: unknown): Date | null {
	return value === null || value === undefined || value === "" ? null : new Date(String(value));
}

function dateOrNow(value: unknown): Date {
	return nullableDate(value) ?? new Date();
}

function nullableUuid(value: unknown): string | null {
	return value === null || value === undefined || value === "" ? null : String(value);
}

function stringArray(value: unknown): readonly string[] {
	return Array.isArray(value) ? value.map(String) : [];
}

function safeSegment(value: string): string {
	const safe = value
		.normalize("NFKD")
		.replace(/[^\w.-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 100);
	return safe || "item";
}

function timestamp(date: Date): string {
	return date.toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(relativePath).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}

function setEnvPair(name: string, legacyName: string, value: string): void {
	process.env[name] = value;
	process.env[legacyName] = value;
}

function snapshotEnv(keys: readonly string[]): Map<string, string | undefined> {
	return new Map(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Map<string, string | undefined>): void {
	for (const [key, value] of snapshot) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

function toJson(value: unknown): unknown {
	return JSON.parse(JSON.stringify(value));
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function printHelp(): void {
	console.log(`SafetySecretary Case Lab

Usage:
  pnpm case-lab:import -- --case-folder .tmp/case-corpus-full/<case>
  pnpm case-lab:study -- --case-folder .tmp/case-corpus-full/<case>
  pnpm case-lab:replay -- --study .tmp/case-lab/studies/<study>/case-study.json
  pnpm case-lab:evaluate -- --report .tmp/case-lab/study-runs/<run>/report.json
  pnpm case-lab:janitor

Commands:
  import     Mirror an exported case into a persistent local source tenant.
  study      Build a reusable case-study file from an exported case.
  replay     Play a case study with an adaptive simulated user through Flue.
  evaluate   Re-score a case-study replay report.
  janitor    Drop leftover simulation tenants. Add --all to include imported source tenants.

Key options:
  --case-folder <path>   Folder produced by operator:export-case.
  --study <path>         case-study.json produced by case-lab study.
  --max-turns <n>        Maximum adaptive user turns. Default is 12.
  --out-dir <path>       Output root.
  --model <name>         Flue model override.
  --port <n>             Flue server port override.
  --variant <name>       Label the coach skill/runtime variant being tested.
  --all                  Janitor only: also drop case-lab-source tenants.

Environment:
  ADMIN_DATABASE_URL is required for import, replay, and janitor.
  Tenant-role grants use SAFETY_SECRETARY_APP_LOGIN_ROLE, DATABASE_APP_LOGIN_ROLE,
  or the username from DATABASE_URL.
`);
}
