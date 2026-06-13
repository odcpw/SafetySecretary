// Coach end-to-end eval driver. Runs ON THE VPS (localhost:3000, header auth).
// Plays a naive frontline manager (LLM) against the REAL deployed coach, auto-
// accepts every proposed operation each turn (resolving refs), and runs the
// milling-finger story all the way to the coach's close — once per cause method.
// Dumps transcript + final cause tree per method to /tmp.
//
// Usage (on VPS): set -a; . /opt/safetysecretary-next/.env; set +a
//                 node scripts/dev/coach-eval-driver.mjs
import { writeFileSync } from "node:fs";

const BASE = process.env.EVAL_BASE ?? "http://localhost:3000";
const REPORTER_MODEL = process.env.EVAL_REPORTER_MODEL ?? "gpt-5.5";
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const MAX_TURNS = Number(process.env.EVAL_MAX_TURNS ?? 18);
const METHODS = (process.env.EVAL_METHODS ?? "FIVE_WHYS,URSACHENBAUM,ISHIKAWA").split(",");

// Session cookie jar + CSRF token, filled by login().
let COOKIE = "";
let CSRF = "";

function baseHeaders(stateChanging) {
	const h = { "content-type": "application/json" };
	if (COOKIE) h.cookie = COOKIE;
	if (stateChanging && CSRF) h["x-ssfw-csrf"] = CSRF;
	return h;
}

