# TUI Sample QA Checklist

Use this checklist to validate the TUI sample (Home + HIRA) before expanding to other modules.

## Access + Auth
- Visit `http://localhost:5173/tui` (dev) and confirm it loads.
- Confirm unauthenticated access redirects to GUI login.
- Log in via GUI, then use "Switch to TUI" to enter TUI.

## Theme + Navigation
- Toggle light/dark in TUI and confirm theme changes.
- Use "Switch to GUI" and confirm it returns to the GUI without logging in again.
- Confirm the TUI back button returns to the TUI home.

## TUI HIRA Landing
- Load a case by ID (valid + invalid IDs).
- Create a new case and confirm it opens in the TUI case view.
- Confirm recent cases load; refresh works.
- Delete a recent case and confirm the list refreshes.

## TUI HIRA Case
- Grid view renders and keyboard navigation works (arrows + Enter + Esc).
- Summary view renders counts for steps and hazards.
- Switch to GUI from a TUI case and confirm the case ID is preserved.

## Deep Links
- Open `/tui/hira` directly and confirm it loads.
- Open `/tui/cases/:id` directly and confirm it loads.

