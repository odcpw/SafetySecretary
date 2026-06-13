#!/usr/bin/env -S node --experimental-strip-types
/**
 * Manual ADR-0006 D10 agent-runtime harness.
 *
 * This script is deliberately outside CI. It refuses to run unless
 * LLM_VALIDATION_OK=1 is set, uses synthetic context only, and records package /
 * runtime / skill evidence without secrets.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentContextBundle, AgentRunInput } from "../../src/lib/agent";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (context.parentURL && specifier.startsWith(".")) {
			const candidates = [
				new URL(`${specifier}.ts`, context.parentURL),
				new URL(`${specifier}.tsx`, context.parentURL),
				new URL(`${specifier}/index.ts`, context.parentURL),
			];
			const resolved = candidates.find((candidate) => existsSync(candidate));

			if (resolved) {
				return {
					shortCircuit: true,
					url: resolved.href,
				};
			}
		}

		return nextResolve(specifier, context);
	},
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, "..", "..");
const EVIDENCE_DIR = path.join(PROJECT_ROOT, "evidence", "agent-runtime");
const GATE_MESSAGE =
	"Refusing to run agent-runtime harness: LLM_VALIDATION_OK=1 is required per ADR-0005 D7 and ADR-0006 D10.";

type ParsedArgs = {
	readonly writeEvidence: boolean;
	readonly output?: string;
};

type HarnessEvidence = {
	readonly generatedAt: string;
	readonly package: {
		readonly selected: "@earendil-works/pi-coding-agent";
		readonly cliPath: string | null;
		readonly version: string | null;
	};
	readonly runtime: {
		readonly transport: "fake-agent-transport";
		readonly runId: string;
		readonly status: string;
		readonly contextDigest: string;
		readonly operationCount: number;
		readonly modelCallCount: number;
		readonly verificationCheckCount: number;
	};
	readonly provider: {
		readonly name: "mock/no-real-provider";
		readonly model: "synthetic-fixture";
		readonly realProviderConstructed: false;
	};
	readonly skill: {
		readonly id: string;
		readonly version: string;
		readonly section: string;
	};
	readonly privacy: {
		readonly syntheticDataOnly: true;
		readonly containsPhotoBytes: false;
		readonly secretsRecorded: false;
	};
};

async function main(): Promise<void> {
	if (process.env.LLM_VALIDATION_OK !== "1") {
		throw new Error(GATE_MESSAGE);
	}

	const args = parseArgs(process.argv.slice(2));
	const evidence = await runHarness();
	const rendered = renderEvidence(evidence);
	console.log(rendered);

	if (args.writeEvidence || args.output) {
		const outputPath =
			args.output ??
			path.join(
				EVIDENCE_DIR,
				`${new Date().toISOString().slice(0, 10)}-agent-runtime.md`,
			);
		await mkdir(path.dirname(outputPath), { recursive: true });
		await writeFile(outputPath, `${rendered}\n`, "utf8");
		console.log(`Evidence written: ${path.relative(PROJECT_ROOT, outputPath)}`);
	}
}

async function runHarness(): Promise<HarnessEvidence> {
	const {
		AgentAllowedOperationTarget,
		AgentConfirmationMode,
		AgentFakeTransport,
		AgentOperationKind,
		AgentSkillRegistry,
		AgentSurface,
		AgentWorkflowType,
		InMemoryAgentTraceStore,
		assertAgentContextHasNoPhotoPayloads,
		createAgentRuntime,
		digestContext,
	} = (await import(
		"../../src/lib/agent/index"
	)) as typeof import("../../src/lib/agent");

	const generatedAt = new Date("2026-05-12T08:30:00.000Z").toISOString();
	const skill = { id: "ii", version: "0.0.0-fake", section: "timeline" };
	const input: AgentRunInput = {
		runId: "manual-agent-runtime-harness",
		tenantId: "tenant-synthetic",
		userId: "user-synthetic",
		workflowType: AgentWorkflowType.Ii,
		workflowId: "incident-synthetic",
		locale: "en",
		kind: "authoring",
		requiresVision: false,
		skill,
		surface: AgentSurface.Workbench,
	};
	const context: AgentContextBundle = {
		metadata: {
			...input,
			runId: input.runId ?? "manual-agent-runtime-harness",
			createdAt: generatedAt,
		},
		workflowSnapshot: {
			sections: {
				basics: {
					title: "Synthetic cable trip near miss",
					incidentType: "near_miss",
				},
				timeline: {
					events: [
						{ phase: "before", title: "Cable routed across walking path" },
						{ phase: "event", title: "Worker tripped" },
						{ phase: "after", title: "Area isolated" },
					],
				},
			},
			attachmentRefs: [{ type: "photo", id: "synthetic-photo-ref" }],
		},
		methodologyRefs: [{ id: "ii.timeline" }, { id: "stop.definitions" }],
		sameCompanyPatterns: [],
		conversationHistory: [
			{
				id: "msg-1",
				role: "user",
				text: "Synthetic incident narrative only.",
				createdAt: generatedAt,
			},
		],
		companyMemoryExcerpts: [],
		generatedArtifacts: [],
	};
	assertAgentContextHasNoPhotoPayloads(context);
	assert.equal(JSON.stringify(context).includes("sk-"), false);
	const contextDigest = digestContext(context);
	const transport = new AgentFakeTransport([
		{
			contextDigest,
			skill,
			operations: [
				{
					id: "manual-agent-runtime-harness:op-1",
					runId: "manual-agent-runtime-harness",
					skill,
					kind: AgentOperationKind.AskQuestion,
					target: AgentAllowedOperationTarget.Conversation,
					confirmationMode: AgentConfirmationMode.AskOnly,
					sourceRefs: [{ type: "conversation", id: "msg-1" }],
					payload: { question: "Where exactly was the cable routed?" },
				},
			],
			modelCalls: [
				{
					provider: "fake-agent-transport",
					model: "synthetic-fixture",
					inputTokens: 40,
					outputTokens: 13,
					promptRedacted: true,
					responseRedacted: true,
				},
			],
			verificationChecks: [
				{
					id: "synthetic-context-redacted",
					label: "synthetic agent context contains refs only, no photo bytes",
					status: "passed",
					checkedAt: generatedAt,
				},
			],
		},
	]);
	const registry = new AgentSkillRegistry();
	registry.register(
		transport.asSkillRegistration({
			id: skill.id,
			version: skill.version,
			workflowTypes: [AgentWorkflowType.Ii],
			surfaces: [AgentSurface.Workbench],
		}),
	);
	const runtime = createAgentRuntime({
		traceStore: new InMemoryAgentTraceStore(),
		skillRegistry: registry,
		assembleContext: () => context,
		now: () => new Date(generatedAt),
	});
	const result = await runtime.dispatch(input);
	assert.equal(result.status, "awaiting_confirmation");
	assert.equal(result.trace.modelCalls.length, 1);
	assert.equal(result.trace.verificationChecks.length, 1);

	const packageEvidence = selectedPackageEvidence();
	return {
		generatedAt: new Date().toISOString(),
		package: packageEvidence,
		runtime: {
			transport: "fake-agent-transport",
			runId: result.runId,
			status: result.status,
			contextDigest,
			operationCount: result.operations.length,
			modelCallCount: result.trace.modelCalls.length,
			verificationCheckCount: result.trace.verificationChecks.length,
		},
		provider: {
			name: "mock/no-real-provider",
			model: "synthetic-fixture",
			realProviderConstructed: false,
		},
		skill: {
			id: skill.id,
			version: skill.version,
			section: skill.section,
		},
		privacy: {
			syntheticDataOnly: true,
			containsPhotoBytes: false,
			secretsRecorded: false,
		},
	};
}

function selectedPackageEvidence(): HarnessEvidence["package"] {
	const cliPath = readCommand("bash", ["-lc", "command -v pi || true"]) || null;
	const version = cliPath ? readCommand("pi", ["--version"]) || null : null;
	return {
		selected: "@earendil-works/pi-coding-agent",
		cliPath,
		version,
	};
}

function readCommand(command: string, args: readonly string[]): string {
	const result = spawnSync(command, [...args], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		timeout: 15000,
	});

	if (result.error || result.status !== 0) {
		return "";
	}

	return (result.stdout.trim() || result.stderr.trim()).trim();
}

function renderEvidence(evidence: HarnessEvidence): string {
	return [
		"# Agent Runtime Harness Evidence",
		"",
		`Generated: ${evidence.generatedAt}`,
		"",
		"```json",
		JSON.stringify(evidence, null, 2),
		"```",
		"",
		"## Reviewer Checklist",
		"",
		"- [ ] Confirms only synthetic incident content is present.",
		"- [ ] Confirms no prompt/response bodies, secrets, or photo bytes are recorded.",
		"- [ ] Confirms this harness was run manually with `LLM_VALIDATION_OK=1` and is not part of CI.",
	].join("\n");
}

function parseArgs(args: readonly string[]): ParsedArgs {
	let writeEvidence = false;
	let output: string | undefined;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--write-evidence") {
			writeEvidence = true;
			continue;
		}
		if (arg === "--output") {
			output = args[index + 1];
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}

	return { writeEvidence, output };
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
