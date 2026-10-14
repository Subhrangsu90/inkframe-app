import { Node as PMNode } from 'prosemirror-model';
import { EditorView, NodeView } from 'prosemirror-view';
import { isTaskIndeterminate } from '../lists/list-schema';

/** The checkbox's accessible name: the task's first line, shortened. */
function taskLabel(node: PMNode): string {
  const text = (node.firstChild?.textContent ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return 'Task';
  return text.length > 80 ? `Task: ${text.slice(0, 79)}…` : `Task: ${text}`;
}

export class TaskItemNodeView implements NodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;
  private readonly checkbox: HTMLInputElement;
  private readonly check: HTMLLabelElement;

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.dom = document.createElement('li');
    this.dom.className = `ink-task-item${node.attrs['checked'] ? ' checked' : ''}`;
    this.dom.dataset['type'] = 'task_item';
    this.dom.dataset['checked'] = String(node.attrs['checked']);

    this.checkbox = document.createElement('input');
    this.checkbox.type = 'checkbox';
    this.checkbox.className = 'ink-task-checkbox';
    this.checkbox.checked = !!node.attrs['checked'];
    this.checkbox.contentEditable = 'false';

    this.checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      const pos = this.getPos();
      if (pos != null) {
        const isChecked = this.checkbox.checked;
        this.view.dispatch(this.view.state.tr.setNodeAttribute(pos, 'checked', isChecked));
      }
    });

    // The label is the checkbox's larger target on touch screens (see the styles).
    this.check = document.createElement('label');
    this.check.className = 'ink-task-check';
    this.check.contentEditable = 'false';
    this.check.append(this.checkbox);

    this.contentDOM = document.createElement('div');
    this.contentDOM.className = 'ink-task-content';

    this.dom.append(this.check, this.contentDOM);
    this.render();
  }

  /** Mixed state and label, which depend on the nested tasks and the text. */
  private render(): void {
    const indeterminate = isTaskIndeterminate(this.node);
    this.checkbox.indeterminate = indeterminate;
    this.dom.classList.toggle('indeterminate', indeterminate);
    this.checkbox.setAttribute('aria-label', taskLabel(this.node));
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    const isChecked = !!node.attrs['checked'];
    this.checkbox.checked = isChecked;
    this.dom.dataset['checked'] = String(isChecked);
    if (isChecked) {
      this.dom.classList.add('checked');
    } else {
      this.dom.classList.remove('checked');
    }
    this.render();
    return true;
  }

  stopEvent(event: Event): boolean {
    return this.check.contains(event.target as Node);
  }

  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }): boolean {
    return !this.contentDOM.contains(mutation.target);
  }
}
