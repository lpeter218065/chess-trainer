# Board "more" menu: escape the toolbar's scroll clip (2026-10-04)

## Problem

`src/index.css:992` sets `overflow-x: auto` on `.board-toolbar` in `stacked` and `split` layouts (phones, iPad portrait / landscape split). CSS forces `overflow-y` to `auto` as well, so the toolbar becomes a clipping container in both axes. `BoardMoreMenu` (`src/components/BoardToolbar.tsx`) renders its dropdown as `absolute bottom-full` inside a `relative` wrapper that lives inside the toolbar, so the menu is clipped to the toolbar row. The user sees "flip does nothing" on phone/tablet, while the `wide` layout works. Flip handlers themselves are correct.

## Fix

Render the dropdown through a portal into `document.body`, positioned with `position: fixed` relative to the trigger button.

- `BoardMoreMenu`:
  - Keep the trigger button where it is. Add `buttonRef` and `menuRef`.
  - When `open`, measure `buttonRef.current.getBoundingClientRect()` and render the menu via `createPortal(..., document.body)` with inline style `{ position: 'fixed', right: window.innerWidth - rect.right, bottom: window.innerHeight - rect.top + 6 }` (opens upward, right-aligned to the button, same 6px gap as today's `mb-1.5`). Keep the existing classes except `absolute right-0 bottom-full mb-1.5`; keep `z-20` or raise to `z-40` so it clears the detail panel (`.ios-status-bar-blur` uses 35, sheets 40; use `z-[45]` only if needed and say so).
  - Re-measure on `resize` and `scroll` (capture phase on window) while open; close the menu on `orientationchange` or if the button leaves the viewport is not required.
  - Outside-click: the `mousedown` handler closes only if the target is outside **both** `buttonRef` and `menuRef`.
  - If the viewport above the button is shorter than the menu (rect.top < ~200px), open downward instead (`top: rect.bottom + 6`). Measure the menu height via `menuRef` after first paint using `useLayoutEffect`; a simple two-pass approach is fine.
  - Keep ARIA (`role="menu"`, `aria-haspopup`, `aria-expanded`), `Escape` to close, item `onClick` → `item.onClick(); setOpen(false)`.
- No change to `BoardToolbar`, pages, or CSS, except: if the portal makes `.board-toolbar`'s `relative` class unnecessary, leave it anyway.

## Tests

- `tests/boardStatus.test.tsx` (existing menu test): add cases
  - when open, the `role="menu"` element is a descendant of `document.body` and **not** of the `.board-toolbar` element;
  - clicking a menu item calls its `onClick` and closes the menu;
  - a `mousedown` inside the portal menu does not close it; a `mousedown` elsewhere does;
  - `Escape` closes it.
- Mock `getBoundingClientRect` on the button in tests (jsdom returns zeros) only if needed for the up/down decision.

## Acceptance

`npm run verify` green; `npx vitest run 2>&1 | grep -i unhandled` empty. Commit: `fix(board): render the more menu in a portal so the toolbar scroll clip cannot hide it`.
