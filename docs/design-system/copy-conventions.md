# Microcopy and UI Copy Conventions

Binding conventions for all user-facing text in Safety Secretary: labels, buttons, error messages, empty states, loading states, toasts, tooltips, and agent-generated coaching prompts. Source: SPEC §Look And Feel, §Tone discipline (no-cheese guardrail), §Bar.

## Tone

- Calm, factual, Swiss-pragmatic. The product is an engineering tool, not a SaaS marketing funnel.
- Short over flowery. Specific over inspirational. Write at the level of a senior engineer briefing another engineer.
- Use the user's language register and their own terms; do not rewrite their hazard labels or control descriptions into corporate speak.
- No exclamation marks in system copy. No marketing emoji (🎉, ✅, 🔥, 👏). No mascot references.
- Coaching tone (for manager harness and agent replies): calm, adult, plain. Surface the next concrete step and the source it came from. One question, not a paragraph of prompts.

## Capitalisation

- Sentence case for all UI labels, titles, headings, and button text: "Save assessment", not "SAVE ASSESSMENT" or "Save Assessment".
- Proper nouns and codes retain their original casing: "SUVA", "HIRA", "S-T-O-P".
- Error messages begin with a capital letter and end with a period.
- Tooltips and descriptions follow sentence case with terminal punctuation.

## Error-message structure

- Format: **Problem** + **Remedy**. State what went wrong in one clause, then what the user should do.
- Never blame the user ("you failed to..."). Use neutral, no-blame phrasing: "The hazard has no severity set. Select a severity before saving."
- Do not include stack traces, HTTP status codes, or internal identifiers in user-facing messages. Log them server-side.
- If the error is caused by external state (e.g. storage full), state the condition and suggest the remedy: "Storage quota reached. Delete old attachments or contact your admin."

## Empty / loading / error state copy

- **Empty state:** State what is missing and offer one concrete next action. "No hazards identified yet. Click 'Add hazard' to begin."
- **Loading state:** Name what is happening. "Loading hazard register..." — not "Fetching your stuff" or "Just a moment ✨".
- **Error state:** Name the failure and the retry path. "Could not load corrective actions. Check your connection and try again."
- All three states avoid colour-only signalling; the text carries the meaning independently.

## Action verbs

- Prefer specific, domain-grounded verbs over generic ones: "Assess risk" instead of "Do", "Add step" instead of "Create item", "Export report" instead of "Download file".
- Avoid "Submit" — use the action name: "Save assessment", "Create HIRA", "Close incident".
- Avoid "Proceed" — use the destination: "Continue to risk rating", "Continue to controls".

## Anti-patterns (explicitly banned)

- Bouncy or gamified language: streaks, "great job!", XP scoring, leaderboards, confetti, badges for completion.
- Marketing emoji in any system copy or generated output.
- LinkedIn-style positivity slop: "You're doing amazing!", "Safety champions!", "Let's crush this assessment!".
- Decorative AI imagery on empty states or dashboards that carries no concrete risk-communication content.
- Corporate-cringe coaching: empty cheerleading, fake enthusiasm, excessive exclamation marks.
- Forced HR framings: "safety champion of the week", "team safety score", "kudos" widgets.

## No-blame wording for incident and finding copy

When generating or displaying copy about incidents, findings, or corrective actions, use no-blame language that describes the system condition, not the person:

- Instead of "Operator forgot to wear gloves" → "Gloves were not available at the workstation."
- Instead of "User failed to follow procedure" → "The procedure step was not completed."
- Instead of "Human error caused the near-miss" → "The control was not in place at the time of the event."
- Work-as-done prompts for supervisors: "What was actually happening on the floor?" not "Why didn't they follow the SOP?"

## Examples

| Context | Good | Bad |
|---|---|---|
| Button (submit) | "Save assessment" | "Submit 🎉" |
| Empty state | "No hazards identified yet. Click 'Add hazard' to begin." | "No worries — every project starts somewhere! 🚀" |
| Loading | "Loading hazard register..." | "Fetching your stuff ✨" |
| Error message | "The hazard has no severity set. Select a severity before saving." | "Oops! You forgot to pick a severity 😅" |
| Toast (success) | "HIRA saved." | "Great job! Assessment saved ✅" |
| Coaching prompt | "This hazard has only PPE-tier controls. Would you like to explore Technical controls?" | "Let's supercharge your safety game! 💪" |
| Finding description | "Gloves were not available at the workstation." | "Operator forgot to wear gloves." |
| Supervisor prompt | "What was actually happening on the floor?" | "Why didn't they follow the SOP?" |
