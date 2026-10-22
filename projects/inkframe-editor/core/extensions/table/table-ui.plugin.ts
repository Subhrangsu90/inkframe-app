import { Plugin, PluginKey, Selection } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';
import { addColumnAfter, addRowAfter } from 'prosemirror-tables';

export const tableUIKey = new PluginKey('table-ui');

/**
 * Dispatched (bubbling) on the editor DOM when a column options button is
 * clicked. `detail` holds the viewport coordinates to open the menu at.
 */
export const OPEN_COLUMN_MENU_EVENT = 'ink-open-column-menu';

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

type GetPos = () => number | undefined;

/**
 * Moves the cursor into the cell the widget sits in. Widgets receive their
 * own view and position at render time, so this works with several editors
 * on one page and stays correct as the document changes.
 */
function focusCell(view: EditorView, getPos: GetPos): boolean {
  const pos = getPos();
  if (!view.editable || pos == null) return false;
  view.focus();
  view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(pos))));
  return true;
}

function controlButton(
  className: string,
  title: string,
  label: string,
  onClick: (btn: HTMLButtonElement) => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.title = title;
  btn.textContent = label;
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick(btn);
  });
  return btn;
}

function rowHandle(view: EditorView, getPos: GetPos): HTMLElement {
  const el = document.createElement('div');
  el.className = 'ink-table-row-handle';

  const dot = document.createElement('span');
  dot.className = 'ink-table-row-dot';
  dot.textContent = '•';
  el.appendChild(dot);

  el.appendChild(
    controlButton('ink-table-add-row-btn', 'Insert row below', '+', () => {
      if (focusCell(view, getPos)) addRowAfter(view.state, view.dispatch);
    }),
  );
  return el;
}

function cornerDot(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'ink-table-col-corner-dot';
  el.textContent = '•';
  return el;
}

function columnHandle(view: EditorView, getPos: GetPos): HTMLElement {
  const el = document.createElement('div');
  el.className = 'ink-table-col-header-handle';

  const dot = document.createElement('span');
  dot.className = 'ink-table-col-dot';
  dot.textContent = '•';
  el.appendChild(dot);

  el.appendChild(
    controlButton('ink-table-add-col-btn', 'Insert column right', '+', () => {
      if (focusCell(view, getPos)) addColumnAfter(view.state, view.dispatch);
    }),
  );

  el.appendChild(
    controlButton('ink-table-col-opt-btn', 'Column options', '▾', (btn) => {
      if (!focusCell(view, getPos)) return;
      const rect = btn.getBoundingClientRect();
      view.dom.dispatchEvent(
        new CustomEvent(OPEN_COLUMN_MENU_EVENT, {
          bubbles: true,
          detail: { clientX: rect.left, clientY: rect.bottom + 4 },
        }),
      );
    }),
  );
  return el;
}

function cellPlaceholder(): HTMLElement {
  const el = document.createElement('span');
  el.className = 'ink-table-cell-placeholder';
  const pill = document.createElement('span');
  pill.className = 'ink-slash-pill';
  pill.textContent = '/';
  el.append(pill, ' to insert');
  return el;
}

const widgetSpec = { side: -1, ignoreSelection: true };

function buildTableDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== 'table') return true;

    node.forEach((row, rowOffset, rowIndex) => {
      const rowPos = pos + 1 + rowOffset;

      row.forEach((cell, cellOffset, cellIndex) => {
        const cellPos = rowPos + 1 + cellOffset;
        const inCell = cellPos + 1;

        // Left interactive handle for each row (attached to first cell)
        if (cellIndex === 0) {
          decorations.push(Decoration.widget(inCell, rowHandle, widgetSpec));
        }

        // Column header controls: separator dot, [+] adder and [▾] options
        if (rowIndex === 0) {
          if (cellIndex === 0) {
            decorations.push(Decoration.widget(inCell, cornerDot, widgetSpec));
          }
          decorations.push(Decoration.widget(inCell, columnHandle, widgetSpec));
        }

        // Empty cell placeholder ("/ to insert")
        if (cell.childCount === 1) {
          const firstChild = cell.child(0);
          if (firstChild.type.name === 'paragraph' && firstChild.content.size === 0) {
            decorations.push(Decoration.widget(cellPos + 2, cellPlaceholder, widgetSpec));
          }
        }
      });
    });

    return false; // don't descend further
  });

  return DecorationSet.create(doc, decorations);
}
