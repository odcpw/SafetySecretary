import { notFound } from "next/navigation";
import ProcessMapCanvas, {
	type ProcessMapCanvasRecord,
} from "../../../components/process-map/ProcessMapCanvas";
import { resolveLocaleContext } from "../../../lib/auth/locale-server";
import {
	loadProcessMap,
	type ProcessEdge,
	type ProcessFlow,
	type ProcessMap,
	type ProcessNode,
	type ProcessResource,
} from "../../../lib/process-map";
import { computeProcessMapReadiness } from "../../../lib/process-map/readiness";

type ProcessMapPageProps = {
	params: Promise<{ id: string }> | { id: string };
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ProcessMapPage({ params }: ProcessMapPageProps) {
	const { id } = await Promise.resolve(params);

	if (!isUuid(id)) {
		notFound();
	}

	const { session } = await resolveLocaleContext();

	if (!session) {
		return (
			<main className="grid min-h-screen place-items-center bg-[var(--color-bg)] p-6 text-[var(--color-text)]">
				<p className="m-0 text-sm text-[var(--color-muted)]">
					Sign in to view this process map.
				</p>
			</main>
		);
	}

	const record = await loadProcessMap(session.tenantId, id);

	if (!record) {
		notFound();
	}

	return (
		<ProcessMapCanvas
			record={{
				edges: record.edges.map(serializeProcessEdge),
				flows: record.flows.map(serializeProcessFlow),
				map: serializeProcessMap(record.map),
				nodes: record.nodes.map(serializeProcessNode),
				readiness: computeProcessMapReadiness(record),
				resources: record.resources.map(serializeProcessResource),
			}}
		/>
	);
}

function serializeProcessMap(map: ProcessMap): ProcessMapCanvasRecord["map"] {
	return {
		...map,
		createdAt: map.createdAt.toISOString(),
		deletedAt: map.deletedAt?.toISOString() ?? null,
		updatedAt: map.updatedAt.toISOString(),
	};
}

function serializeProcessNode(
	node: ProcessNode,
): ProcessMapCanvasRecord["nodes"][number] {
	return {
		...node,
		createdAt: node.createdAt.toISOString(),
		updatedAt: node.updatedAt.toISOString(),
	};
}

function serializeProcessEdge(
	edge: ProcessEdge,
): ProcessMapCanvasRecord["edges"][number] {
	return {
		...edge,
		createdAt: edge.createdAt.toISOString(),
		updatedAt: edge.updatedAt.toISOString(),
	};
}

function serializeProcessFlow(
	flow: ProcessFlow,
): ProcessMapCanvasRecord["flows"][number] {
	return {
		...flow,
		createdAt: flow.createdAt.toISOString(),
		updatedAt: flow.updatedAt.toISOString(),
	};
}

function serializeProcessResource(
	resource: ProcessResource,
): ProcessMapCanvasRecord["resources"][number] {
	return {
		...resource,
		createdAt: resource.createdAt.toISOString(),
		updatedAt: resource.updatedAt.toISOString(),
	};
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
