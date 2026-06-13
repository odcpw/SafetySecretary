import Button from "../../ui/Button";
import InspectorPanel from "../InspectorPanel";

export function InspectorPanelFixture() {
	return (
		<section
			aria-label="Inspector fixture"
			className="min-h-80 bg-[var(--color-bg)] p-4 text-[var(--color-text)]"
		>
			<p className="text-sm text-[var(--color-muted)]">
				Primary work surface remains visible behind the inspector.
			</p>
			<InspectorPanel
				isOpen
				onClose={() => undefined}
				title="Details"
			>
				<p className="text-sm text-[var(--color-muted)]">
					Review selected item properties.
				</p>
				<div className="flex justify-end gap-2">
					<Button variant="secondary">Close</Button>
					<Button>Save</Button>
				</div>
			</InspectorPanel>
		</section>
	);
}

export default InspectorPanelFixture;
