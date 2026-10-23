import { describe, it, expect, afterEach, vi } from 'vitest';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { schema } from '../../schema/schema';
import { docToHtml } from '../../io/html';
import { docToMarkdown, markdownToDoc } from '../../io/markdown';
import { ImageNodeView } from './image.node-view';

describe('Image node view', () => {
  let view: EditorView;
  afterEach(() => view?.destroy());

  const setup = () => {
    view?.destroy();
    const onPreview = vi.fn();
    const image = schema.nodes['image'].create({ src: 'https://example.com/a.png' });
    view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        doc: schema.node('doc', null, [schema.node('paragraph', null, [image])]),
      }),
      nodeViews: {
        image: (node, v, getPos) => new ImageNodeView(node, v, getPos, onPreview),
      },
    });
    const figure = view.dom.querySelector<HTMLElement>('.ink-image-container')!;
    return { onPreview, figure, img: figure.querySelector('img')! };
  };
  const width = () => view.state.doc.firstChild!.firstChild!.attrs['width'];
  const pointer = (target: EventTarget, type: string, init: PointerEventInit) =>
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, ...init }));

  it('resizes with a finger or a pen, as with a mouse', () => {
    for (const pointerType of ['touch', 'pen', 'mouse']) {
      const { figure } = setup();
      const handle = figure.querySelector('.handle-e')!;
      pointer(handle, 'pointerdown', { pointerType, pointerId: 3, button: 0, clientX: 100 });
      pointer(window, 'pointermove', { pointerType, pointerId: 4, clientX: 900 }); // another finger
      pointer(window, 'pointermove', { pointerType, pointerId: 3, clientX: 350 });
      expect(figure.style.width).toBe('250px');
      pointer(window, 'pointerup', { pointerType, pointerId: 3, clientX: 350 });
      expect(width()).toBe('250px');
    }
  });

  it('a selected image stays selected once resized, so its handles stay shown', () => {
    const { figure } = setup();
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 1)));
    (figure.querySelector('.preset-btn') as HTMLButtonElement).click(); // 25%
    expect(width()).toBe('25%');
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect(figure.classList.contains('selected')).toBe(true);
  });

  it('keeps the width when the browser cancels the drag', () => {
    const { figure } = setup();
    pointer(figure.querySelector('.handle-e')!, 'pointerdown', {
      pointerType: 'touch',
      pointerId: 1,
      button: 0,
      clientX: 100,
    });
    pointer(window, 'pointermove', { pointerId: 1, clientX: 400 });
    pointer(window, 'pointercancel', { pointerId: 1 });
    expect(figure.style.width).toBe('');
    expect(width()).toBeNull();
  });

  it('with a finger, the first tap selects the image and the next previews it', () => {
    const { onPreview, img } = setup();
    const tap = (pointerType: string) => {
      pointer(img, 'pointerdown', { pointerType, clientX: 10, clientY: 10 });
      img.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }),
      );
    };
    tap('touch');
    expect(onPreview).not.toHaveBeenCalled();
    // In a browser, ProseMirror selects the image on that tap.
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 1)));
    tap('touch');
    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it('with a mouse, a click previews the image straight away', () => {
    const { onPreview, img } = setup();
    pointer(img, 'pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    img.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }),
    );
    expect(onPreview).toHaveBeenCalledTimes(1);
  });
});

describe('Image node', () => {
  it('supports dual-mode image node serialization (external link and local storage URI)', () => {
    const remoteImg = schema.nodes['image'].create({
      src: 'https://images.unsplash.com/photo-example.jpg',
      alt: 'Scenic photo',
      title: 'Scenic',
    });
    const localImg = schema.nodes['image'].create({
      src: 'inkframe-img:test-uuid-1234',
      alt: 'Uploaded graphic',
    });

    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('Gallery:'), remoteImg, localImg]),
    ]);

    // HTML output
    const html = docToHtml(doc);
    expect(html).toContain('src="https://images.unsplash.com/photo-example.jpg"');
    expect(html).toContain('src="inkframe-img:test-uuid-1234"');

    // Markdown output
    const md = docToMarkdown(doc);
    expect(md).toContain('![Scenic photo](https://images.unsplash.com/photo-example.jpg "Scenic")');
    expect(md).toContain('![Uploaded graphic](inkframe-img:test-uuid-1234)');

    // Markdown parser reconstructs images
    const parsedFromMd = markdownToDoc(md);
    let foundRemote = false;
    let foundLocal = false;
    parsedFromMd.descendants((node) => {
      if (node.type.name === 'image') {
        if (node.attrs['src'] === 'https://images.unsplash.com/photo-example.jpg')
          foundRemote = true;
        if (node.attrs['src'] === 'inkframe-img:test-uuid-1234') foundLocal = true;
      }
    });
    expect(foundRemote).toBe(true);
    expect(foundLocal).toBe(true);
  });
});
