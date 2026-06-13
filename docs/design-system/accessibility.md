# Design System — Accessibility Requirements

Shared expectations and per-component a11y requirements for the 23 components in the inventory. All requirements target **WCAG 2.1 AA** minimum.

## Global expectations

- Focus indicators use `:focus-visible` only on keyboard navigation; mouse and touch interactions must not show a focus ring.
- All components respect `prefers-reduced-motion: reduce` by disabling or simplifying animations and transitions.
- No implicit colour-only signals; every status, error, or state change must have a non-colour indicator (icon, text label, pattern, or ARIA live region).
- All interactive elements are reachable and operable via keyboard alone (Tab, Shift+Tab, Enter, Space, Escape, Arrow keys as appropriate).
- Colour contrast meets WCAG 2.1 AA: 4.5:1 for normal text, 3:1 for large text (18px+ or 14px+ bold), 3:1 for UI components and graphical objects.
- Landmarks and heading hierarchy are semantic; no presentational `<div>` masquerading as structural elements.

## Atomic controls

### Button

- Keyboard: Enter and Space activate; Tab moves focus to the button.
- Focus: visible focus ring offset by 2px; focus order matches DOM order.
- ARIA: native `<button>` element (implicit `role="button"`); `aria-disabled="true"` when disabled; `aria-label` required for icon-only variants.
- Contrast: text and border meet 3:1 against background; disabled state maintains 3:1 (greyed, not invisible).
- Motion: hover and active transitions respect `prefers-reduced-motion`.

### IconButton

- Keyboard: Enter and Space activate; Tab moves focus.
- Focus: visible focus ring around the icon square; minimum 24×24 hit area.
- ARIA: native `<button>`; `aria-label` always required (no visible text label); `aria-pressed` for toggle variants.
- Contrast: icon fill meets 3:1 against surface; focus ring meets 3:1.
- Motion: hover background transition respects `prefers-reduced-motion`.

### Input

- Keyboard: Tab enters the field; Escape clears selection; standard editing keys work.
- Focus: visible focus ring on the input border; label associated via `<label for>` or `aria-labelledby`.
- ARIA: `aria-required` when required; `aria-invalid="true"` and `aria-describedby` pointing to the error message when in error state; `aria-readonly` when readonly.
- Contrast: placeholder text 3:1 against field background; error state uses icon + text (not colour alone).
- Motion: none required; static component.

### Textarea

- Keyboard: Tab enters; Escape clears selection; Ctrl+A/C/V/X standard; Enter inserts newline.
- Focus: visible focus ring; label associated via `<label for>`; `aria-labelledby` if compound label.
- ARIA: `aria-required`, `aria-invalid`, `aria-describedby` (error); `aria-multiline="true"`.
- Contrast: placeholder and border meet 3:1; error indicator (icon + text) not colour alone.
- Motion: auto-resize animation respects `prefers-reduced-motion`.

### Select

- Keyboard: Enter or Space opens the dropdown; Arrow Up/Down navigates options; Enter selects; Escape closes; Tab moves to next control.
- Focus: focus ring on the trigger; focus trapped inside the dropdown list while open; focus returns to trigger on close.
- ARIA: `role="combobox"` or `role="listbox"` pattern per WAI-ARIA Authoring Practices; `aria-expanded`; `aria-activedescendant` for highlighted option.
- Contrast: trigger text and chevron meet 3:1; dropdown options meet 4.5:1 for text.
- Motion: dropdown open/close animation respects `prefers-reduced-motion`.

### ComboBox

- Keyboard: Type to filter; Arrow Up/Down navigates filtered list; Enter selects; Escape closes; Tab moves on.
- Focus: focus stays on the input; `aria-activedescendant` tracks highlighted option; focus trapped in list while open.
- ARIA: `role="combobox"` with `aria-expanded`, `aria-autocomplete="list"`, `aria-controls` pointing to the listbox.
- Contrast: input and dropdown text meet 4.5:1; active option highlight meets 3:1.
- Motion: dropdown appearance respects `prefers-reduced-motion`.

### SegmentedControl

