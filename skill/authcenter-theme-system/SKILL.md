---
name: authcenter-theme-system
description: Recreate Auth Center visual language across landing, login, register, dashboard, and user detail pages. Use when implementing color tokens, light/dark modes, non-blue theme variants, button sizes, press effects, cards, loading states, query/loading displays, route-level motion, and cohesive app styling.
---

# Authcenter Theme System

## Overview

Use this skill to build pages that feel like Auth Center while allowing a different primary theme color. The system is token-driven: change CSS variables, not one-off component classes.

## Theme Tokens

Base light tokens:

```css
:root {
  --bg: #f5f5f5;
  --surface: #ffffff;
  --surface-alt: #f8f8f8;
  --text-primary: #111111;
  --text-secondary: #666666;
  --text-tertiary: #8a8a8a;
  --border: #e6e6e6;
  --divider: #efefef;
  --primary: #1677ff;
  --primary-hover: #0f67e6;
  --primary-active: #0b57c4;
  --success: #18a058;
  --warning: #f5a623;
  --danger: #e5484d;
  --input-bg: #ffffff;
  --overlay: rgba(17,17,17,.35);
  --shadow-card: 0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.04);
  --shadow-overlay: 0 12px 40px rgba(0,0,0,.14);
  --radius-sm: 10px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --focus-ring: color-mix(in srgb, var(--primary) 18%, transparent);
}
```

Dark tokens:

```css
[data-theme='dark'] {
  --bg: #0b0b0c;
  --surface: #141416;
  --surface-alt: #1a1b1e;
  --text-primary: #f5f5f5;
  --text-secondary: #b5b5b8;
  --text-tertiary: #8c8d91;
  --border: #2a2b2f;
  --divider: #232428;
  --primary: #2f81ff;
  --primary-hover: #3d8bff;
  --primary-active: #1f6de3;
  --overlay: rgba(0,0,0,.55);
  --shadow-card: 0 1px 2px rgba(0,0,0,.25), 0 8px 28px rgba(0,0,0,.35);
  --shadow-overlay: 0 12px 44px rgba(0,0,0,.55);
}
```

## Non-Blue Theme Variants

When asked to use a non-blue theme, keep the neutral system and only replace `--primary`, `--primary-hover`, `--primary-active`, and optionally primary gradient accents.

Recommended palettes:
- Emerald: `#10a36a`, hover `#0d8f5d`, active `#08774d`.
- Violet: `#7c3aed`, hover `#6d28d9`, active `#5b21b6`.
- Rose: `#e11d48`, hover `#be123c`, active `#9f1239`.
- Amber: `#d97706`, hover `#b45309`, active `#92400e`.
- Slate: `#475569`, hover `#334155`, active `#1f2937`.

Do not make every surface a tint of the theme color. Keep surfaces neutral and use primary color for actions, focus rings, active nav, icons, and key highlights.

## Core Components

Buttons:
- Primary: `min-height:44px`, `border-radius:var(--radius-md)`, `padding:10px 16px`, `font-size:14px`, `font-weight:600`, background `var(--primary)`, hover `var(--primary-hover)`, active `var(--primary-active)`, shadow mixed from primary.
- Secondary: `min-height:40px`, border `var(--border)`, background `var(--surface)`, hover `var(--surface-alt)`.
- Icon button: 36x36, rounded `var(--radius-sm)`, border, surface-alt, hover tinted with primary.
- Press effects: use `whileTap={{ scale: 0.98 }}` for larger buttons; use `whileHover={{ y: -1 }}` when vertical lift is desired.

Inputs:
- Min height 44px, radius 10px, border `var(--border)`, background `var(--input-bg)`, focus ring `0 0 0 3px var(--focus-ring)`.
- Keep labels short, uppercase, letter spacing around `0.14em` to `0.18em` only for small metadata labels.

Cards:
- Use `ui-card` for real cards: surface, border, radius 16px, card shadow.
- Use `ui-card-subtle` for nested data cells: surface-alt, border, radius 16px.
- Do not nest large cards inside large cards unless the inner element is a repeated item or form group.

## Page Motion

Route/page card entry:
```tsx
<motion.div initial={{ opacity: 0, scale: 0.98, y: 18 }} animate={{ opacity: 1, scale: 1, y: 0 }} />
```

Dashboard section transition:
```tsx
<motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} />
```

List item entry:
```tsx
<motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} />
```

## Page Structure

Landing:
- Root path `/` is a real landing page, but if already logged in redirect admin to `/dash` and user to `/user/:uuid`.
- Use the same `dashboard-theme` tokens; avoid disconnected marketing styling.

Login/register:
- Use `ui-auth-shell` and `ui-auth-card`.
- Primary form width about 420px; wide auth cards up to 980px.
- Keep descriptions minimal. Use tabs/segmented controls for login modes.

Dashboard:
- Shell is `fixed inset-0 overflow-hidden flex flex-col md:flex-row`.
- Sidebar uses `ui-shell-sidebar`; nav pills use `ui-nav-pill` with `data-active=true` for active state.
- Main content scrolls independently: `flex-1 overflow-y-auto overflow-x-hidden z-10 relative bg-[var(--bg)]`.

User detail:
- Use the same token system as login/register, not legacy purple/dark styling.
- User action dialogs should follow Auth Center modal patterns.
- Keep buttons/input sizing consistent with auth pages.

## Loading States

Use real loading states, not fake data.
- Initial card/list loading: text such as `Loading...` inside `ui-card`, or `animate-pulse` only for real pending fetch.
- Refresh buttons: show spinner icon with `animate-spin` and lower opacity while disabled.
- Tables/lists: do not shift layout aggressively; place loading text in the existing content container.
- Empty states must be factual and concise.

## Validation Checklist

- Page supports light and dark via `data-theme`.
- Primary color can be swapped by CSS variables without rewriting components.
- Buttons are at least 40-44px high and have press/hover states.
- Long text wraps and does not create horizontal scroll.
- Loading state appears only during actual fetch/query.
- Modal, date, avatar, and scrollbar patterns remain visually consistent with the theme.
