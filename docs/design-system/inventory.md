# Design System — Component Inventory

23 components in build order: atomic controls, composite controls, overlays, layout-adjacent navigation, and state surfaces.

## Atomic controls

### Button

- Visual brief: Primary action trigger with solid fill, rounded corners, and compact padding tuned for Linear-like density.
- States: default, hover, active, disabled, focus, loading (spinner variant).
- Props summary: `variant` (primary/secondary/ghost/destructive), `size` (sm/md/lg), `disabled`, `loading`, `children`, `onClick`, `type`.
- Example use: "Save" and "Delete" actions in the HIRA toolbar; form submit buttons.

### IconButton

- Visual brief: Icon-only button with square hit area, subtle background on hover, and tooltip support for accessibility.
- States: default, hover, active, disabled, focus.
- Props summary: `icon` (React node), `aria-label`, `disabled`, `size` (sm/md/lg), `variant` (default/ghost), `onClick`.
- Example use: Collapse/expand toggles in sidebar; close button in modal header.

### Input

- Visual brief: Single-line text field with left-aligned label, subtle border, and clear focus ring; stacks vertically in forms.
- States: default, hover, focus, disabled, error, readonly.
- Props summary: `label`, `placeholder`, `type`, `disabled`, `error`, `readonly`, `value`, `onChange`, `maxLength`, `required`.
- Example use: Activity name field in HIRA creation; search filter in data table.

### Textarea

- Visual brief: Multi-line text field with auto-height or fixed rows, matching Input styling for border and focus behavior.
- States: default, hover, focus, disabled, error, readonly.
- Props summary: `label`, `placeholder`, `rows`, `disabled`, `error`, `readonly`, `value`, `onChange`, `maxLength`, `required`.
- Example use: Hazard description editor; corrective action notes.

### Select

- Visual brief: Dropdown trigger showing current value with chevron; opens a scrollable list panel aligned to the trigger.
- States: default, hover, open, disabled, error.
- Props summary: `label`, `options` (array of `{value, label}`), `value`, `onChange`, `disabled`, `error`, `placeholder`.
- Example use: Severity selector in risk rating; incident type picker.

### ComboBox

- Visual brief: Text input with inline dropdown suggestions; filters options on keystroke and allows free-text entry.
- States: default, hover, open, disabled, error.
- Props summary: `label`, `options`, `value`, `onChange`, `disabled`, `error`, `placeholder`, `allowFreeText`, `filterKey`.
- Example use: Hazard category picker with search; corrective action owner assignment.

### SegmentedControl

- Visual brief: Horizontal group of mutually exclusive segments with a highlighted active segment; compact for toolbar placement.
- States: default, hover, active, disabled (per-segment).
- Props summary: `options` (array of `{value, label}`), `value`, `onChange`, `disabled`, `size` (sm/md).
- Example use: HIRA phase switcher; risk view toggle (baseline/residual).

## Status indicators

### Badge

- Visual brief: Small inline pill with text label and optional color coding; used for categorical tags.
- States: default (no state transitions; purely presentational).
- Props summary: `variant` (neutral/info/warning/success/error), `children`, `className`.
- Example use: Hazard category tags; corrective action status labels.

### StatusBadge

- Visual brief: Dot + label indicator for workflow or operational status; larger than Badge with explicit color semantics.
- States: default (presentational; color driven by `status` prop).
- Props summary: `status` (open/in-progress/completed/blocked), `label`, `size` (sm/md).
- Example use: HIRA workflow stage indicator; incident resolution status.

## Overlays and popups

### Tooltip

- Visual brief: Lightweight text popup anchored to a trigger element; appears on hover and focus with short delay.
- States: hidden, visible.
- Props summary: `content`, `children` (trigger), `placement` (top/bottom/left/right), `delay`.
- Example use: Abbreviation explanations; icon-only button context.

### Toast

- Visual brief: Temporary notification banner in the viewport corner with auto-dismiss timer and action button support.
- States: entering, visible, exiting, dismissed.
- Props summary: `message`, `variant` (info/success/warning/error), `duration`, `actionLabel`, `onAction`, `id`.
- Example use: "HIRA saved successfully" feedback; validation error alerts.

### Modal

