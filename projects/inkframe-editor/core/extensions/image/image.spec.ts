import { describe, it, expect } from 'vitest';
import { schema } from '../../schema/schema';
import { docToHtml } from '../../io/html';
import { docToMarkdown, markdownToDoc } from '../../io/markdown';

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
