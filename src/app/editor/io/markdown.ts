import { Node as PMNode } from 'prosemirror-model';
import {
  MarkdownParser,
  MarkdownSerializer,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
} from 'prosemirror-markdown';
import { schema } from '../core/schema';

// Extend serializer with callouts and tables
export const inkMarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    callout(state, node) {
      const type = (node.attrs['type'] || 'info').toUpperCase();
      state.write(`> [!${type}]\n`);
      state.wrapBlock('> ', null, node, () => state.renderContent(node));
    },
    table(state, node) {
      let isFirstRow = true;
      node.forEach((row) => {
        state.write('|');
        row.forEach((cell) => {
          state.write(' ');
          // Table cells can contain paragraphs - extract text or render inline
          let cellText = '';
          cell.forEach((child) => {
            cellText += child.textContent;
          });
          state.write(cellText.trim().replace(/\|/g, '\\|') || ' ');
          state.write(' |');
        });
        state.write('\n');

        if (isFirstRow) {
          state.write('|');
          row.forEach(() => {
            state.write(' --- |');
          });
          state.write('\n');
          isFirstRow = false;
        }
      });
      state.closeBlock(node);
    },
    table_row(state, node) {
      state.renderContent(node);
    },
    table_cell(state, node) {
      state.renderContent(node);
    },
    table_header(state, node) {
      state.renderContent(node);
    },
  },
  {
    ...defaultMarkdownSerializer.marks,
  },
);

export const inkMarkdownParser = new MarkdownParser(
  schema,
  defaultMarkdownParser.tokenizer,
  {
    ...defaultMarkdownParser.tokens,
  },
);

export function docToMarkdown(doc: PMNode): string {
  return inkMarkdownSerializer.serialize(doc);
}

export function markdownToDoc(markdown: string): PMNode {
  return inkMarkdownParser.parse(markdown);
}
