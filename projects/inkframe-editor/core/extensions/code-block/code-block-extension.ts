import { textblockTypeInputRule } from 'prosemirror-inputrules';
import { createExtension } from '../../editor/extension-types';
import { code_block } from './code-block-schema';
import { highlightPlugin } from './highlight.plugin';
import { CodeBlockNodeView } from './code-block.node-view';

export const CodeBlockExtension = createExtension({
  name: 'code_block',
  nodes: { code_block },
  inputRules: (ctx) => [
    textblockTypeInputRule(/^`{3}([a-z0-9_-]+)?\s$/, ctx.schema.nodes['code_block'], (m) => ({
      language: m[1]?.toLowerCase() || 'typescript',
    })),
  ],
  plugins: () => [highlightPlugin()],
  nodeViews: () => ({
    code_block: (node, view, getPos) => new CodeBlockNodeView(node, view, getPos),
  }),
  slashItems: [
    {
      id: 'cb',
      label: 'Code block',
      hint: 'Monospace block with syntax highlighting',
      icon: 'code',
      keywords: ['code', 'pre', 'typescript', 'block'],
      run: (s) => s.codeBlock(),
    },
  ],
});