async function login() {
	const r = await fetch(`${BASE}/api/auth/dev-session`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
	const setCookies = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [];
	const jar = {};
	for (const c of setCookies) {
		const [pair] = c.split(";");
		const eq = pair.indexOf("=");
		if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
	}
	COOKIE = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
	CSRF = jar.ssfw_csrf ?? "";
	if (!jar.ssfw_session || !CSRF) throw new Error(`login failed (${r.status}): cookies=${Object.keys(jar).join(",")}`);
}

const FACTS = `THE INCIDENT (you witnessed/manage this; you are NOT a safety expert):
- A machinist at a conventional milling machine ("konventionelle Fräsmaschine") was removing metal chips/swarf ("Späne") from the work area with a steel ruler/scale ("Metallmassstab") while the cutter was still RUNNING.
- The ruler got drawn in between the rotating cutter and the workpiece. Reflexively he tried to pull it away and his finger went into the cutter.
- The finger was partially shortened (teilweise verkürzt / Teilamputation). He was treated on site by the ambulance and taken to surgery at the hospital (LUKS).
- It happened on Tuesday at about 09:45.
- Why clear chips while running: he needed a clear view of the workpiece surface and was checking tolerances/surface quality; pausing the process is awkward because of tolerances.
- Why the ruler: it was in his breast pocket, right to hand. Safe tools (compressed air / a chip hook "Spänehaken") existed but were in a drawer, not set up at the machine.
- He did not know the ruler could be drawn into the cutter.
- The instruction at work covered which tasks need the chip hook, but did NOT clearly say that rulers or metal parts must not go into the cutting zone while the cutter runs.
- There is no guard or interlock stopping a hand/object reaching the cutting zone while it runs (if asked).
- Possible measures you can think of if pushed: a clear rule + instruction, putting the chip hook and an air gun right at the machine. The department head ("Abteilungsleiter") can change rules; "Hans Muster" can set up the tools. If asked for technical/guarding ideas you genuinely don't know ("keine Ahnung").`;

const REPORTER_SYSTEM = `You are a busy frontline PRODUCTION MANAGER in a Swiss metalworking shop, reporting a real workplace accident to a safety-assistant chat. You are NOT a safety expert and you don't talk in safety jargon.
- Write in GERMAN, short and natural — usually one or two sentences, like a normal manager typing on a phone.
- Answer ONLY from the facts below. If asked something not in the facts, give a plausible ordinary answer, or say you're not sure ("weiss nicht", "keine Ahnung") — especially for technical/engineering measures.
- Do NOT volunteer analysis, root causes, or safety theory. React to what the assistant asks. You can be a little terse.
- When the assistant has clearly summarised the case and points you to an export / report / one-pager, reply briefly that it's fine ("ja, danke, das passt so") to end.
${FACTS}`;

async function jpost(path, body) {
	const r = await fetch(`${BASE}${path}`, { method: "POST", headers: baseHeaders(true), body: JSON.stringify(body) });
	const text = await r.text();
	let json = null;
	try { json = JSON.parse(text); } catch {}
	return { status: r.status, json, text };
}
async function jget(path) {
	const r = await fetch(`${BASE}${path}`, { headers: baseHeaders(false) });
	const text = await r.text();
	let json = null;
	try { json = JSON.parse(text); } catch {}
	return { status: r.status, json, text };
}

async function reporterReply(history) {
	// history: [{role:'coach'|'reporter', content}]
	const messages = [{ role: "system", content: REPORTER_SYSTEM }];
	for (const h of history) {
		messages.push({ role: h.role === "reporter" ? "assistant" : "user", content: h.content });
	}
	const r = await fetch("https://api.openai.com/v1/chat/completions", {
		method: "POST",
		headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_KEY}` },
		body: JSON.stringify({ model: REPORTER_MODEL, messages }),
	});
	const j = await r.json();
	if (!r.ok) throw new Error(`reporter LLM ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
	return j.choices?.[0]?.message?.content?.trim() ?? "(no reply)";
}

function looksLikeClose(text) {
	const t = (text || "").toLowerCase();
	return ["exportier", "one-pager", "onepager", "bericht erstellen", "zusammengefasst", "zusammenfassung", "report", "pdf"].some((k) => t.includes(k));
}

async function runMethod(method) {
	// 1. create draft
	const draft = await jpost("/api/incidents?draft=1", {});
	const incidentId = draft.json?.incident?.id ?? draft.json?.id ?? draft.json?.incidentId;
	if (!incidentId) throw new Error(`no incident id from draft: ${draft.status} ${draft.text.slice(0,200)}`);
	// 2. set method
	const setm = await jpost(`/api/incidents/${incidentId}/cause-method`, { causeMethod: method });
	// 3. converse
	const history = [];
	const transcript = [];
	let reporterMsg = "Bei uns ist gestern an der Fräsmaschine was passiert. Ein Mitarbeiter wollte die Späne mit dem Metallmassstab wegmachen während die Maschine noch lief, und dabei hat es ihm den Finger in den Fräser gezogen. Der Finger ist jetzt teilweise ab.";
	let closedSeen = 0;
	for (let turn = 0; turn < MAX_TURNS; turn++) {
		transcript.push({ role: "reporter", content: reporterMsg });
		history.push({ role: "reporter", content: reporterMsg });
		const chat = await jpost(`/api/incidents/${incidentId}/coach/chat`, { locale: "de", message: reporterMsg });
		if (chat.status !== 200) { transcript.push({ role: "error", content: `chat ${chat.status}: ${chat.text.slice(0,200)}` }); break; }
		// fetch canonical messages (ops carry ids)
		const msgs = (await jget(`/api/incidents/${incidentId}/coach/chat`)).json?.messages ?? [];
		const lastAssist = [...msgs].reverse().find((m) => m.role === "assistant" || m.role === "coach");
		const coachContent = lastAssist?.content ?? chat.json?.assistantMessage?.content ?? "(no content)";
		// auto-accept operations
		const ops = lastAssist?.operations ?? [];
		const decided = lastAssist?.operationDecisions ?? {};
		const recordMap = {};
		const applied = [];
		for (const op of ops) {
			if (decided[op.id]) continue;
			const res = await jpost(`/api/incidents/${incidentId}/coach/chat/apply`, {
				action: "apply", messageId: lastAssist.id, operationId: op.id, operationRecordMap: recordMap,
			});
			if (res.json?.ok && res.json?.applied?.recordId && op.ref) recordMap[op.ref] = res.json.applied.recordId;
			applied.push({ kind: op.kind, ref: op.ref ?? null, ok: !!res.json?.ok, code: res.json?.code ?? null });
		}
		transcript.push({ role: "coach", content: coachContent, applied });
		history.push({ role: "coach", content: coachContent });
		if (looksLikeClose(coachContent)) { closedSeen++; if (closedSeen >= 1) { reporterMsg = "Ja, danke, das passt so."; if (closedSeen >= 2) break; } }
		else { reporterMsg = await reporterReply(history); }
	}
	return { method, incidentId, transcript };
}

await login();
process.stderr.write("logged in (dev-session)\n");
const out = {};
for (const m of METHODS) {
	process.stderr.write(`\n=== running ${m} ===\n`);
	try { out[m] = await runMethod(m.trim()); }
	catch (e) { out[m] = { method: m, error: String(e) }; process.stderr.write(`ERROR ${m}: ${e}\n`); }
}
writeFileSync("/tmp/coach-eval-results.json", JSON.stringify(out, null, 2));
process.stderr.write("\nWROTE /tmp/coach-eval-results.json\n");
for (const m of METHODS) {
	const r = out[m.trim()];
	process.stderr.write(`${m}: ${r?.error ? "ERROR " + r.error : (r?.incidentId + " turns=" + (r?.transcript?.length))}\n`);
}
