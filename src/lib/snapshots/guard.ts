export type SnapshotMutationAction = "update" | "delete";

export class SnapshotImmutableError extends Error {
	readonly code = "snapshot_immutable";
	readonly action: SnapshotMutationAction;
	readonly snapshotId: string | null;

	constructor(action: SnapshotMutationAction, snapshotId?: string | null) {
		super(
			snapshotId
				? `Approval snapshot ${snapshotId} is immutable; ${action} is not permitted.`
				: `Approval snapshots are immutable; ${action} is not permitted.`,
		);
		this.name = "SnapshotImmutableError";
		this.action = action;
		this.snapshotId = snapshotId ?? null;
	}
}

export function guardSnapshotMutation(
	action: SnapshotMutationAction,
	snapshotId?: string | null,
): never {
	throw new SnapshotImmutableError(action, snapshotId);
}
