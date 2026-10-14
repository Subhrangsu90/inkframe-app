import { createExtension } from '../../editor/extension-types';
import { bullet_list, list_item, ordered_list, task_item, task_list } from './list-schema';
import { bulletListRule, orderedListRule, taskItemRule } from './list-input-rules';
import { toggleListCommand } from './list-commands';
import { TaskItemNodeView } from './task-item.node-view';

// Each list extension brings its list node; bullet and numbered lists share
// list_item. Any of them also brings the list keys (Enter, Tab, Backspace,
// Delete, Mod-Enter, Alt+Shift+Up/Down), the merging of adjacent lists and
// drag-to-move (see ExtensionManager).

export const BulletListExtension = createExtension({
  name: 'bullet_list',
  nodes: { bullet_list, list_item },
  inputRules: (ctx) => [bulletListRule(ctx.schema.nodes['bullet_list'])],
  keymaps: () => ({
    'Shift-Mod-8': toggleListCommand('bullet_list'),
  }),
  slashItems: [
    {
      id: 'ul',
      label: 'Bullet list',
      hint: 'Unordered list',
      icon: 'format_list_bulleted',
      keywords: ['ul', 'bullets', 'list'],
      run: (s) => s.toggleList('bullet_list'),
    },
  ],
});

export const OrderedListExtension = createExtension({
  name: 'ordered_list',
  nodes: { ordered_list, list_item },
  inputRules: (ctx) => [orderedListRule(ctx.schema.nodes['ordered_list'])],
  keymaps: () => ({
    'Shift-Mod-7': toggleListCommand('ordered_list'),
  }),
  slashItems: [
    {
      id: 'ol',
      label: 'Numbered list',
      hint: 'Ordered list',
      icon: 'format_list_numbered',
      keywords: ['ol', 'numbers', 'list'],
      run: (s) => s.toggleList('ordered_list'),
    },
  ],
});

export const TaskListExtension = createExtension({
  name: 'task_list',
  nodes: { task_list, task_item },
  inputRules: () => [taskItemRule()],
  keymaps: () => ({
    'Shift-Mod-6': toggleListCommand('task_list'),
  }),
  nodeViews: () => ({
    task_item: (node, view, getPos) => new TaskItemNodeView(node, view, getPos),
  }),
  slashItems: [
    {
      id: 'todo',
      label: 'Task list',
      hint: 'Checklist with interactive checkboxes',
      icon: 'check_box',
      keywords: ['todo', 'task', 'checklist', 'check'],
      run: (s) => s.toggleTaskList(),
    },
  ],
});
