import { NodeSpec } from 'prosemirror-model';

export const code_block: NodeSpec = {
  content: 'text*',
  marks: '',
  group: 'block',
  code: true,
  defining: true,
  attrs: {
    language: { default: 'typescript' },
    wrap: { default: false },
  },
  parseDOM: [
    {
      tag: 'pre',
      preserveWhitespace: 'full',
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        const codeEl = el.querySelector('code');
        const langClass = el.className || codeEl?.className || '';
        const match = /language-([a-z0-9_-]+)/i.exec(langClass);
        const language = match ? match[1].toLowerCase() : el.dataset['language'] || 'typescript';
        const wrap = el.dataset['wrap'] === 'true' || el.style.whiteSpace === 'pre-wrap';
        return { language, wrap };
      },
    },
  ],
  toDOM: (node) => [
    'pre',
    {
      class: `ink-code-block language-${node.attrs['language'] || 'typescript'}${node.attrs['wrap'] ? ' wrap' : ''}`,
      'data-language': node.attrs['language'] || 'typescript',
      'data-wrap': String(node.attrs['wrap'] ?? false),
    },
    ['code', { class: `language-${node.attrs['language'] || 'typescript'}` }, 0],
  ],
};
