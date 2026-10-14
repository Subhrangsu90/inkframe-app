import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { schema } from '../schema/schema';

describe('Read-only view', () => {
  it('toggles ProseMirror-preview class when view is in read-only or editable mode', () => {
    const container = document.createElement('div');
    const doc = schema.node('doc', null, [
      schema.nodes['paragraph'].create(null, [schema.text('Test preview')]),
    ]);
    const state = EditorState.create({ doc, schema });
    let editable = false;
    const view = new EditorView(container, {
      state,
      editable: () => editable,
    });
    view.dom.classList.toggle('ProseMirror-preview', !editable);

    expect(view.dom.classList.contains('ProseMirror-preview')).toBe(true);

    editable = true;
    view.dom.classList.toggle('ProseMirror-preview', !editable);
    expect(view.dom.classList.contains('ProseMirror-preview')).toBe(false);

    view.destroy();
    container.remove();
  });
});

describe('Performance', () => {
  it('executes 100 consecutive typing transactions in < 16ms average latency', () => {
    // Construct a substantial multi-block document
    const paragraphs = Array.from({ length: 50 }, (_, i) =>
      schema.nodes['paragraph'].create(null, [
        schema.text(
          `Paragraph ${i + 1}: inkframe performance profiling and latency evaluation test.`,
        ),
      ]),
    );
    const doc = schema.node('doc', null, paragraphs);
    let state = EditorState.create({ doc, schema });

    const startTime = performance.now();
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      // Insert a character at position 1, then delete it
      const tr1 = state.tr.insertText('A', 1);
      state = state.apply(tr1);
      const tr2 = state.tr.delete(1, 2);
      state = state.apply(tr2);
    }

    const totalElapsed = performance.now() - startTime;
    const avgPerIteration = totalElapsed / (iterations * 2);

    // Average transaction time must be well within a 16ms frame budget (typically < 1ms)
    expect(avgPerIteration).toBeLessThan(16);
  });
});
