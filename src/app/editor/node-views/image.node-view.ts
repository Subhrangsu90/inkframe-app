import { Node as PMNode } from 'prosemirror-model';
import { EditorView, NodeView } from 'prosemirror-view';
import { imageStorage } from '../core/image-storage';

export class ImageNodeView implements NodeView {
  readonly dom: HTMLElement;
  private readonly img: HTMLImageElement;
  private readonly caption: HTMLElement;
  private readonly deleteBtn: HTMLButtonElement;
  private isDestroyed = false;

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.dom = document.createElement('figure');
    this.dom.className = 'ink-image-container';

    this.img = document.createElement('img');
    this.img.className = 'ink-image';
    this.img.alt = node.attrs['alt'] || '';
    if (node.attrs['title']) {
      this.img.title = node.attrs['title'];
    }

    this.caption = document.createElement('figcaption');
    this.caption.className = 'ink-image-caption';
    this.caption.textContent = node.attrs['alt'] || '';
    if (!node.attrs['alt']) {
      this.caption.style.display = 'none';
    }

    this.deleteBtn = document.createElement('button');
    this.deleteBtn.type = 'button';
    this.deleteBtn.className = 'ink-image-delete-btn';
    this.deleteBtn.title = 'Remove image';
    this.deleteBtn.innerHTML = '✕';
    this.deleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = this.getPos();
      if (pos != null) {
        this.view.dispatch(this.view.state.tr.delete(pos, pos + this.node.nodeSize));
      }
    });

    this.dom.appendChild(this.img);
    this.dom.appendChild(this.deleteBtn);
    this.dom.appendChild(this.caption);

    this.loadImage(node.attrs['src']);
  }

  private async loadImage(src: string): Promise<void> {
    if (!src) return;
    try {
      const resolved = await imageStorage.resolveUrl(src);
      if (!this.isDestroyed) {
        this.img.src = resolved;
      }
    } catch (e) {
      console.warn('Failed to resolve image src:', src, e);
      if (!this.isDestroyed) {
        this.img.src = src;
      }
    }
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.img.alt = node.attrs['alt'] || '';
    this.caption.textContent = node.attrs['alt'] || '';
    this.caption.style.display = node.attrs['alt'] ? 'block' : 'none';
    this.loadImage(node.attrs['src']);
    return true;
  }

  selectNode(): void {
    this.dom.classList.add('selected');
  }

  deselectNode(): void {
    this.dom.classList.remove('selected');
  }

  stopEvent(event: Event): boolean {
    return this.deleteBtn.contains(event.target as Node);
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.isDestroyed = true;
  }
}