- Keyboard: Tab focuses the group; Arrow Left/Right moves selection; Enter or Space confirms.
- Focus: visible focus ring on the active segment; `roving tabindex` pattern (only one segment has `tabindex="0"`).
- ARIA: `role="radiogroup"` with child `role="radio"` elements; `aria-checked="true"` on active segment; `aria-labelledby` for group label.
- Contrast: active segment meets 3:1 against inactive; text on segments meets 4.5:1.
- Motion: active indicator transition respects `prefers-reduced-motion`.

## Status indicators

### Badge

- Keyboard: not interactive; no focus target; skipped in Tab order.
- Focus: N/A (presentational).
- ARIA: `aria-hidden="true"` on the decorative element; the meaningful text is exposed to AT via its containing label or via `aria-label` on the parent.
- Contrast: badge text meets 4.5:1 against badge background; badge background meets 3:1 against page background.
- Motion: none required.

### StatusBadge

- Keyboard: not interactive; no focus target; skipped in Tab order.
- Focus: N/A (presentational).
- ARIA: the status text is exposed as live text; when conveying state changes, use `aria-live="polite"` on a containing element.
- Contrast: status dot and text meet 3:1; no colour-only status — the text label carries the meaning.
- Motion: pulse animation (if any) respects `prefers-reduced-motion` or is disabled entirely.

## Overlays and popups

### Tooltip

- Keyboard: appears on focus of the trigger (not just hover); dismissed by moving focus away or pressing Escape.
- Focus: focus remains on the trigger; tooltip is `position: absolute` and not focusable itself.
- ARIA: `aria-describedby` on the trigger pointing to the tooltip's `id`; tooltip uses `role="tooltip"`.
- Contrast: tooltip text meets 4.5:1 against tooltip background.
- Motion: fade-in/out respects `prefers-reduced-motion`.

### Toast

- Keyboard: appears programmatically; if it has a dismiss button, that button is focusable and activatable by Enter/Space.
- Focus: auto-focus the dismiss action if the toast interrupts the user; otherwise do not steal focus.
- ARIA: `role="alert"` for error/warning toasts (announced immediately); `role="status"` for info/success toasts (announced politely).
- Contrast: text meets 4.5:1; background meets 3:1 against viewport.
- Motion: slide-in/out animation respects `prefers-reduced-motion`.

### Modal

- Keyboard: Escape closes; Tab is trapped within the modal; focus moves to the first focusable element on open; focus returns to trigger on close.
- Focus: focus trap enforced; initial focus on the modal's primary action or title; no focus escapes to the backdrop.
- ARIA: `role="dialog"`; `aria-modal="true"`; `aria-labelledby` pointing to the title; `aria-describedby` for body text.
- Contrast: modal content meets 4.5:1 for text; backdrop is 3:1 overlay.
- Motion: open/close animation respects `prefers-reduced-motion`.

### Drawer

- Keyboard: Escape closes; Tab trapped inside; focus on first element on open; focus returns to trigger on close.
- Focus: same as Modal; if the drawer is non-modal (`aria-modal="false"`), focus is not trapped but Escape still closes.
- ARIA: `role="dialog"`; `aria-modal="true"` or `false` depending on variant; `aria-labelledby` for the title.
- Contrast: content text meets 4.5:1; close icon meets 3:1.
- Motion: slide transition respects `prefers-reduced-motion`.

## Composite display

### Card

- Keyboard: if interactive, the entire card is focusable (single Tab stop); Enter/Space activates the card's action.
- Focus: visible focus ring around the card border; `tabindex="0"` on the root element when interactive.
- ARIA: when interactive, `role="link"` or `role="button"` depending on the action; `aria-label` describing the card's purpose.
- Contrast: card text meets 4.5:1; border meets 3:1 against page background.
- Motion: hover elevation transition respects `prefers-reduced-motion`.

### Tabs

- Keyboard: Tab focuses the tab list; Arrow Left/Right moves between tabs; Enter/Space activates; Home/End jump to first/last tab.
- Focus: roving tabindex on tab buttons; activated tab receives focus on programmatic change.
- ARIA: `role="tablist"` on the container; `role="tab"` on buttons; `role="tabpanel"` on panels; `aria-selected`, `aria-controls`, `aria-labelledby` wired correctly per WAI-ARIA Authoring Practices.
- Contrast: active tab indicator meets 3:1; tab text meets 4.5:1.
- Motion: tab indicator slide respects `prefers-reduced-motion`.

