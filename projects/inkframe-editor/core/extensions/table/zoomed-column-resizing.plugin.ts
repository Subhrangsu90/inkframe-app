import { Plugin } from 'prosemirror-state';
import { columnResizingPluginKey } from 'prosemirror-tables';

/**
 * Keeps a dragged column border under the pointer on a zoomed page.
 *
 * prosemirror-tables sizes the column by how far the pointer moved, in
 * viewport pixels, but column widths are CSS pixels; on a page zoomed with CSS
 * `zoom` the border would run ahead of the pointer (zoomed in) or lag behind
 * it (zoomed out). While a column is dragged on a zoomed page, this passes the
 * mouse events on to its `window` listeners with the distance scaled back.
 * Put it before `columnResizing()`; at 100% it does nothing.
 */
export function zoomedColumnResizing(): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          const resizing = columnResizingPluginKey.getState(view.state);
          if (!resizing || resizing.activeHandle < 0 || resizing.dragging || event.button !== 0) {
            return false;
          }
          const scale = view.dom.getBoundingClientRect().width / view.dom.offsetWidth || 1;
          if (Math.abs(scale - 1) < 0.001) return false;

          const win = view.dom.ownerDocument.defaultView ?? window;
          const startX = event.clientX;
          const ours = new WeakSet<Event>();
          // Window capture listeners run first: the real event stops there,
          // and a copy with the scaled position reaches the resizer instead.
          const relay = (e: MouseEvent) => {
            if (ours.has(e)) return;
            e.stopImmediatePropagation();
            // A move with no button down means it was released outside the window.
            const type = e.type === 'mousemove' && e.buttons === 0 ? 'mouseup' : e.type;
            const copy = new MouseEvent(type, {
              clientX: startX + (e.clientX - startX) / scale,
              clientY: e.clientY,
              button: 0,
              buttons: e.buttons,
            });
            ours.add(copy);
            win.dispatchEvent(copy);
            if (type === 'mouseup') stop();
          };
          const stop = () => {
            win.removeEventListener('mousemove', relay, true);
            win.removeEventListener('mouseup', relay, true);
          };
          win.addEventListener('mousemove', relay, true);
          win.addEventListener('mouseup', relay, true);
          return false; // prosemirror-tables starts the drag itself
        },
      },
    },
  });
}
