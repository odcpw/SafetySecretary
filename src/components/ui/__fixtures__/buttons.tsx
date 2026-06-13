import Button from "../Button";
import IconButton from "../IconButton";
import SegmentedControl from "../SegmentedControl";

export const phaseOptions = [
	{ label: "Baseline", value: "baseline" },
	{ label: "Residual", value: "residual" },
	{ label: "Review", value: "review" },
];

export function ButtonsFixture() {
	return (
		<section
			aria-label="Button fixture"
			className="grid gap-4 bg-[var(--color-bg)] p-4 text-[var(--color-text)]"
		>
			<div className="flex flex-wrap gap-2">
				<Button>Save HIRA</Button>
				<Button variant="secondary">Preview</Button>
				<Button variant="ghost">Cancel</Button>
				<Button variant="destructive">Delete</Button>
				<Button loading>Saving</Button>
				<Button disabled>Disabled</Button>
			</div>
			<div className="flex flex-wrap gap-2">
				<IconButton aria-label="Collapse sidebar" icon="C" />
				<IconButton aria-label="Close dialog" icon="X" variant="ghost" />
				<IconButton aria-label="Disabled action" disabled icon="D" />
			</div>
			<SegmentedControl
				aria-label="Risk view"
				onChange={() => undefined}
				options={phaseOptions}
				value="baseline"
			/>
		</section>
	);
}
