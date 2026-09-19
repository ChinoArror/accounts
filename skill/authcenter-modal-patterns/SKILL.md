---
name: authcenter-modal-patterns
description: Build Auth Center style modal, sheet, drawer, confirmation, and detail dialogs for desktop and mobile. Use when implementing floating windows with slide-in animation, fixed close buttons, red destructive actions, rounded panels, backdrop blur, scroll locking, mobile bottom sheets, or desktop centered dialogs.
---

# Authcenter Modal Patterns

## Overview

Use this skill to reproduce the Auth Center dialog behavior from `UserHome.tsx`, `TestAccess.tsx`, and `RegisterCodeManager.tsx`.

## Core Rules

- Render modal roots above all app chrome: use `fixed inset-0` and a very high z-index such as `z-[2147483647]` when a dashboard sidebar/header must be covered.
- Use the current theme context: add `dashboard-theme` and copy `data-theme` from the closest existing `.dashboard-theme`.
- Lock background scrolling while open. Store `window.scrollY`, set `body.position = fixed`, `body.top = -scrollY`, `body.width = 100%`, and restore all previous body/html styles on close.
- Stop wheel/touch propagation inside modal content so mobile gestures scroll only the modal.
- Keep close controls visible. For long dialogs, place a circular close button `absolute right-4 top-4 z-30`.
- Use `AnimatePresence` + `motion.div` when inside React. For imperative portals, use CSS transitions and `requestAnimationFrame`.

## Responsive Layout

Mobile:
- Overlay: `fixed inset-0 flex items-end p-2 bg-black/55 backdrop-blur-md`.
- Panel enters from bottom: initial `opacity:0, y:24, scale:.98`; animate to `opacity:1, y:0, scale:1`.
- Panel is bottom-attached: `mt-auto w-full max-h-[92dvh] overflow-y-auto rounded-[1.75rem]`.
- Full-screen editing dialogs may use `h-[100dvh] rounded-none`; keep the close button fixed.

Desktop:
- Overlay centers content: `sm:items-center sm:justify-center sm:p-4`.
- Panel width is task-specific: `max-w-lg` for confirm, `max-w-xl` for risk, `max-w-4xl` or `max-w-5xl` for forms/commands.
- Panel max height: `sm:max-h-[94dvh]`; inner content uses `.ui-modal-scroll`.

## Standard Shell

```tsx
function ModalShell({ children, onClose, maxWidth = 'max-w-3xl', mobileMode = 'sheet' }) {
  const fullMobile = mobileMode === 'full';
  return createPortal(
    <div data-theme={theme} className={`dashboard-theme fixed inset-0 z-[2147483647] flex justify-center overscroll-none bg-black/55 backdrop-blur-md sm:items-center sm:p-4 ${fullMobile ? 'items-stretch p-0' : 'items-end p-2 sm:p-4'}`}>
      <motion.div initial={{ opacity: 0, scale: 0.98, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 10 }} className={`relative w-full overflow-hidden border border-[var(--border)] bg-[var(--surface)] shadow-2xl sm:h-auto sm:max-h-[94dvh] sm:w-full ${maxWidth} sm:rounded-[1.75rem] ${fullMobile ? 'h-[100dvh] rounded-none' : 'max-h-[96dvh] rounded-[1.75rem]'}`}>
        <button type="button" onClick={onClose} className="absolute right-4 top-4 z-30 grid h-10 w-10 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] shadow-lg hover:text-[var(--text-primary)]" aria-label="Close">...</button>
        <div className={`ui-modal-scroll touch-pan-y overscroll-contain overflow-y-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-16 sm:max-h-[94dvh] sm:px-6 ${fullMobile ? 'h-full' : 'max-h-[96dvh]'}`}>
          {children}
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
```

## Confirmation Dialogs

- Destructive confirm buttons must be red: `bg-red-600 hover:bg-red-500 text-white shadow-red-900/20`.
- Risk dialogs use a red icon block, concise risk list, cancel button, and red confirm button.
- Delete dialogs should be bottom sheets on mobile and compact centered panels on desktop.
- Bottom edge must keep rounded corners unless the dialog intentionally occupies full mobile viewport.

## Imperative Portal Variant

Use only when React state click handlers are unreliable or the modal is created outside a React subtree. Build DOM nodes with `textContent` for user data, not `innerHTML`. Use `innerHTML` only for trusted static icons. Add:

- Overlay classes: `dashboard-theme fixed inset-0 z-[2147483647] flex items-end justify-center overscroll-none bg-black/45 p-2 opacity-0 backdrop-blur-sm transition-opacity duration-200 ease-out md:items-center md:p-4`
- Panel classes: `relative max-h-[94dvh] w-full max-w-2xl translate-y-3 scale-[0.98] overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] opacity-0 shadow-[var(--shadow-overlay)] transition duration-200 ease-out`
- On open, `requestAnimationFrame` swaps to `opacity-100 translate-y-0 scale-100`.
- On close, reverse classes, wait `180ms`, remove node, then restore scroll.
