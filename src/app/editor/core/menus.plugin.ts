// core/menus.plugin.ts
import { EditorState, Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { isInTable } from 'prosemirror-tables';
import { EditorHooks, FloatingMenuState, TableMenuState } from './editor-hooks';

interface SlashPluginState {
  open: boolean;
  query: string;
  from: number;
  to: number;
  dismissedAt: number;
}
export const slashKey = new PluginKey<SlashPluginState>('ink-slash');
const CLOSED = { open: false, query: '', from: 0, to: 0 };

function detectSlash(state: EditorState) {
  const { selection } = state;
  const { $from } = selection;
  if (
    !selection.empty ||
    !$from.parent.isTextblock ||
    $from.parent.type.spec.code
  )
    return CLOSED;
  const before = $from.parent.textBetween(
    0,
    $from.parentOffset,
    undefined,
    '\ufffc',
  );
  const m = /^\/(\w*)$/.exec(before);
  return m
    ? { open: true, query: m[1], from: $from.start(), to: $from.pos }
    : CLOSED;
}

export function menusPlugin(hooks: EditorHooks): Plugin<SlashPluginState> {
  return new Plugin<SlashPluginState>({
    key: slashKey,

    state: {
      init: () => ({ ...CLOSED, dismissedAt: -1 }),
      apply(tr, prev, _old, state) {
        const found = detectSlash(state);
        if (!found.open) return { ...CLOSED, dismissedAt: -1 };
        const dismissedAt = tr.getMeta(slashKey)?.dismiss
          ? found.from
          : prev.dismissedAt;
        return found.from === dismissedAt
          ? { ...CLOSED, dismissedAt }
          : { ...found, dismissedAt };
      },
    },

    props: {
      // Returning true makes ProseMirror call preventDefault for us.
      handleKeyDown: (_view, event) =>
        !event.isComposing && hooks.onSlashKeyDown(event),
    },

    view(view) {
      let raf = 0;
      let lastFloatingCoords: FloatingMenuState | null = null;
      let lastTableCoords: TableMenuState | null = null;

      const render = () => {
        raf = 0;
        const { state } = view;
        const slash = slashKey.getState(state)!;
        const vp = view.dom.closest('.ink-editor-viewport') as HTMLElement | null;
        const vpRect = vp?.getBoundingClientRect();
        const screenW = typeof window !== 'undefined' ? window.innerWidth : 800;

        if (slash.open && !view.composing) {
          const c = view.coordsAtPos(slash.to);
          const isVisible = !vpRect || (c.bottom >= vpRect.top && c.top <= vpRect.bottom);
          if (isVisible) {
            // Keep slash menu clamped on small mobile screens
            const slashWidth = Math.min(300, screenW - 24);
            const clampedLeft = Math.max(12, Math.min(c.left, screenW - slashWidth - 12));
            hooks.onSlashMenu({
              query: slash.query,
              from: slash.from,
              to: slash.to,
              left: clampedLeft,
              top: c.bottom,
            });
          } else {
            hooks.onSlashMenu(null);
          }
        } else {
          hooks.onSlashMenu(null);
        }

        const { selection } = state;
        const doc = view.dom.ownerDocument;
        const activeEl = doc?.activeElement;
        const hasOverlay = doc
          ? doc.querySelector('.cdk-overlay-pane, .cdk-overlay-backdrop') !== null
          : false;
        const isInteractingWithMenu =
          Boolean(activeEl && activeEl.closest('.cdk-overlay-container, .ink-floating')) ||
          hasOverlay;

        const showFloating =
          !slash.open &&
          selection instanceof TextSelection &&
          !selection.empty &&
          !selection.$from.parent.type.spec.code &&
          (view.hasFocus() || isInteractingWithMenu);

        if (showFloating) {
          const domSel = doc?.getSelection();
          const rect =
            domSel && domSel.rangeCount
              ? domSel.getRangeAt(0).getBoundingClientRect()
              : null;
          if (rect && (rect.width || rect.height)) {
            // Check if selection is within the visible viewport bounds
            const isOutOfView = vpRect && (rect.bottom < vpRect.top + 10 || rect.top > vpRect.bottom - 10);
            if (isOutOfView) {
              lastFloatingCoords = null;
              hooks.onFloatingMenu(null);
            } else {
              // Decide whether to place above or below selection
              // Floating menu is ~38px tall; need ~48px clearance above selection
              const placeBelow = vpRect ? (rect.top - 48 < vpRect.top) : false;
              const top = placeBelow ? rect.bottom + 8 : rect.top - 8;
              const placement = placeBelow ? 'bottom' : 'top';

              // Clamp left so it doesn't overflow horizontally off viewport
              const rawLeft = rect.left + rect.width / 2;
              let left = rawLeft;
              if (vpRect) {
                const margin = Math.min(140, Math.max(60, (vpRect.width - 24) / 2));
                left = Math.max(vpRect.left + margin, Math.min(rawLeft, vpRect.right - margin));
              } else {
                left = Math.max(70, Math.min(rawLeft, screenW - 70));
              }

              lastFloatingCoords = { left, top, placement };
              hooks.onFloatingMenu(lastFloatingCoords);
            }
          } else if (lastFloatingCoords && isInteractingWithMenu) {
            // Keep existing menu if interacting with overlay, but hide if viewport scrolled away
            if (vpRect && (lastFloatingCoords.top < vpRect.top || lastFloatingCoords.top > vpRect.bottom)) {
              lastFloatingCoords = null;
              hooks.onFloatingMenu(null);
            } else {
              hooks.onFloatingMenu(lastFloatingCoords);
            }
          } else {
            lastFloatingCoords = null;
            hooks.onFloatingMenu(null);
          }
        } else {
          lastFloatingCoords = null;
          hooks.onFloatingMenu(null);
        }

        // ── Floating Table Toolbar ────────────────────────────────────
        const inTable = isInTable(state);
        const isInteractingWithTable =
          Boolean(activeEl && activeEl.closest('.ink-table-toolbar')) ||
          isInteractingWithMenu;

        if (inTable && (view.hasFocus() || isInteractingWithTable)) {
          const { $from } = selection;
          let tableEl: HTMLElement | null = null;
          try {
            const domAt = view.domAtPos($from.pos);
            const domNode = domAt.node as HTMLElement;
            tableEl = (domNode.nodeType === 1 ? domNode : domNode.parentElement)?.closest('table') as HTMLElement | null;
          } catch {
            tableEl = null;
          }

          if (tableEl) {
            const rect = tableEl.getBoundingClientRect();
            const isVisible = !vpRect || (rect.bottom >= vpRect.top && rect.top <= vpRect.bottom);
            if (isVisible) {
              const rawLeft = rect.left + rect.width / 2;
              const left = Math.max(120, Math.min(rawLeft, screenW - 120));
              lastTableCoords = {
                left,
                top: rect.bottom + 8,
              };
              hooks.onTableMenu?.(lastTableCoords);
            } else {
              lastTableCoords = null;
              hooks.onTableMenu?.(null);
            }
          } else if (lastTableCoords && isInteractingWithTable) {
            hooks.onTableMenu?.(lastTableCoords);
          } else {
            lastTableCoords = null;
            hooks.onTableMenu?.(null);
          }
        } else {
          lastTableCoords = null;
          hooks.onTableMenu?.(null);
        }
      };

      const schedule = () => {
        if (!raf) raf = requestAnimationFrame(render);
      };

      window.addEventListener('scroll', schedule, true);
      window.addEventListener('resize', schedule);
      view.dom.addEventListener('focus', schedule);
      view.dom.addEventListener('blur', schedule);

      return {
        update(v, prev) {
          if (
            prev.doc.eq(v.state.doc) &&
            prev.selection.eq(v.state.selection)
          )
            return;
          render(); // synchronous: DOM is already updated here
        },
        destroy() {
          window.removeEventListener('scroll', schedule, true);
          window.removeEventListener('resize', schedule);
          view.dom.removeEventListener('focus', schedule);
          view.dom.removeEventListener('blur', schedule);
          cancelAnimationFrame(raf);
        },
      };
    },
  });
}
