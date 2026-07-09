import assert from "node:assert/strict";
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

const { computeProcessMapAltitudeView } = (await import(
	moduleUrl("src/lib/process-map/canvas.ts")
)) as typeof import("../../../src/lib/process-map/canvas");

test("process-map altitude view collapses deeper nodes into ancestor aggregates", () => {
	const result = computeProcessMapAltitudeView({
		altitude: 2,
		fogStates: new Map([
			["intake", "clear"],
			["production", "clear"],
			["blend", "clear"],
			["mould", "clear"],
			["dispatch", "fog"],
			["pack", "fog"],
			["invoice", "fog"],
		]),
		nodes: [
			node("intake", null, 0),
			node("production", null, 1),
			node("blend", "production", 0),
			node("mould", "production", 1),
			node("dispatch", null, 2),
			node("pack", "dispatch", 0),
			node("invoice", "dispatch", 1),
		],
		resources: [
			role("blend"),
			role("mould"),
			role("mould"),
			role("pack"),
			{ nodeId: "mould", resourceType: "EQUIPMENT" },
		],
	});

	assert.deepEqual([...result.visibleNodeIds].sort(), [
		"blend",
		"dispatch",
		"intake",
		"invoice",
		"mould",
		"pack",
		"production",
	]);
	assert.deepEqual([...result.collapsedNodeIds].sort(), []);

	const highAltitude = computeProcessMapAltitudeView({
		altitude: 1,
		fogStates: new Map([
			["intake", "clear"],
			["production", "clear"],
			["blend", "clear"],
			["mould", "clear"],
			["dispatch", "fog"],
			["pack", "fog"],
			["invoice", "fog"],
		]),
		nodes: [
			node("intake", null, 0),
			node("production", null, 1),
			node("blend", "production", 0),
			node("mould", "production", 1),
			node("dispatch", null, 2),
			node("pack", "dispatch", 0),
			node("invoice", "dispatch", 1),
		],
		resources: [
			role("blend"),
			role("mould"),
			role("mould"),
			role("pack"),
			{ nodeId: "mould", resourceType: "EQUIPMENT" },
		],
	});

	assert.deepEqual([...highAltitude.visibleNodeIds].sort(), [
		"dispatch",
		"intake",
		"production",
	]);
	assert.deepEqual([...highAltitude.collapsedNodeIds].sort(), [
		"dispatch",
		"production",
	]);
	assert.deepEqual(highAltitude.aggregatesByNodeId.get("production"), {
		childBlockCount: 2,
		fogShare: 0,
		peopleCount: 3,
	});
	assert.deepEqual(highAltitude.aggregatesByNodeId.get("dispatch"), {
		childBlockCount: 2,
		fogShare: 1,
		peopleCount: 1,
	});
	assert.equal(highAltitude.maxDepth, 2);
});

function node(id: string, parentId: string | null, orderIndex: number) {
	return {
		id,
		name: id,
		orderIndex,
		parentId,
	};
}

function role(nodeId: string) {
	return {
		nodeId,
		resourceType: "ROLE" as const,
	};
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(relativePath).href;
}
