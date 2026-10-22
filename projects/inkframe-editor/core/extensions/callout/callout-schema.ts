import { NodeSpec } from 'prosemirror-model';

export type CalloutKind = 'info' | 'note' | 'warning' | 'success' | 'danger';
/** In the order a click on the callout's icon cycles through them. */
export const CALLOUT_KINDS: CalloutKind[] = ['info', 'note', 'warning', 'success', 'danger'];

export const callout: NodeSpec = {
  group: 'block',
  content: 'block+',
  defining: true,
  attrs: { type: { default: 'info' } },
  parseDOM: [
    {
      tag: 'div[data-callout]',
      getAttrs: (d) => {
        const kind = (d as HTMLElement).dataset['callout'] as CalloutKind;
        return { type: CALLOUT_KINDS.includes(kind) ? kind : 'info' };
      },
      contentElement: '.callout-body',
    },
  ],
  toDOM: (n) => [
    'div',
    {
      'data-callout': n.attrs['type'],
      class: `callout callout-${n.attrs['type']}`,
    },
    ['div', { class: 'callout-body' }, 0],
  ],
};
