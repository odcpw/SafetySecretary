import Button from "../../ui/Button";
import StickyActionBar from "../StickyActionBar";

export function StickyActionBarFixture() {
	return (
		<section
			aria-label="Sticky action bar fixture"
			className="min-h-80 bg-[var(--color-bg)] p-4 pb-24 pt-20 text-[var(--color-text)]"
		>
			<div className="grid gap-2 text-sm text-[var(--color-muted)]">
				<p>Fixture content area</p>
				<p>Scrollable workflow content sits behind the action surface.</p>
			</div>
			<StickyActionBar
				aria-label="Workflow actions"
				meta="Draft saved"
				primaryAction={<Button>Approve</Button>}
				secondaryAction={<Button variant="secondary">Back</Button>}
			/>
		</section>
	);
}

export default StickyActionBarFixture;
