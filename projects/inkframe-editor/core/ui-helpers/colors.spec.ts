import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema } from '../schema/schema';

describe('Color swatches and emojis', () => {
  it('defines 21 color swatches (3x7 grid) and common emojis', async () => {
    const { TEXT_COLORS, COMMON_EMOJIS } = await import('./colors');
    expect(TEXT_COLORS.length).toBe(21);
    expect(COMMON_EMOJIS.length).toBeGreaterThanOrEqual(20);

    // Verify each swatch has value and name defined
    for (const swatch of TEXT_COLORS) {
      expect(swatch.value).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(swatch.name).toBeTruthy();
    }
  });

  it('inserts emojis into ProseMirror state cleanly', () => {
    const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Hello ')])]);
    let state = EditorState.create({
      doc,
      schema,
      selection: TextSelection.create(doc, 7), // after 'Hello '
    });

    const emoji = '🚀';
    const tr = state.tr.insertText(emoji, state.selection.from, state.selection.to);
    state = state.apply(tr);

    expect(state.doc.textContent).toBe('Hello 🚀');
  });
});
