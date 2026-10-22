import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema } from '../../schema/schema';
import { clearFormattingCommand } from './clear-formatting-commands';

describe('clearFormattingCommand', () => {
  it('clearFormattingCommand clears all marks from selection', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('Heavily styled', [
          schema.marks['strong'].create(),
          schema.marks['em'].create(),
          schema.marks['underline'].create(),
          schema.marks['textColor'].create({ color: '#ff0000' }),
        ]),
      ]),
    ]);

    let state = EditorState.create({
      schema,
      doc,
    });

    // Select "Heavily styled" (pos 1 to 15)
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 15)));

    let dispatchedState: EditorState | null = null;
    const success = clearFormattingCommand(state, (tr) => {
      dispatchedState = state.apply(tr);
    });

    expect(success).toBe(true);
    expect(dispatchedState).toBeTruthy();
    // Ensure no marks remain on node
    const firstChild = dispatchedState!.doc.firstChild?.firstChild;
    expect(firstChild?.marks.length).toBe(0);
  });

  it('removes all inline marks from the active selection range', () => {
    const boldMark = schema.marks['strong'].create();
    const italicMark = schema.marks['em'].create();
    const underlineMark = schema.marks['underline'].create();
    const textNode = schema.text('Formatted text', [boldMark, italicMark, underlineMark]);
    const p = schema.nodes['paragraph'].create(null, [textNode]);
    const doc = schema.node('doc', null, [p]);

    let state = EditorState.create({
      doc,
      schema,
      selection: TextSelection.create(doc, 1, 15),
    });

    expect(state.doc.firstChild?.firstChild?.marks.length).toBe(3);

    const commandExecuted = clearFormattingCommand(state, (tr) => {
      state = state.apply(tr);
    });

    expect(commandExecuted).toBe(true);
    expect(state.doc.firstChild?.firstChild?.marks.length).toBe(0);
    expect(state.doc.firstChild?.firstChild?.text).toBe('Formatted text');
  });
});
