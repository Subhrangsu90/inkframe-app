import type { EditorService } from './editor.service';

export interface SlashItem {
  id: string;
  label: string;
  hint: string;
  icon: string; // Material icon name
  keywords: string[];
  run(svc: EditorService): void;
}

export const SLASH_ITEMS: SlashItem[] = [
  { id: 'p',   label: 'Text',          hint: 'Plain paragraph',  icon: 'notes',              keywords: ['paragraph', 'text'], run: (s) => s.paragraph() },
  { id: 'h1',  label: 'Heading 1',     hint: 'Large heading',    icon: 'format_h1',          keywords: ['h1', 'title'],       run: (s) => s.heading(1) },
  { id: 'h2',  label: 'Heading 2',     hint: 'Medium heading',   icon: 'format_h2',          keywords: ['h2'],                run: (s) => s.heading(2) },
  { id: 'h3',  label: 'Heading 3',     hint: 'Small heading',    icon: 'format_h3',          keywords: ['h3'],                run: (s) => s.heading(3) },
  { id: 'ul',  label: 'Bullet list',   hint: 'Unordered list',   icon: 'format_list_bulleted', keywords: ['ul', 'bullets'],    run: (s) => s.toggleList('bullet_list') },
  { id: 'ol',  label: 'Numbered list', hint: 'Ordered list',     icon: 'format_list_numbered', keywords: ['ol', 'numbers'],    run: (s) => s.toggleList('ordered_list') },
  { id: 'todo', label: 'Task list',    hint: 'Checklist with checkboxes', icon: 'check_box', keywords: ['todo', 'task', 'checklist', 'check'], run: (s) => s.toggleTaskList() },
  { id: 'q',   label: 'Quote',         hint: 'Blockquote',       icon: 'format_quote',       keywords: ['blockquote'],        run: (s) => s.blockquote() },
  { id: 'cb',  label: 'Code block',    hint: 'Monospace block',  icon: 'code',               keywords: ['code', 'pre'],       run: (s) => s.codeBlock() },
  { id: 'cl',  label: 'Callout',       hint: 'Highlighted note', icon: 'info',               keywords: ['note', 'info'],      run: (s) => s.insertCallout('info') },
  { id: 'tbl', label: 'Table',         hint: '3 × 3 table',     icon: 'table_chart',        keywords: ['grid'],              run: (s) => s.insertTable(3, 3) },
  { id: 'img', label: 'Image',         hint: 'Upload image (IDB)', icon: 'image',           keywords: ['image', 'photo', 'picture', 'upload'], run: (s) => {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        s.insertImage(file);
      }
    };
    input.click();
  }},
  { id: 'hr',  label: 'Divider',       hint: 'Horizontal rule',  icon: 'horizontal_rule',    keywords: ['hr', 'line'],        run: (s) => s.insertDivider() },
];
