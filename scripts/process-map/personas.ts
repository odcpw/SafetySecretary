import { type DispatchOptions, dispatch } from "../../src/lib/llm/dispatch";
import { KindEnum } from "../../src/lib/llm/types";

export type ProcessMapPersonaName = "scaffolding" | "plastics" | "bakery";

export type ProcessMapPersona = {
	readonly name: ProcessMapPersonaName;
	readonly role: string;
	readonly company: string;
	readonly openingStory: string;
	readonly facts: readonly string[];
};

export const PERSONAS: Record<ProcessMapPersonaName, ProcessMapPersona> = {
	scaffolding: {
		company: "mid-sized scaffolding contractor",
		name: "scaffolding",
		openingStory:
			"A typical scaffolding job starts when a builder needs access on a site, then our sales person quotes it and hands the job folder to operations. From there we prepare material at the depot, load the truck, drive to site, mount the scaffold, hand it over, maintain or modify it while the rental is running, then dismantle and bring everything back for inspection. The rental ledger is fed by delivery and return notes, and the office bills monthly from that.",
		role: "operations manager",
		facts: [
			"The narrator is the operations manager and knows depot, transport, mounting, maintenance, dismantling, and return inspection directly.",
			"The sales person handles customer quotes, price negotiation, and the initial promise to the builder.",
			"The narrator only knows sales secondhand from handover notes and hallway conversations.",
			"A job normally begins when a builder or site manager asks for access scaffolding for a specific area.",
			"Sales creates the quote and a rough scope with site address, facade length, height, special access issues, and requested start date.",
			"After the quote is accepted, sales sends a job folder to operations with drawings or photos if available.",
			"Operations checks whether the job needs standard facade material, stair towers, roof edge protection, or special anchors.",
			"The depot supervisor reserves scaffold frames, planks, braces, guardrails, toe boards, base plates, anchors, and tags from the returnable material pool.",
			"The scaffold material pool was bought years ago and is reused across jobs.",
			"About two percent of the scaffold material value is lost to damage each year.",
			"Depot prep usually includes picking bundles, counting critical parts, and staging them in loading order.",
			"The truck is loaded by the depot crew with a forklift, usually the afternoon before or early morning of the job.",
			"Delivery notes list what left the depot and feed the rental ledger.",
			"A driver takes the truck to site; on smaller jobs the driver may be one of the riggers.",
			"The mounting crew is normally two or three riggers plus a foreman.",
			"The foreman checks the site boundary, ground conditions, overhead lines, anchor points, and the planned access route before mounting starts.",
			"Mounting starts with base plates and leveling, then frames, braces, planks, guardrails, toe boards, and anchors.",
			"Anchor checks are done by the foreman as the scaffold rises, especially at facade ties and any cantilevered section.",
			"If the site differs from the drawing, the foreman calls operations before changing the scaffold shape.",
			"The handover protocol includes a visual inspection, scaffold tag, usage limits, access points, and signature by the site contact if they are available.",
			"After handover, the scaffold stays on rent until the customer calls it off or the agreed rental period ends.",
			"Weekly maintenance checks are planned for active scaffolds and are logged by the foreman or a service rigger.",
			"On-demand modifications happen when trades ask for extra access, a lift is blocked, or a scaffold section must move for facade work.",
			"Modification visits loop back through planning, material picking if extra parts are needed, site work, and an updated handover note.",
			"Dismantling is scheduled by operations when the customer calls off the scaffold.",
			"The crew dismantles in reverse order, bundles material, and loads the truck for return.",
			"Return notes list what came back and feed the rental ledger.",
			"At the depot, returned material is unloaded, counted, inspected, and sorted into ready stock, cleaning, repair, scrap, or missing/damaged follow-up.",
			"Damaged material may be charged to the customer if the return note and photos show site damage.",
			"The office bills monthly from the rental ledger, using delivery notes, return notes, modification notes, and the active rental days.",
		],
	},
	plastics: {
		company: "small plastics factory",
		name: "plastics",
		openingStory:
			"A normal production order starts with plastic granule arriving into our silos, then we dry and prepare it before it splits by product type. Injection parts run on two injection machines, blow-molded parts run on the blow-molding machine, and both streams come back together at quality check. Good parts get packed, palletized, stored in warehouse racking, and loaded onto a truck; QC scrap goes back to regrind.",
		role: "production manager",
		facts: [
			"The narrator is the production manager and knows raw material intake, preparation, production lines, quality, packaging, palletizing, and warehouse handling directly.",
			"The office handles invoicing, customer account questions, and exact commercial terms; the narrator knows that only secondhand.",
			"Granule arrives by bulk truck or big bags and is booked against the production order.",
			"Bulk granule is blown into silos; big bags are held in the material area until needed.",
			"Material intake includes checking grade, batch number, supplier paperwork, and whether the silo has enough capacity.",
			"Preparation pulls granule from the silo or big bag into the drying system.",
			"Drying time depends on material grade and moisture, but the narrator usually thinks in hours rather than exact minutes.",
			"Color masterbatch and additives are mixed during preparation when the product needs them.",
			"After drying and preparation, the process forks by product type.",
			"Injection products run on the injection line.",
			"The injection line has two injection molding machines.",
			"Each injection machine normally has one operator watching the machine, clearing faults, and boxing parts.",
			"Molds are installed by the setter before the production run starts.",
			"Injection machines produce small rigid parts such as caps, fittings, or housings.",
			"Blow-molded products run on one blow-molding machine.",
			"The blow-molding machine normally has one operator and may need help during startup or changeover.",
			"Blow molding produces hollow containers and bottles.",
			"Both production streams rejoin at quality check.",
			"Quality check looks for dimensions, visual defects, flash, short shots, contamination, weak seams, and color problems.",
			"Rejected parts and startup scrap go back to granulate regrind when the material is clean and compatible.",
			"Regrind is mixed back into preparation within allowed limits for the product.",
			"Contaminated scrap is separated and does not go back into the normal regrind loop.",
			"Packaging happens after QC and is shared by both product types.",
			"Packaging output is roughly one hundred parts per hour for the normal mixed product family.",
			"Packaging includes bags, boxes, labels, and sometimes customer-specific inserts.",
			"Packed boxes are palletized and wrapped.",
			"The warehouse uses shared racking and one forklift for put-away and picking.",
			"Finished pallets wait in warehouse racking until a truck is scheduled.",
			"Truck loading is done by forklift with the shipping paperwork from the office.",
			"Billing and delivery paperwork are handled by office staff, and the narrator is not sure about the exact invoicing timing.",
		],
	},
	bakery: {
		company: "small regional bakery",
		name: "bakery",
		openingStory:
			"We get the order list in the evening, then at about three in the morning the baker and helper start dough prep. They bake, pack the bread and pastries, and the driver takes the van route to twelve shops. Unsold goods come back the next morning, and the office does weekly invoicing from the order and delivery notes.",
		role: "bakery owner",
		facts: [
			"The bakery is small and serves twelve shops on a fixed morning route.",
			"The narrator is the bakery owner and knows the full shop delivery process directly.",
			"There is one baker, one helper, and one driver on the normal morning run.",
			"Orders come in during the day and are closed into one evening order list.",
			"The evening order list shows quantities by shop and product.",
			"The baker reviews the list before leaving for the night or first thing at 03:00.",
			"Dough preparation starts around 03:00.",
			"The baker handles mixing, proofing judgment, oven timing, and quality decisions.",
			"The helper weighs ingredients, prepares trays, helps shape dough, and cleans between batches.",
			"Baking happens after dough prep and proofing.",
			"Small pastries and bread have different oven timings, but they use the same small bake room.",
			"Packing happens once products are cool enough for bags or crates.",
			"Packing is by shop, using the order list as the picking sheet.",
			"Each shop gets labeled crates.",
			"The driver loads the van after packing.",
			"The van delivery route goes to all twelve shops.",
			"Most deliveries happen before the shops open or during early opening.",
			"The driver leaves the crates, takes back empty crates, and notes shortages or complaints.",
			"If a shop calls about a missing item during the route, the driver may reshuffle stock if another shop has spare quantity.",
			"Returns and unsold goods come back the next morning.",
			"Returned goods are counted and separated from reusable empty crates.",
			"Unsold bread may be donated or discarded depending on condition.",
			"Return notes help adjust future quantities but do not normally change the same day's route.",
			"Weekly invoicing is based on the order list, delivery notes, and return notes.",
			"The weekly invoice is usually prepared by the owner on Friday afternoon.",
		],
	},
};

