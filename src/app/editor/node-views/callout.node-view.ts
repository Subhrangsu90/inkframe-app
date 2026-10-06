import {
  ApplicationRef,
  ComponentRef,
  EnvironmentInjector,
  createComponent,
} from '@angular/core';
import { Node as PMNode } from 'prosemirror-model';
import { EditorView, NodeView } from 'prosemirror-view';
import { CalloutIconComponent } from './callout-icon.component';

export class CalloutNodeView implements NodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;
  private readonly iconHost: HTMLElement;
  private readonly ref: ComponentRef<CalloutIconComponent>;

  constructor(
    private node: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
    env: EnvironmentInjector,
    appRef: ApplicationRef,
  ) {
    this.dom = document.createElement('div');
    this.dom.className = `callout callout-${node.attrs['type']}`;
    this.dom.dataset['callout'] = node.attrs['type'];

    this.iconHost = document.createElement('span');
    this.iconHost.contentEditable = 'false';

    this.contentDOM = document.createElement('div');
    this.contentDOM.className = 'callout-body';

    this.dom.append(this.iconHost, this.contentDOM);

    this.ref = createComponent(CalloutIconComponent, {
      environmentInjector: env,
      hostElement: this.iconHost,
    });
    this.ref.setInput('kind', node.attrs['type']);
    this.ref.instance.kindChange.subscribe((kind) => {
      const pos = getPos();
      if (pos == null) return;
      view.dispatch(view.state.tr.setNodeAttribute(pos, 'type', kind));
    });
    appRef.attachView(this.ref.hostView); // enables change detection for the component
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false; // different node: recreate
    this.node = node;
    this.dom.className = `callout callout-${node.attrs['type']}`;
    this.dom.dataset['callout'] = node.attrs['type'];
    this.ref.setInput('kind', node.attrs['type']);
    return true;
  }

  stopEvent(event: Event): boolean {
    return this.iconHost.contains(event.target as Node); // clicks on the icon are Angular's
  }

  ignoreMutation(
    mutation: MutationRecord | { type: 'selection'; target: Node },
  ): boolean {
    return !this.contentDOM.contains(mutation.target); // only the content area is ProseMirror's
  }

  destroy(): void {
    this.ref.destroy();
  }
}
