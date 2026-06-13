import Drawer from "../Drawer";
import Modal from "../Modal";
import Toast from "../Toast";
import Tooltip from "../Tooltip";

export function OverlaysFixture() {
	return (
		<section
			aria-label="Overlay fixture"
			className="grid gap-4 bg-[var(--color-bg)] p-4 text-[var(--color-text)]"
		>
			<Tooltip content="Hazard Identification and Risk Assessment" delay={0}>
				<button type="button">HIRA</button>
			</Tooltip>
			<Toast message="HIRA saved successfully" />
			<Toast message="Unable to save HIRA" variant="error" />
			<Modal isOpen onClose={() => undefined} title="Confirm delete">
				<p>Delete this hazard?</p>
				<button type="button">Delete</button>
				<button type="button">Cancel</button>
			</Modal>
			<Drawer isOpen onClose={() => undefined} title="Hazard details">
				<p>Review the selected hazard before saving.</p>
				<button type="button">Save</button>
				<button type="button">Close</button>
			</Drawer>
		</section>
	);
}
