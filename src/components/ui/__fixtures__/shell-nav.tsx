import Breadcrumbs from "../Breadcrumbs";
import SidebarNav from "../SidebarNav";
import Tabs from "../Tabs";
import TopBar from "../TopBar";

export const shellNavItems = [
	{ href: "/workspace", label: "Dashboard", icon: "D" },
	{ href: "/workspace/hiras", label: "HIRAs", icon: "H", active: true },
	{ href: "/workspace/incidents", label: "Incidents", icon: "I" },
];

export const breadcrumbItems = [
	{ href: "/workspace", label: "Dashboard" },
	{ href: "/workspace/hiras", label: "HIRAs" },
	{ href: "/workspace/hiras/pallet-handling", label: "Pallet handling" },
];

export const shellTabs = [
	{
		content: "Open hazards",
		label: "Hazards",
		value: "hazards",
	},
	{
		content: "Control measures",
		label: "Controls",
		value: "controls",
	},
	{
		content: "Review history",
		disabled: true,
		label: "History",
		value: "history",
	},
];

export function ShellNavFixture() {
	return (
		<div className="grid gap-4 bg-[var(--color-bg)] p-4 text-[var(--color-text)]">
			<TopBar
				actions={<button type="button">New HIRA</button>}
				brand="Safety Secretary"
				content={<span>HIRA workspace</span>}
			/>
			<div className="grid gap-4 md:grid-cols-[14rem_1fr]">
				<SidebarNav items={shellNavItems} />
				<main className="grid gap-4">
					<Breadcrumbs items={breadcrumbItems} />
					<Tabs activeValue="hazards" tabs={shellTabs} />
				</main>
			</div>
		</div>
	);
}
