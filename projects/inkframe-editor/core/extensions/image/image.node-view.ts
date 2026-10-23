import { Node as PMNode } from 'prosemirror-model';
import { NodeSelection } from 'prosemirror-state';
import { EditorView, NodeView } from 'prosemirror-view';
import { imageStorage } from '../../storage/image-storage';

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
    // Set before the source: images far down a long document load when scrolled near.
    this.img.loading = 'lazy';
    this.img.decoding = 'async';
    this.img.alt = node.attrs['alt'] || '';
    this.img.title = node.attrs['title'] || 'Click to preview';
    this.img.setAttribute('referrerpolicy', 'no-referrer');

    // Click handler on image to open preview lightbox. A finger has no hover
    // to show the toolbar and resize handles, so its first tap only selects
    // the image (which shows them); a tap on the selected image previews it.
    let downX = 0;
    let downY = 0;
    let tapSelects = false;
    this.img.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
      tapSelects = e.pointerType !== 'mouse' && !this.dom.classList.contains('selected');
    });
    this.img.addEventListener('click', (e) => {
      const dx = Math.abs(e.clientX - downX);
      const dy = Math.abs(e.clientY - downY);
      if (dx < 6 && dy < 6) {
        e.preventDefault();
        e.stopPropagation();
        if (!tapSelects) this.triggerPreview();
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
        this.view.dispatch(this.view.state.tr.delete(pos, pos + this.node.nodeSize));
      }
    });
    this.toolbarEl.appendChild(deleteBtn);

    // Resize handles: SE (bottom-right), E (right), SW (bottom-left), W (left)
    const handlePositions: ('se' | 'e' | 'sw' | 'w')[] = ['se', 'e', 'sw', 'w'];
    handlePositions.forEach((pos) => {
      const handle = document.createElement('div');
      handle.className = `ink-image-resize-handle handle-${pos}`;
      handle.title = 'Drag to resize';
      handle.addEventListener('pointerdown', (e) => this.onResizeStart(e, pos));
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

  /** Pointer events: a mouse, a pen or a finger (the handles' CSS stops a finger scrolling instead). */
  private onResizeStart(e: PointerEvent, direction: 'se' | 'e' | 'sw' | 'w'): void {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = this.dom.offsetWidth;
    // On a zoomed page the pointer moves in viewport pixels; widths are CSS pixels.
    const scale = this.dom.getBoundingClientRect().width / startWidth || 1;
    const parentWidth = this.dom.parentElement?.clientWidth || window.innerWidth;
    this.dom.classList.add('is-resizing');

    this.badgeEl.style.display = 'block';
    this.badgeEl.textContent = `${Math.round(startWidth)}px`;

    let currentWidth = startWidth;

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== e.pointerId) return;
      moveEvent.preventDefault();
      const deltaX = (moveEvent.clientX - startX) / scale;
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

    const onPointerEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      this.dom.classList.remove('is-resizing');
      this.badgeEl.style.display = 'none';
      if (endEvent.type === 'pointercancel') {
        // The browser took the gesture over: back to the width before it.
        this.dom.style.width = this.node.attrs['width'] || '';
        return;
      }
      this.applyWidth(`${Math.round(currentWidth)}px`);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
  }

  private applyWidth(width: string): void {
    this.dom.style.width = width;
    const pos = this.getPos();
    if (pos != null) {
      const { selection } = this.view.state;
      const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...this.node.attrs,
        width,
      });
      // A selected image stays selected, its toolbar and handles shown: on a
      // touch screen, nothing else shows them.
      if (selection instanceof NodeSelection && selection.from === pos) {
        tr.setSelection(NodeSelection.create(tr.doc, pos));
      }
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
    return this.toolbarEl.contains(target) || target.classList.contains('ink-image-resize-handle');
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.isDestroyed = true;
  }
}
