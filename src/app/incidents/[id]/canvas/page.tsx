import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import IncidentCanvas, {
	type IncidentCanvasRecord,
} from "../../../../components/incident/canvas/IncidentCanvas";
import { buildIncidentInvestigationAgentContext } from "../../../../lib/agent/incident-investigation/context";
import { INCIDENT_COACH_SKILL } from "../../../../lib/agent/skills/incident-coach-v1";
import { AgentSurface, AgentWorkflowType } from "../../../../lib/agent/types";
import { resolveLocaleContext } from "../../../../lib/auth/locale-server";
import { KindEnum } from "../../../../lib/llm";

type IncidentCanvasPageProps = {
	params: Promise<{ id: string }> | { id: string };
	searchParams?:
		| Promise<Record<string, string | string[] | undefined>>
		| Record<string, string | string[] | undefined>;
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function IncidentCanvasPage({
	params,
	searchParams,
}: IncidentCanvasPageProps) {
	const { id } = await Promise.resolve(params);
	const query = await Promise.resolve(searchParams ?? {});
	const initialAsk = safeInitialAsk(query.ask);
	const { locale, session } = await resolveLocaleContext();

	if (!isUuid(id)) {
		notFound();
	}

	if (!session) {
		return (
			<main className="grid min-h-screen place-items-center bg-[var(--color-bg)] p-6 text-[var(--color-text)]">
				<p className="m-0 text-sm text-[var(--color-muted)]">
					Sign in to view this investigation canvas.
				</p>
			</main>
		);
	}

	const record = await loadIncidentCanvasRecord({
		incidentId: id,
		locale,
		tenantId: session.tenantId,
		userId: session.userId,
	});

	if (!record) {
		notFound();
	}

	return (
		<IncidentCanvas
			incidentId={id}
			initialAsk={initialAsk}
			initialRecord={record}
			locale={locale}
			userStorageId={session.userId}
		/>
	);
}

async function loadIncidentCanvasRecord({
	incidentId,
	locale,
	tenantId,
	userId,
}: {
	incidentId: string;
	locale: string;
	tenantId: string;
	userId: string;
}): Promise<IncidentCanvasRecord | null> {
	const bundle = await buildIncidentInvestigationAgentContext({
		metadata: {
			createdAt: new Date().toISOString(),
			kind: KindEnum.Authoring,
			locale,
			requiresVision: false,
			runId: randomUUID(),
			skill: {
				id: INCIDENT_COACH_SKILL.id,
				section: "canvas-view",
				version: INCIDENT_COACH_SKILL.version,
			},
			surface: AgentSurface.Workbench,
			tenantId,
			userId,
			workflowId: incidentId,
			workflowType: AgentWorkflowType.Ii,
		},
	});

	return (
		(bundle?.workflowSnapshot.sections as IncidentCanvasRecord | undefined) ??
		null
	);
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}

function safeInitialAsk(
	value: string | string[] | undefined,
): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const plainText = Array.from(value, (character) => {
		const code = character.charCodeAt(0);
		return code < 32 || code === 127 ? " " : character;
	})
		.join("")
		.trim();
	return plainText ? plainText.slice(0, 300) : undefined;
}
