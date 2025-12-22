# TUI Design System (WebTUI-native)

This document defines the TUI visual system for HIRA. It governs component choices, spacing, and state affordances.

## Component Mapping
- Typography: `@webtui/css/components/typography.css`
- Buttons: `@webtui/css/components/button.css`
- Inputs/Textareas: `@webtui/css/components/input.css`, `textarea.css`
- Tables: `@webtui/css/components/table.css`
- Boxes: `@webtui/css/utils/box.css`
- Separators/Badges: `separator.css`, `badge.css`

## Layout Rules
- Use `ch` for width and `lh` for height/vertical rhythm.
- Avoid pixel-locked spacing except for icons.
- Prefer ASCII boxes for major sections (phase panels, summaries).
- Use list layout for narrative content and table layout for row/column editing.

## Color + Status Tokens
These map to WebTUI base variables:
- Ready: foreground default
- Saving: foreground1 + "Saving..." status line
- Error: use foreground0 + explicit "Error" text
- Active/Focused: increase contrast and underline

## Focus + Active Styles
- Active row/cell uses underline or border (text-first cue).
- Edit mode shows cursor in input field; non-edit mode uses readonly text.
- Keyboard hints live in the status line or header help area.

## ASCII Box Usage
- `box-="square"` for phase panels and editor frames.
- `box-="round"` for small summary cards.
- Avoid nested boxes more than two levels deep.

