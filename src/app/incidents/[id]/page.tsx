import { redirect } from "next/navigation";

type IncidentViewProps = {
	params: Promise<{ id: string }> | { id: string };
};

/**
 * The incident record is the coach chat. There is no separate detail form: the
 * editable record panel lives inside the coach surface. Any visit to the bare
 * incident route redirects to that one chat-first surface. The coach page owns
 * invalid-id and not-found handling, so we redirect unconditionally.
 */
export default async function IncidentPage({ params }: IncidentViewProps) {
	const { id } = await Promise.resolve(params);
	redirect(`/incidents/${id}/coach`);
}
