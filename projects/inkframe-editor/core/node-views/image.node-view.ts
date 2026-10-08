import { Node as PMNode } from 'prosemirror-model';
import { EditorView, NodeView } from 'prosemirror-view';
import { imageStorage } from '../image-storage';

export interface ImagePreviewPayload {
  src: string;
  alt?: string;
  title?: string;
}

export class ImageNodeView implements NodeView {
  readonly dom: HTMLElement;
  private readonly imgWrapper: HTMLElement;
  private readonly img: HTMLImageElement;
  private readonly caption: HTMLElement;
  private readonly toolbarEl: HTMLElement;
  private readonly badgeEl: HTMLElement;
  private readonly handles: HTMLElement[] = [];
  private isDestroyed = false;
  private resolvedSrc = '';

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
    private onPreview?: (payload: ImagePreviewPayload) => void,
  ) {
    this.dom = document.createElement('figure');
    this.dom.className = 'ink-image-container';

    if (node.attrs['width']) {
      this.dom.style.width = node.attrs['width'];
    }

    // Wrapper for handles and toolbar positioning
    this.imgWrapper = document.createElement('div');
    this.imgWrapper.className = 'ink-image-wrapper';

    this.img = document.createElement('img');
    this.img.className = 'ink-image';
    this.img.alt = node.attrs['alt'] || '';
    this.img.title = node.attrs['title'] || 'Click to preview';
    this.img.setAttribute('referrerpolicy', 'no-referrer');

    // Click handler on image to open preview lightbox
    let downX = 0;
    let downY = 0;
    this.img.addEventListener('mousedown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
    });
    this.img.addEventListener('click', (e) => {
      const dx = Math.abs(e.clientX - downX);
      const dy = Math.abs(e.clientY - downY);
      if (dx < 6 && dy < 6) {
        e.preventDefault();
        e.stopPropagation();
        this.triggerPreview();
      }
    });

    // Caption
    this.caption = document.createElement('figcaption');
    this.caption.className = 'ink-image-caption';
    this.caption.textContent = node.attrs['alt'] || '';
    if (!node.attrs['alt']) {
      this.caption.style.display = 'none';
    }

    // Size badge (shows during drag resize)
    this.badgeEl = document.createElement('div');
    this.badgeEl.className = 'ink-image-size-badge';
    this.badgeEl.style.display = 'none';

    // Toolbar (presets, preview, delete)
    this.toolbarEl = document.createElement('div');
    this.toolbarEl.className = 'ink-image-toolbar';

    // Preview button
    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.className = 'ink-image-tool-btn preview-btn';
    previewBtn.title = 'Preview image';
    previewBtn.innerHTML = '🔍 Preview';
    previewBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.triggerPreview();
    });
    this.toolbarEl.appendChild(previewBtn);

    // Preset width buttons (25%, 50%, 75%, 100%)
    const presets = ['25%', '50%', '75%', '100%'];
    presets.forEach((preset) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ink-image-tool-btn preset-btn';
      btn.textContent = preset;
      btn.title = `Set width to ${preset}`;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.applyWidth(preset);
      });
      this.toolbarEl.appendChild(btn);
    });

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'ink-image-tool-btn delete-btn';
    deleteBtn.title = 'Remove image';
    deleteBtn.innerHTML = '✕';
    deleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = this.getPos();
      if (pos != null) {
        this.view.dispatch(
          this.view.state.tr.delete(pos, pos + this.node.nodeSize),
        );
      }
    });
    this.toolbarEl.appendChild(deleteBtn);

    // Resize handles: SE (bottom-right), E (right), SW (bottom-left), W (left)
    const handlePositions: Array<'se' | 'e' | 'sw' | 'w'> = [
      'se',
      'e',
      'sw',
      'w',
    ];
    handlePositions.forEach((pos) => {
      const handle = document.createElement('div');
      handle.className = `ink-image-resize-handle handle-${pos}`;
      handle.title = 'Drag to resize';
      handle.addEventListener('mousedown', (e) => this.onResizeStart(e, pos));
      this.handles.push(handle);
      this.imgWrapper.appendChild(handle);
    });

    this.imgWrapper.appendChild(this.img);
    this.imgWrapper.appendChild(this.badgeEl);
    this.imgWrapper.appendChild(this.toolbarEl);

    this.dom.appendChild(this.imgWrapper);
    this.dom.appendChild(this.caption);

    this.loadImage(node.attrs['src']);
  }

  private triggerPreview(): void {
    const src = this.resolvedSrc || this.node.attrs['src'];
    if (!src) return;
    if (this.onPreview) {
      this.onPreview({
        src,
        alt: this.node.attrs['alt'],
        title: this.node.attrs['title'],
      });
    } else {
      window.open(src, '_blank');
    }
  }

  private onResizeStart(
    e: MouseEvent,
    direction: 'se' | 'e' | 'sw' | 'w',
  ): void {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = this.dom.offsetWidth;
    const parentWidth =
      this.dom.parentElement?.clientWidth || window.innerWidth;
    this.dom.classList.add('is-resizing');

    this.badgeEl.style.display = 'block';
    this.badgeEl.textContent = `${Math.round(startWidth)}px`;

    let currentWidth = startWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startX;
      let targetWidth: number;
      if (direction === 'e' || direction === 'se') {
        targetWidth = startWidth + deltaX;
      } else {
        targetWidth = startWidth - deltaX;
      }
      currentWidth = Math.max(100, Math.min(parentWidth, targetWidth));
      this.dom.style.width = `${Math.round(currentWidth)}px`;
      this.badgeEl.textContent = `${Math.round(currentWidth)}px`;
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      this.dom.classList.remove('is-resizing');
      this.badgeEl.style.display = 'none';
      this.applyWidth(`${Math.round(currentWidth)}px`);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  private applyWidth(width: string): void {
    this.dom.style.width = width;
    const pos = this.getPos();
    if (pos != null) {
      const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...this.node.attrs,
        width,
      });
      this.view.dispatch(tr);
    }
  }

  private async loadImage(src: string): Promise<void> {
    if (!src) return;
    try {
      const resolved = await imageStorage.resolveUrl(src);
      this.resolvedSrc = resolved;
      if (!this.isDestroyed) {
        this.img.src = resolved;
      }
    } catch (e) {
      console.warn('Failed to resolve image src:', src, e);
      this.resolvedSrc = src;
      if (!this.isDestroyed) {
        this.img.src = src;
      }
    }
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.img.alt = node.attrs['alt'] || '';
    this.img.title = node.attrs['title'] || 'Click to preview';
    this.caption.textContent = node.attrs['alt'] || '';
    this.caption.style.display = node.attrs['alt'] ? 'block' : 'none';

    if (node.attrs['width']) {
      this.dom.style.width = node.attrs['width'];
    } else {
      this.dom.style.width = '';
    }

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
    const target = event.target as HTMLElement;
    return (
      this.toolbarEl.contains(target) ||
      target.classList.contains('ink-image-resize-handle')
    );
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.isDestroyed = true;
  }
}
