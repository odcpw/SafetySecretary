import assert from "node:assert/strict";
import { once } from "node:events";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
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

const { decodeFlueIncidentInstanceId, encodeFlueIncidentInstanceId } =
	(await import(
		moduleUrl("src/lib/incident/coach-flue-ids.ts")
	)) as typeof import("../../../src/lib/incident/coach-flue-ids");
const { runIncidentCoachTurnViaFlue } = (await import(
	moduleUrl("src/lib/incident/coach-flue-runtime.ts")
)) as typeof import("../../../src/lib/incident/coach-flue-runtime");

test("flue incident instance ids round-trip tenant and incident ids", () => {
	const tenantId = "11111111-1111-4111-8111-111111111111";
	const incidentId = "22222222-2222-4222-8222-222222222222";
	const encoded = encodeFlueIncidentInstanceId({ incidentId, tenantId });

	assert.deepEqual(decodeFlueIncidentInstanceId(encoded), {
		incidentId,
		tenantId,
	});
	assert.equal(decodeFlueIncidentInstanceId("not-valid"), null);
});

test("flue coach runtime posts a prompt to a persistent agent instance", async () => {
	const tenantId = "11111111-1111-4111-8111-111111111111";
	const incidentId = "22222222-2222-4222-8222-222222222222";
	const userId = "33333333-3333-4333-8333-333333333333";
	const instanceId = encodeFlueIncidentInstanceId({ incidentId, tenantId });
	const requests: Array<{
		body: string;
		method: string | undefined;
		url: string | undefined;
	}> = [];
	const server = createServer(
		async (request: IncomingMessage, response: ServerResponse) => {
			const chunks: Buffer[] = [];
			for await (const chunk of request) {
				chunks.push(Buffer.from(chunk));
			}
			const body = Buffer.concat(chunks).toString("utf8");
			requests.push({ body, method: request.method, url: request.url });
			assert.equal(request.headers.authorization, "Bearer test-token");

			if (request.method === "POST") {
				response.writeHead(202, { "content-type": "application/json" });
				response.end(
					JSON.stringify({
						offset: "1",
						streamUrl: "/agents/incident-investigation/stream",
						submissionId: "submission-1",
					}),
				);
				return;
			}

			response.writeHead(200, {
				"content-type": "application/json",
				"Stream-Closed": "true",
				"Stream-Next-Offset": "2",
			});
			response.end(
				JSON.stringify([
					{
						eventIndex: 1,
						instanceId,
						isError: false,
						operationId: "op-test",
						operationKind: "prompt",
						result: {
							model: { id: "test-model", provider: "test-provider" },
							text: JSON.stringify({
								operations: [],
								reply: "What happened just before the slip?",
							}),
						},
						submissionId: "submission-1",
						timestamp: "2026-06-16T20:00:00.000Z",
						type: "operation",
						v: 1,
					},
				]),
			);
		},
	);
	server.listen(0, "127.0.0.1");
	await once(server, "listening");

	try {
		const address = server.address();
		assert.ok(address && typeof address === "object");
		const progress: Array<{ type: string; eventType?: string }> = [];
		const turn = await runIncidentCoachTurnViaFlue({
			env: {
				SSFW_FLUE_BASE_URL: `http://127.0.0.1:${address.port}`,
				SSFW_FLUE_TOKEN: "test-token",
			},
			incidentId,
			locale: "en",
			message: "Mara slipped near line 2.",
			onProgress: (event) => progress.push(event),
			tenantId,
			userId,
		});

		assert.equal(turn.agentName, "incident-investigation");
		assert.equal(turn.instanceId, instanceId);
		assert.equal(turn.model, "test-provider/test-model");
		assert.equal(turn.submissionId, "submission-1");
		assert.match(turn.text, /What happened/);
		assert.equal(requests.length, 2);
		assert.equal(requests[0]?.method, "POST");
		assert.equal(
			requests[0]?.url,
			`/agents/incident-investigation/${instanceId}`,
		);
		assert.equal(requests[1]?.method, "GET");
		assert.match(
			requests[1]?.url ?? "",
			new RegExp(`/agents/incident-investigation/${instanceId}.*offset=1`),
		);
		assert.match(requests[0]?.body ?? "", /Mara slipped near line 2/);
		assert.match(requests[0]?.body ?? "", /durable case-bound agent loop/);
		assert.match(requests[0]?.body ?? "", /read_incident_record/);
		assert.match(requests[0]?.body ?? "", /propose_action_plan/);
		assert.match(requests[0]?.body ?? "", /Europe\/Zurich/);
		assert.match(requests[0]?.body ?? "", /nowZurich/);
		assert.deepEqual(
			progress.map((event) =>
				event.type === "activity"
					? `${event.type}:${event.eventType}`
					: event.type,
			),
			["admitted", "activity:operation"],
		);
	} finally {
		server.close();
		await once(server, "close");
	}
});

function moduleUrl(relativePath: string): string {
	return pathToFileURL(relativePath).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}
