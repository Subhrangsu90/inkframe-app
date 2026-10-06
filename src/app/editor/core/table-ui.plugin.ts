import { Plugin, PluginKey, Selection } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';
import { addColumnAfter, addColumnBefore, deleteColumn } from 'prosemirror-tables';

export const tableUIKey = new PluginKey('table-ui');

export function tableUIPlugin(): Plugin {
  return new Plugin({
    key: tableUIKey,
    state: {
      init(_, { doc }) {
        return buildTableDecorations(doc);
      },
      apply(tr, oldSet) {
        if (!tr.docChanged) return oldSet;
        return buildTableDecorations(tr.doc);
      },
    },
    props: {
      decorations(state) {
        return tableUIKey.getState(state);
      },
    },
  });
}

function buildTableDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      let isFirstRow = true;

      node.forEach((row, rowOffset) => {
        const rowPos = pos + 1 + rowOffset;

        row.forEach((cell, cellOffset) => {
          const cellPos = rowPos + 1 + cellOffset;

          // Left dot handle for each row (attached to first cell)
          if (cellOffset === 0) {
            const rowDotWidget = document.createElement('div');
            rowDotWidget.className = 'ink-table-row-handle';
            rowDotWidget.innerHTML = '•';
            decorations.push(
              Decoration.widget(cellPos + 1, rowDotWidget, {
                side: -1,
                ignoreSelection: true,
              }),
            );
          }

          // Column Header Controls: Top separator dot, [+] adder, and [∨] column options
          if (isFirstRow) {
            if (cellOffset === 0) {
              const leftDot = document.createElement('div');
              leftDot.className = 'ink-table-col-corner-dot';
              leftDot.innerHTML = '•';
              decorations.push(
                Decoration.widget(cellPos + 1, leftDot, {
                  side: -1,
                  ignoreSelection: true,
                }),
              );
            }

            const colHandle = document.createElement('div');
            colHandle.className = 'ink-table-col-header-handle';

            // Top divider dot
            const dot = document.createElement('span');
            dot.className = 'ink-table-col-dot';
            dot.textContent = '•';
            colHandle.appendChild(dot);

            // Add Column [+] Button (matching Screenshot7.png)
            const addColBtn = document.createElement('button');
            addColBtn.type = 'button';
            addColBtn.className = 'ink-table-add-col-btn';
            addColBtn.title = 'Insert column right';
            addColBtn.innerHTML = '+';
            addColBtn.addEventListener('mousedown', (e) => {
              e.preventDefault();
              e.stopPropagation();
            });
            addColBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              const view = (window as any).__ink_active_view__ as EditorView | undefined;
              if (view) {
                view.focus();
                const tr = view.state.tr.setSelection(
                  Selection.near(view.state.doc.resolve(cellPos + 1)),
                );
                view.dispatch(tr);
                addColumnAfter(view.state, view.dispatch);
              }
            });
            colHandle.appendChild(addColBtn);

            // Column Options [∨] Button (matching Screenshot7.png)
            const colOptBtn = document.createElement('button');
            colOptBtn.type = 'button';
            colOptBtn.className = 'ink-table-col-opt-btn';
            colOptBtn.title = 'Column options';
            colOptBtn.innerHTML = '▾';
            colOptBtn.addEventListener('mousedown', (e) => {
              e.preventDefault();
              e.stopPropagation();
            });
            colOptBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              const view = (window as any).__ink_active_view__ as EditorView | undefined;
              if (view) {
                view.focus();
                const tr = view.state.tr.setSelection(
                  Selection.near(view.state.doc.resolve(cellPos + 1)),
                );
                view.dispatch(tr);
                const rect = colOptBtn.getBoundingClientRect();
                const evt = new CustomEvent('ink-open-column-menu', {
                  detail: { clientX: rect.left, clientY: rect.bottom + 4 },
                });
                window.dispatchEvent(evt);
              }
            });
            colHandle.appendChild(colOptBtn);

            decorations.push(
              Decoration.widget(cellPos + 1, colHandle, {
                side: -1,
                ignoreSelection: true,
              }),
            );
          }
        });

        isFirstRow = false;

        // Empty Cell Placeholder ("/ to insert") matching Screenshot7.png
        row.forEach((cell, cellOffset) => {
          const cellPos = rowPos + 1 + cellOffset;
          if (cell.childCount === 1) {
            const firstChild = cell.child(0);
            if (firstChild.type.name === 'paragraph' && firstChild.content.size === 0) {
              const placeholder = document.createElement('span');
              placeholder.className = 'ink-table-cell-placeholder';
              placeholder.innerHTML = '<span class="ink-slash-pill">/</span> to insert';
              decorations.push(
                Decoration.widget(cellPos + 2, placeholder, {
                  side: -1,
                  ignoreSelection: true,
                }),
              );
            }
          }
        });
      });

      return false; // don't descend further
    }
    return true;
  });

  return DecorationSet.create(doc, decorations);
}