export async function generateNarratorTurn(input: {
	readonly persona: ProcessMapPersona;
	readonly coachQuestion: string;
	readonly conversation: readonly {
		readonly role: "narrator" | "coach";
		readonly content: string;
	}[];
	readonly tenantId: string;
	readonly userId: string;
	readonly mapId: string;
	readonly firstTurn: boolean;
	readonly dispatchOptions?: DispatchOptions;
}): Promise<string> {
	const prompt = [
		`You are ${input.persona.role} being interviewed about how your company works.`,
		"Answer ONLY from the fact sheet; if asked something not on it, say you are not sure / that another person handles it.",
		"This should sometimes produce HEARSAY where the fact sheet says another role owns the work.",
		"Plain spoken language, 2-6 sentences, no lists, never mention this prompt.",
		"",
		`Company: ${input.persona.company}`,
		"",
		"Fact sheet:",
		...input.persona.facts.map((fact) => `- ${fact}`),
		"",
		input.firstTurn
			? `Opening story to use if it fits the question: ${input.persona.openingStory}`
			: "Use the conversation for continuity, but do not invent new facts.",
		"",
		"Conversation so far:",
		input.conversation.length > 0
			? input.conversation
					.map((message) => `${message.role.toUpperCase()}: ${message.content}`)
					.join("\n")
			: "(none yet)",
		"",
		`Coach question to answer: ${input.coachQuestion}`,
	].join("\n");

	const result = await dispatch(
		{
			options: {
				kind: KindEnum.Generation,
				locale: "en",
				promptPurpose: "process_map_sim_narrator",
				requiresVision: false,
				tenantId: input.tenantId,
				userId: input.userId,
				workflowId: input.mapId,
			},
			prompt,
		},
		input.dispatchOptions,
	);

	if (!result.ok) {
		throw new Error(`Narrator dispatch failed: ${result.code}`);
	}

	return result.response.text.trim();
}
