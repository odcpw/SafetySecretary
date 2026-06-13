import Button from "../../ui/Button";
import MobileCaptureLayout from "../MobileCaptureLayout";

export function MobileCaptureLayoutFixture() {
	return (
		<MobileCaptureLayout
			actions={
				<>
					<Button variant="secondary">Save draft</Button>
					<Button>Continue</Button>
				</>
			}
			aria-label="Capture fixture"
			meta="Step 2 of 4"
			title="Capture"
		>
			<div className="grid gap-3">
				<label className="grid gap-1 text-sm">
					<span className="text-[var(--color-muted)]">Observation</span>
					<textarea
						className="min-h-32 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[var(--color-text)]"
						defaultValue="Describe what is visible."
					/>
				</label>
			</div>
		</MobileCaptureLayout>
	);
}

export default MobileCaptureLayoutFixture;
