# Safety Secretary

Safety Secretary helps a frontline manager run a proper workplace‑incident
investigation just by talking it through. You describe what happened in plain
language; a coach asks the right follow‑up questions and quietly fills in a
complete, structured investigation behind the scenes.

It works in English, German, French, and Italian.

## What it does

The heart of Safety Secretary is the **Incident Investigation coach** — a chat
that turns a conversation into a finished investigation:

- **Tell the story.** Describe the incident however it comes out. The coach
  captures the facts, the timeline, who and what was involved, and how serious
  it could realistically have been.
- **Find the real causes.** It builds a cause tree with you, using the method
  you prefer:
  - **5 Whys** — the simple, teachable version.
  - **Cause tree** (*Ursachenbaum* / *arbre des causes*) — the rigorous,
    fact‑by‑fact version.
  - **Ishikawa fishbone** — sort causes into categories (machine, method,
    people, environment…), then dig into the ones that matter.
  You can switch methods mid‑investigation, and the coach will offer to re‑cast
  what you already have into the new shape.
- **Decide what to change.** It helps you agree on concrete measures — who does
  what, by when — and pushes for fixes that actually stick.
- **Produce the paperwork.** One click gives you a full report and a one‑page
  summary.

Everything the coach suggests is a proposal you accept, edit, or reject —
nothing lands in the record unless you say so. The goal is simple: capture
**more than most people would ever write down on their own**, without the
bureaucracy.

## Run it yourself (bring your own OpenAI key)

Safety Secretary is open source and self-hostable. It talks to OpenAI using
*your* own API key, so you stay in control of the model and the cost.

You'll need [Node.js](https://nodejs.org), [pnpm](https://pnpm.io), and
[Docker](https://www.docker.com) (for the local database).

```bash
# 1. Get the code
git clone https://github.com/odcpw/SafetySecretary.git
cd SafetySecretary

# 2. Install dependencies
pnpm install

# 3. Set up your environment
cp .env.example .env
```

Open `.env` and set these:

```
OPENAI_API_KEY=sk-...              # your own OpenAI key
SAFETYSECRETARY_DEV_AUTH_BYPASS=1  # skip the login screen for local use
NEXT_PUBLIC_SAFETYSECRETARY_DEV_AUTH_BYPASS=1
```

Optional OAuth sign-in can be enabled alongside magic links:

```
MICROSOFT_OAUTH_CLIENT_ID=...
MICROSOFT_OAUTH_CLIENT_SECRET=...
MICROSOFT_OAUTH_TENANT=common
NEXT_PUBLIC_MICROSOFT_OAUTH_ENABLED=1

GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=1
```

Use these redirect URIs in the provider consoles:

```
https://your-domain.example/api/auth/oauth/microsoft/callback
https://your-domain.example/api/auth/oauth/google/callback
```

For Microsoft, configure the app registration so ID tokens include `email` and
the domain-owner-verified `xms_edov` claim. Safety Secretary does not use
unverified Microsoft email claims for workspace auto-join. Microsoft consumer
accounts that do not emit `xms_edov` should use magic-link sign-in.

```bash
# 4. Start the database and load a demo incident
pnpm dev:bootstrap

# 5. Run it
pnpm dev
```

Open <http://localhost:3000>, start a new incident (or open the demo one), and
just begin typing.

## Status

Safety Secretary is early and deliberately focused. The Incident Investigation
coach is the part that's built out and usable today. Other modules — hazard
assessments, job‑hazard analyses, and more — are planned but not here yet.

## About Contributions

Please don't take this the wrong way, but I do not accept outside contributions
for any of my projects. I simply don't have the mental bandwidth to review
anything, and it's my name on the thing, so I'm responsible for any problems it
causes; thus, the risk‑reward is highly asymmetric from my perspective. I'd also
have to worry about other "stakeholders," which seems unwise for tools I mostly
make for myself for free. Feel free to submit issues, and even PRs if you want
to illustrate a proposed fix, but know I won't merge them directly. Instead,
I'll have Claude or Codex review submissions via `gh` and independently decide
whether and how to address them. Bug reports in particular are welcome. Sorry if
this offends, but I want to avoid wasted time and hurt feelings. I understand
this isn't in sync with the prevailing open‑source ethos that seeks community
contributions, but it's the only way I can move at this velocity and keep my
sanity.

## License

Safety Secretary is open source under the MIT License. See [LICENSE](LICENSE).