- Visual brief: Centered dialog with backdrop overlay; contains header, body, and footer action bar; traps focus.
- States: closed, opening, open, closing.
- Props summary: `title`, `isOpen`, `onClose`, `children`, `size` (sm/md/lg/full), `closeOnBackdrop`.
- Example use: Confirm-delete dialog; new hazard creation form.

### Drawer

- Visual brief: Side-panel sheet sliding from the right edge; narrower than modal, used for contextual detail without full navigation.
- States: closed, opening, open, closing.
- Props summary: `title`, `isOpen`, `onClose`, `children`, `size` (sm/md/lg), `closeOnBackdrop`.
- Example use: Hazard detail panel; step editor in HIRA flow.

## Composite display

### Card

- Visual brief: Bounded container with subtle border and padding; groups related content with optional header and footer sections.
- States: default, hover (when interactive), selected.
- Props summary: `title`, `children`, `footer`, `interactive`, `onClick`, `selected`, `className`.
- Example use: HIRA summary card in dashboard; corrective action detail panel.

### Tabs

- Visual brief: Horizontal tab bar with underline indicator on the active tab; content panels swap below the bar.
- States: default, active (per-tab), disabled (per-tab).
- Props summary: `tabs` (array of `{value, label, content, disabled?}`), `activeValue`, `onChange`, `placement` (top/left).
- Example use: HIRA section navigation (process steps, hazards, controls); II phase tabs.

## Navigation

### Breadcrumbs

- Visual brief: Horizontal trail of linked page titles separated by chevron icons; truncates with ellipsis on narrow screens.
- States: default, hover (per-link).
- Props summary: `items` (array of `{label, href, isCurrent?}`), `maxItems`, `separator`.
- Example use: HIRA detail page path (Dashboard → HIRAs → "Pallet handling").

### Table

- Visual brief: Simple data table with striped rows, sortable headers, and compact cell padding for high-density reading.
- States: default, hover (per-row), selected (per-row), loading (skeleton variant).
- Props summary: `columns`, `rows`, `sortable`, `rowKey`, `onRowClick`, `striped`, `size` (sm/md).
- Example use: Process step list; corrective action register.

### DataTable

- Visual brief: Presentational table wrapper for already-prepared rows with server-driven pagination controls and caller-owned copy.
- States: default, hover (per-row), selected, loading, empty.
- Props summary: `columns`, `data`, `rowKey`, `labels`, `pagination`, `onRowSelect`, `loading`.
- Behavior boundary: DataTable does not own workbench sorting, filtering, column visibility, row actions, or client-side pagination. Workflow workbenches compose TanStack Table per ADR-0008 and pass the rendered row slice plus localized labels into this primitive.
- Example use: HIRA hazard register row surface after the workbench model has prepared visible rows; II incident list with server-provided pagination.

### SidebarNav

- Visual brief: Fixed left rail with icon + label nav items, collapsible sections, and active-state highlight.
- States: default, hover, active, collapsed (per-section and global).
- Props summary: `items` (hierarchical array of `{label, icon, href, active?, children?}`), `collapsed`, `onToggle`.
- Example use: Application shell navigation (HIRAs, JHAs, Incidents, Settings).

### TopBar

- Visual brief: Horizontal header bar with application title, global search, notifications, and user menu; sticky at viewport top.
- States: default, hover (per-action).
- Props summary: `title`, `searchPlaceholder`, `notifications`, `userMenu`, `actions`, `onSearch`.
- Example use: Global application header with search and user profile dropdown.

## State surfaces

### Empty state

- Visual brief: Centered placeholder with icon, heading, and descriptive text; includes optional action button.
- States: default (presentational; no interaction states).
- Props summary: `icon`, `title`, `description`, `actionLabel`, `onAction`, `size` (sm/md/lg).
- Example use: "No hazards identified" in a new HIRA; empty incident list.

### Loading state

- Visual brief: Skeleton or spinner overlay that matches the content structure; preserves layout dimensions to avoid reflow.
- States: default (animating), complete (fades out).
- Props summary: `variant` (skeleton/spinner), `rows` (for skeleton count), `children` (content to replace), `fullscreen`.
- Example use: HIRA list loading skeleton; data table row placeholders.

### Error state

- Visual brief: Alert surface with error icon, heading, message, and retry button; uses error color semantics.
- States: default, retrying (transitions to loading state on retry).
- Props summary: `title`, `message`, `onRetry`, `retryLabel`, `code`, `details`.
- Example use: Data fetch failure in HIRA detail; form submission error.
