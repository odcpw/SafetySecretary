import ComboBox from "../ComboBox";
import Select from "../Select";

export const severityOptions = [
	{ value: "A", label: "A - catastrophic" },
	{ value: "B", label: "B - major" },
	{ value: "C", label: "C - moderate" },
];

export const ownerOptions = [
	{ value: "owner-safety", label: "Safety specialist" },
	{ value: "owner-maintenance", label: "Maintenance lead" },
	{ value: "owner-operations", label: "Operations manager" },
];

export function PickerFixture() {
	return (
		<section
			aria-label="Picker fixture"
			className="grid gap-4 bg-[var(--color-bg)] p-4"
		>
			<Select
				label="Severity"
				name="severity"
				options={severityOptions}
				placeholder="Choose severity"
			/>
			<ComboBox
				label="Corrective action owner"
				options={ownerOptions}
				placeholder="Search owner"
			/>
		</section>
	);
}
