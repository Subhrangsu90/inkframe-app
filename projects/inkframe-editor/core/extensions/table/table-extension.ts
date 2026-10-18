import { columnResizing, tableEditing, goToNextCell } from 'prosemirror-tables';
import { createExtension } from '../../editor/extension-types';
import { tableNodeSpecs } from './table-schema';
import { tableUIPlugin } from './table-ui.plugin';
import { zoomedColumnResizing } from './zoomed-column-resizing.plugin';

export const TableExtension = createExtension({
  name: 'table',
  nodes: tableNodeSpecs,
  plugins: () => [
    zoomedColumnResizing(),
    columnResizing({ handleWidth: 6, cellMinWidth: 45, lastColumnResizable: true }),
    tableEditing(),
    tableUIPlugin(),
  ],
  keymaps: () => ({
    Tab: goToNextCell(1),
    'Shift-Tab': goToNextCell(-1),
  }),
  slashItems: [
    {
      id: 'tbl',
      label: 'Table',
      hint: '3 × 3 interactive table',
      icon: 'table_chart',
      keywords: ['grid', 'table'],
      run: (s) => s.insertTable(3, 3),
    },
  ],
});
