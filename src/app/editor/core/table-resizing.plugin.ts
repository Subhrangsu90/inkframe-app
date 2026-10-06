import { Plugin, PluginKey } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { TableMap } from 'prosemirror-tables';

export const tableResizingKey = new PluginKey('table-resizing');

interface DraggingRowState {
  tr: HTMLTableRowElement;
  startY: number;
  startHeight: number;
  tablePos: number;
  rowIndex: number;
}

export function tableResizingPlugin(): Plugin {
  let dragging: DraggingRowState | null = null;
  let activeTr: HTMLTableRowElement | null = null;
  let handleEl: HTMLDivElement | null = null;

  function ensureHandle(view: EditorView): HTMLDivElement {
    if (!handleEl) {
      handleEl = document.createElement('div');
      handleEl.className = 'ink-row-resize-handle';
      handleEl.style.display = 'none';
      view.dom.parentElement?.appendChild(handleEl);
    }
    return handleEl;
  }

  function hideHandle() {
    if (handleEl) {
      handleEl.style.display = 'none';
    }
    activeTr = null;
  }

  return new Plugin({
    key: tableResizingKey,
    props: {
      handleDOMEvents: {
        mousemove(view: EditorView, event: MouseEvent) {
          if (dragging) return false;

          const target = event.target as HTMLElement | null;
          if (!target) return false;

          const cell = target.closest('td, th') as HTMLTableCellElement | null;
          if (!cell) {
            if (activeTr) hideHandle();
            return false;
          }

          const tr = cell.closest('tr') as HTMLTableRowElement | null;
          const table = cell.closest('table') as HTMLTableElement | null;
          if (!tr || !table) {
            if (activeTr) hideHandle();
            return false;
          }

          const cellRect = cell.getBoundingClientRect();
          const distFromBottom = Math.abs(event.clientY - cellRect.bottom);

          // Within 6px of the bottom border of the row cell
          if (distFromBottom <= 6 && event.clientY >= cellRect.bottom - 6) {
            activeTr = tr;
            const tableRect = table.getBoundingClientRect();
            const h = ensureHandle(view);
            h.style.display = 'block';
            h.style.top = `${cellRect.bottom - 1.5}px`;
            h.style.left = `${tableRect.left}px`;
            h.style.width = `${tableRect.width}px`;
            view.dom.classList.add('row-resize-cursor');
            return false;
          } else if (activeTr && !dragging) {
            hideHandle();
            view.dom.classList.remove('row-resize-cursor');
          }

          return false;
        },

        mouseleave(view: EditorView) {
          if (!dragging) {
            hideHandle();
            view.dom.classList.remove('row-resize-cursor');
          }
          return false;
        },

        mousedown(view: EditorView, event: MouseEvent) {
          if (event.button !== 0 || !activeTr) return false;

          const tr = activeTr;
          const cell = (event.target as HTMLElement)?.closest('td, th');
          if (!cell) return false;

          const pos = view.posAtDOM(cell, 0);
          const $pos = view.state.doc.resolve(pos);
          let tableDepth = -1;
          for (let d = $pos.depth; d > 0; d--) {
            if ($pos.node(d).type.name === 'table') {
              tableDepth = d;
              break;
            }
          }
          if (tableDepth === -1) return false;

          const tablePos = $pos.before(tableDepth);
          const rowIndex = tr.rowIndex;

          event.preventDefault();
          event.stopPropagation();

          dragging = {
            tr,
            startY: event.clientY,
            startHeight: tr.offsetHeight,
            tablePos,
            rowIndex,
          };

          const onMouseMove = (moveEvt: MouseEvent) => {
            if (!dragging) return;
            const delta = moveEvt.clientY - dragging.startY;
            const newHeight = Math.max(32, dragging.startHeight + delta);
            dragging.tr.style.height = `${newHeight}px`;

            if (handleEl) {
              const r = dragging.tr.getBoundingClientRect();
              handleEl.style.top = `${r.bottom - 1.5}px`;
            }
          };

          const onMouseUp = (upEvt: MouseEvent) => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);

            if (!dragging) return;
            const finalDelta = upEvt.clientY - dragging.startY;
            const finalHeight = `${Math.max(32, dragging.startHeight + finalDelta)}px`;
            const { tablePos, rowIndex } = dragging;

            dragging = null;
            hideHandle();
            view.dom.classList.remove('row-resize-cursor');

            // Apply height attribute across all cells in that row
            const { state, dispatch } = view;
            const tableNode = state.doc.nodeAt(tablePos);
            if (!tableNode || tableNode.type.name !== 'table') return;

            const map = TableMap.get(tableNode);
            if (rowIndex >= map.height) return;

            let trTx = state.tr;
            for (let col = 0; col < map.width; col++) {
              const cellMapPos = map.map[rowIndex * map.width + col];
              const cellAbsPos = tablePos + 1 + cellMapPos;
              const cellNode = state.doc.nodeAt(cellAbsPos);
              if (cellNode) {
                const newAttrs = { ...cellNode.attrs, height: finalHeight };
                trTx = trTx.setNodeMarkup(cellAbsPos, undefined, newAttrs);
              }
            }

            dispatch(trTx);
            view.focus();
          };

          window.addEventListener('mousemove', onMouseMove);
          window.addEventListener('mouseup', onMouseUp);

          return true;
        },
      },
    },
    destroy() {
      if (handleEl && handleEl.parentNode) {
        handleEl.parentNode.removeChild(handleEl);
        handleEl = null;
      }
    },
  });
}
