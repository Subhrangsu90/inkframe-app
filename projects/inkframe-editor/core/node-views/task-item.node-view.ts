import { Node as PMNode } from 'prosemirror-model';
import { EditorView, NodeView } from 'prosemirror-view';

export class TaskItemNodeView implements NodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;
  private readonly checkbox: HTMLInputElement;

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

    this.contentDOM = document.createElement('div');
    this.contentDOM.className = 'ink-task-content';

    this.dom.append(this.checkbox, this.contentDOM);
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
    return true;
  }

  stopEvent(event: Event): boolean {
    return this.checkbox === event.target || this.checkbox.contains(event.target as Node);
  }

  ignoreMutation(
    mutation: MutationRecord | { type: 'selection'; target: Node },
  ): boolean {
    return !this.contentDOM.contains(mutation.target);
  }
}
