import { Node as PMNode } from 'prosemirror-model';
import {
  MarkdownParser,
  MarkdownSerializer,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
} from 'prosemirror-markdown';
import MarkdownIt from 'markdown-it';
import { schema } from '../schema';

// Extend serializer with callouts, task lists, and tables
export const inkMarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    callout(state, node) {
      const type = (node.attrs['type'] || 'info').toUpperCase();
      state.write(`> [!${type}]\n`);
      state.wrapBlock('> ', null, node, () => state.renderContent(node));
    },
    task_list(state, node) {
      state.renderList(node, '  ', () => '- ');
    },
    task_item(state, node) {
      const box = node.attrs['checked'] ? '[x] ' : '[ ] ';
      state.write(box);
      state.renderContent(node);
    },
    table(state, node) {
      let isFirstRow = true;
      node.forEach((row) => {
        state.write('|');
        row.forEach((cell) => {
          state.write(' ');
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
    code_block(state, node) {
      state.write('```' + (node.attrs['language'] || '') + '\n');
      state.text(node.textContent, false);
      state.ensureNewLine();
      state.write('```');
      state.closeBlock(node);
    },
  },
  {
    ...defaultMarkdownSerializer.marks,
    strikethrough: {
      open: '~~',
      close: '~~',
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    underline: {
      open: '<u>',
      close: '</u>',
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    subscript: {
      open: '~',
      close: '~',
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    superscript: {
      open: '^',
      close: '^',
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    small: {
      open: '<small>',
      close: '</small>',
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    textColor: {
      open(_state, mark) {
        return `<span style="color: ${mark.attrs['color']}">`;
      },
      close: '</span>',
      mixable: true,
      expelEnclosingWhitespace: true,
    },
  },
);

const tokenizer = MarkdownIt({ html: false });
tokenizer.core.ruler.push('task_list', (state: any) => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'bullet_list_open') {
      let isTask = false;
      let depth = 1;
      for (let j = i + 1; j < tokens.length && depth > 0; j++) {
        if (tokens[j].type === 'bullet_list_open') depth++;
        if (tokens[j].type === 'bullet_list_close') depth--;
        if (depth === 1 && tokens[j].type === 'inline' && /^\[([ xX]?)\]\s*/.test(tokens[j].content)) {
          isTask = true;
          break;
        }
      }
      if (isTask) {
        tokens[i].type = 'task_list_open';
        let j = i + 1;
        depth = 1;
        while (j < tokens.length && depth > 0) {
          if (tokens[j].type === 'bullet_list_open' || tokens[j].type === 'task_list_open') depth++;
          if (tokens[j].type === 'bullet_list_close') {
            depth--;
            if (depth === 0) {
              tokens[j].type = 'task_list_close';
              break;
            }
          }
          if (depth === 1) {
            if (tokens[j].type === 'list_item_open') tokens[j].type = 'task_item_open';
            if (tokens[j].type === 'list_item_close') tokens[j].type = 'task_item_close';
            if (tokens[j].type === 'inline') {
              const m = tokens[j].content.match(/^\[([ xX]?)\]\s*/);
              if (m) {
                for (let k = j - 1; k >= i; k--) {
                  if (tokens[k].type === 'task_item_open') {
                    tokens[k].attrSet('checked', String(m[1].toLowerCase() === 'x'));
                    break;
                  }
                }
                tokens[j].content = tokens[j].content.slice(m[0].length);
                if (tokens[j].children && tokens[j].children[0]) {
                  tokens[j].children[0].content = tokens[j].children[0].content.slice(m[0].length);
                }
              }
            }
          }
          j++;
        }
      }
    }
  }
});

export const inkMarkdownParser = new MarkdownParser(
  schema,
  tokenizer,
  {
    ...defaultMarkdownParser.tokens,
    s: { mark: 'strikethrough' },
    task_list: { block: 'task_list' },
    task_item: {
      block: 'task_item',
      getAttrs: (tok: any) => ({
        checked: tok.attrGet('checked') === 'true',
      }),
    },
    fence: {
      block: 'code_block',
      getAttrs: (tok: any) => ({
        language: tok.info ? tok.info.trim().toLowerCase() : 'typescript',
      }),
    },
    code_block: {
      block: 'code_block',
      getAttrs: (tok: any) => ({
        language: tok.info ? tok.info.trim().toLowerCase() : 'typescript',
      }),
    },
  },
);

export function docToMarkdown(doc: PMNode): string {
  return inkMarkdownSerializer.serialize(doc);
}

export function markdownToDoc(markdown: string): PMNode {
  return inkMarkdownParser.parse(markdown);
}
