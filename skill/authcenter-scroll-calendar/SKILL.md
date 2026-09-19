---
name: authcenter-scroll-calendar
description: Implement Auth Center style custom scrollbars and compact date picker/calendar controls for desktop and mobile. Use when building modal scroll areas, code blocks, dashboard lists, embedded scrollbars, date fields, birthday pickers, expiry date pickers, or avoiding native browser date input styling.
---

# Authcenter Scroll Calendar

## Overview

Use this skill to reproduce the scroll and date-input patterns from Auth Center. The goal is compact, non-native-looking controls that fit rounded modal/card surfaces on both mobile and desktop.

## Scroll Areas

Use `.ui-modal-scroll` on every scrollable modal body, command/code block, side list, or long panel.

Base CSS:

```css
.dashboard-theme .ui-modal-scroll {
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--primary) 42%, transparent) transparent;
}
.dashboard-theme .ui-modal-scroll::-webkit-scrollbar { width: 12px; }
.dashboard-theme .ui-modal-scroll::-webkit-scrollbar-track { margin: 16px 0; background: transparent; }
.dashboard-theme .ui-modal-scroll::-webkit-scrollbar-thumb {
  border: 4px solid transparent;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 42%, var(--surface-alt));
  background-clip: content-box;
}
```

Rules:
- Put the scrollbar inside the rounded panel, not on the browser viewport.
- Use `overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y` for modal bodies.
- Use `max-h-[92dvh]` or `max-h-[96dvh]` so content never hides below the viewport.
- Use `pb-[max(2rem,env(safe-area-inset-bottom))]` for mobile sheets.
- For code blocks, use `max-h-[32dvh] sm:max-h-[46dvh] overflow-auto`.
- Do not allow horizontal page scroll. Break long IDs/emails with `break-all`, `break-words`, or `min-w-0`.

## Mobile Gesture Control

When a modal is open:
- Lock body scroll using fixed body positioning and restored `scrollY`.
- Add `onTouchMove={(event) => event.stopPropagation()}` and `onWheel={(event) => event.stopPropagation()}` to the scrollable panel.
- Set overlay `overscroll-none`; set panel `overscroll-contain`.

## Date Trigger Styling

Avoid raw `input[type=date]` when visual polish matters. Use a button-like trigger that opens a compact custom calendar.

Trigger CSS:

```css
.dashboard-theme .ui-date-trigger {
  min-height: 44px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--input-bg);
  color: var(--text-primary);
  transition: border-color 180ms cubic-bezier(0.2,0.8,0.2,1), box-shadow 180ms cubic-bezier(0.2,0.8,0.2,1), background-color 180ms cubic-bezier(0.2,0.8,0.2,1);
}
.dashboard-theme .ui-date-trigger:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--focus-ring);
}
```

## Compact Calendar Behavior

Implement a small popover or modal section with three modes:
- Day mode: month title, previous/next, weekday row, 7-column grid.
- Month/year mode: clicking the title switches to compact month + year selection.
- Actions: `Clear` and `Today` sit tight under the last date row. Avoid an extra empty row.

Sizing rules:
- Day cells: 32-36px desktop, 30-34px mobile.
- Gap: 2-4px.
- Header vertical padding: 6-8px.
- Footer margin-top: 4px, not a full row gap.
- Popover width: 280-320px; on mobile, fit within `calc(100vw - 24px)`.

Date values:
- Store values as ISO `YYYY-MM-DD` for birthdays and date-only fields.
- Store expiry moments as ISO strings if time matters.
- Always separate display formatting from saved value.

## Validation Checklist

- No browser-native date picker is visible in polished flows.
- Scrollbar does not create square edges on rounded panels.
- Mobile modal scroll does not scroll the page behind it.
- Long emails, UUIDs, app IDs, and URLs do not cause horizontal scrolling.
- Calendar footer is compact and visually attached to the date grid.
