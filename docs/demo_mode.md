# Demo Mode Guide

## Purpose

Demo mode provides a safe, isolated workspace for internal testing. It uses a dedicated demo org, a separate tenant database, and a dedicated storage root so no production data is touched.

## Enable Demo Mode

Set the following environment variables (see `.env.example`):

- `SAFETYSECRETARY_DEMO_LOGIN_ENABLED=true`
- `SAFETYSECRETARY_DEMO_ORG_SLUG=demo-org`
- `SAFETYSECRETARY_DEMO_ORG_NAME=SafetySecretary Demo`
- `SAFETYSECRETARY_DEMO_DB_URL=postgresql://.../safetysecretary_demo`
- `SAFETYSECRETARY_DEMO_STORAGE_ROOT=artifacts/demo`
- `SAFETYSECRETARY_DEMO_USER_USERNAME=testuser`
- `SAFETYSECRETARY_DEMO_USER_EMAIL=testuser@example.com`

Notes:
- The demo database must be separate from production databases.
- The demo storage root should not overlap with production storage paths.
- Demo login is disabled if any required variable is missing.

## Demo Login

- Use the "Login as test user" button on the login page.
- A banner will confirm demo mode and show a "Reset demo data" action.

## Demo Data Reset and Seeding

Available endpoints (demo org only):

- `POST /api/demo/reset` - clears demo data and seeds sample HIRA, JHA, and Incident cases.
- `POST /api/demo/seed/ra` - seeds a sample HIRA case only.
- `POST /api/demo/seed/jha` - seeds a sample JHA case only.
- `POST /api/demo/seed/incident` - seeds a sample Incident case only.

The demo banner provides a UI shortcut for the full reset. Case shells in demo mode also offer:

- "Create test case" (blank case)
- "Seed sample case" (pre-filled case)

## QA Checklist

1. Enable demo env vars and run the app.
2. Login using the demo button and confirm the demo banner appears.
3. Click "Reset demo data" and verify that sample cases are created.
4. Navigate directly to `/cases/invalid`, `/jha/invalid`, `/incidents/invalid`:
   - Confirm the demo create/seed actions appear.
5. JHA flow:
   - Move through Steps -> Hazards -> Controls -> Review.
   - Export the JHA PDF and verify the header/footer and table layout.
6. Incident flow:
   - Paste a narrative in the assistant, extract a draft, edit it, and apply the timeline.
7. Use the language switcher (EN/FR/DE) to confirm new UI copy is localized.

## Safety Reminder

Demo mode should never be enabled in production. Always point demo settings at a non-production database and storage path.
