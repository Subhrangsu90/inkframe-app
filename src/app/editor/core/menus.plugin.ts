// core/menus.plugin.ts
import { EditorState, Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { EditorHooks } from './editor-hooks';

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

      const render = () => {
        raf = 0;
        const { state } = view;
        const slash = slashKey.getState(state)!;

        if (slash.open && !view.composing) {
          const c = view.coordsAtPos(slash.to);
          hooks.onSlashMenu({
            query: slash.query,
            from: slash.from,
            to: slash.to,
            left: c.left,
            top: c.bottom,
          });
        } else {
          hooks.onSlashMenu(null);
        }

        const { selection } = state;
        const showFloating =
          !slash.open &&
          selection instanceof TextSelection &&
          !selection.empty &&
          !selection.$from.parent.type.spec.code &&
          view.hasFocus();

        if (showFloating) {
          const domSel = view.dom.ownerDocument.getSelection();
          const rect =
            domSel && domSel.rangeCount
              ? domSel.getRangeAt(0).getBoundingClientRect()
              : null;
          hooks.onFloatingMenu(
            rect && (rect.width || rect.height)
              ? { left: rect.left + rect.width / 2, top: rect.top }
              : null,
          );
        } else {
          hooks.onFloatingMenu(null);
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
