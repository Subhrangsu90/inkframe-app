import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema } from '../../schema/schema';
import { docToHtml, htmlToDoc } from '../../io/html';
import { clearFormattingCommand } from '../clear-formatting/clear-formatting-commands';

describe('Text color mark', () => {
  it('applies and clears textColor mark and serializes to HTML', () => {
    const redSwatch = '#ef4444';
    const mark = schema.marks['textColor'].create({ color: redSwatch });
    const textNode = schema.text('Vibrant red text', [mark]);
    const doc = schema.node('doc', null, [schema.node('paragraph', null, [textNode])]);

    expect(doc.check()).toBeUndefined();
    const html = docToHtml(doc);
    expect(html).toMatch(/color: (rgb\(239, 68, 68\)|#ef4444)/);
    expect(html).toContain('Vibrant red text');

    // Round-trip HTML parsing
    const parsed = htmlToDoc(html);
    const parsedText = parsed.firstChild?.firstChild;
    expect(parsedText?.marks.some((m) => m.type.name === 'textColor')).toBe(true);

    // Clear formatting command removes textColor
    let state = EditorState.create({
      doc,
      schema,
      selection: TextSelection.create(doc, 1, doc.content.size - 1),
    });

    clearFormattingCommand(state, (tr) => {
      state = state.apply(tr);
    });

    const clearedText = state.doc.firstChild?.firstChild;
    expect(clearedText?.marks.length).toBe(0);
  });

  it('creates and serializes textColor mark', () => {
    const colorMark = schema.marks['textColor'].create({ color: '#ff5500' });
    const node = schema.text('Vibrant text', [colorMark]);
    const p = schema.nodes['paragraph'].create(null, [node]);
    const doc = schema.node('doc', null, [p]);
    const html = docToHtml(doc);

    expect(html).toMatch(/color:\s*(#ff5500|rgb\(255,\s*85,\s*0\))/i);

    const parsed = htmlToDoc(html);
    let foundColor = false;
    parsed.descendants((child) => {
      const mark = child.marks.find((m) => m.type.name === 'textColor');
      if (mark) {
        foundColor = true;
        expect(mark.attrs['color']).toMatch(/#ff5500|rgb\(255,\s*85,\s*0\)/i);
      }
    });
    expect(foundColor).toBe(true);
  });
});