## Navigation

### Breadcrumbs

- Keyboard: Tab moves between breadcrumb links; Enter navigates; the current page link is not focusable.
- Focus: visible focus ring on links; `tabindex="-1"` on the current-page item (presentational only).
- ARIA: `aria-label="Breadcrumb"` on the list; `aria-current="page"` on the final (non-link) item; semantic `<nav>` wrapper.
- Contrast: link text meets 4.5:1; separator meets 3:1.
- Motion: none required.

### Table

- Keyboard: Tab moves between interactive cells (if any); Enter activates row click; Arrow keys navigate within the table body.
- Focus: visible focus ring on focused cell or row; caption associated via `<caption>` or `aria-label`.
- ARIA: semantic `<table>`, `<thead>`, `<tbody>`, `<th scope="col/row">`; `aria-sort` on sortable headers.
- Contrast: header text meets 4.5:1; row stripe contrast meets 3:1; selected row meets 3:1.
- Motion: row hover highlight respects `prefers-reduced-motion`.

### DataTable

- Keyboard: Tab moves between controls and interactive cells; Arrow keys navigate rows; Space toggles row selection; Enter opens row detail; Escape closes detail.
- Focus: focus ring on active row or cell; pagination and filter controls are reachable via Tab in logical order.
- ARIA: `role="grid"` or semantic `<table>`; `aria-rowcount` for virtual scroll; `aria-selected` on rows; `aria-label` on column filter inputs.
- Contrast: cell text meets 4.5:1; sort indicator meets 3:1; empty state text meets 4.5:1.
- Motion: loading skeleton animation respects `prefers-reduced-motion`.

### SidebarNav

- Keyboard: Tab moves between nav items; Arrow Up/Down navigates within the sidebar; Enter activates; Escape collapses a section.
- Focus: visible focus ring on the active item; `aria-current="page"` on the current navigation target.
- ARIA: `<nav aria-label="Sidebar">`; section headers use `<button aria-expanded>`; list items use `role="listitem"`.
- Contrast: active item highlight meets 3:1; icon and text meet 4.5:1.
- Motion: collapse/expand animation respects `prefers-reduced-motion`.

### TopBar

- Keyboard: Tab moves between actions (search, notifications, user menu); Enter activates; Escape closes dropdowns.
- Focus: visible focus ring on active action; search input receives focus on `/` shortcut if implemented.
- ARIA: `<header>` landmark; notification button uses `aria-label` with count; user menu uses `aria-haspopup="true"` and `aria-expanded`.
- Contrast: action icons meet 3:1; text meets 4.5:1.
- Motion: dropdown open/close respects `prefers-reduced-motion`.

## State surfaces

### Empty state

- Keyboard: if it has an action button, Tab reaches the button; Enter/Space activates.
- Focus: focus ring on the action button; the icon and text are non-interactive (skipped).
- ARIA: icon is `aria-hidden="true"`; title uses semantic heading (`<h2>` or `<h3>`); action button is a native `<button>`.
- Contrast: title and description meet 4.5:1; icon meets 3:1; action button meets 3:1.
- Motion: none required; static component.

### Loading state

- Keyboard: not interactive; no focus target; skipped in Tab order.
- Focus: N/A; if replacing content, preserve the original focus position for restoration.
- ARIA: `aria-busy="true"` on the container while loading; `aria-live="polite"` so AT announces the loading state.
- Contrast: skeleton bars meet 3:1 against background; spinner meets 3:1.
- Motion: skeleton shimmer and spinner rotation respect `prefers-reduced-motion`.

### Error state

- Keyboard: if it has a retry button, Tab reaches it; Enter/Space triggers retry.
- Focus: focus ring on retry button; auto-focus the retry button if the error interrupts a user action.
- ARIA: `role="alert"` for immediate errors (announced to AT); error icon `aria-hidden="true"`; title and message are semantic text.
- Contrast: error text meets 4.5:1; error background/border meets 3:1; retry button meets 3:1.
- Motion: none required; static component.
