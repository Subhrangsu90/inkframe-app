import { Node as PMNode } from 'prosemirror-model';
import {
  MarkdownParser,
  MarkdownSerializer,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
} from 'prosemirror-markdown';
import MarkdownIt from 'markdown-it';
import {
  CalloutKind,
  DEFAULT_HIGHLIGHT_COLOR,
  sanitizeHighlightColor,
  sanitizeTextAlign,
  schema,
} from '../schema';
import { sanitizeCssColor } from '../link-utils';

const ALIGN_MARKER: Record<string, string> = {
  left: ':---',
  center: ':---:',
  right: '---:',
};

type NodeSerializer = (typeof defaultMarkdownSerializer.nodes)[string];

/**
 * Markdown has no alignment, so aligned paragraphs and headings are wrapped
 * in `<div align="…">` with blank lines around the content. GitHub and most
 * renderers that allow HTML show them aligned, the Markdown inside is still
 * parsed, and markdownToDoc() reads the wrapper back.
 */
function keepingAlignment(serialize: NodeSerializer): NodeSerializer {
  return (state, node, parent, index) => {
    const align = sanitizeTextAlign(node.attrs['align']);
    if (!align) return serialize(state, node, parent, index);
    state.write(`<div align="${align}">`);
    state.closeBlock(node);
    serialize(state, node, parent, index);
    state.write('</div>');
    state.closeBlock(node);
  };
}

// Extend serializer with callouts, task lists, and tables
export const inkMarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    paragraph: keepingAlignment(defaultMarkdownSerializer.nodes['paragraph']),
    heading: keepingAlignment(defaultMarkdownSerializer.nodes['heading']),
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
          const cellText = cell.textContent.replace(/\s*\n\s*/g, ' ').trim();
          state.write(cellText.replace(/\|/g, '\\|') || ' ');
          state.write(' |');
        });
        state.write('\n');

        if (isFirstRow) {
          state.write('|');
          row.forEach((cell) => {
            state.write(` ${ALIGN_MARKER[cell.attrs['alignment']] ?? '---'} |`);
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
    // HTML tags rather than pandoc's ~x~ / ^x^, which cannot contain spaces.
    subscript: {
      open: '<sub>',
      close: '</sub>',
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    superscript: {
      open: '<sup>',
      close: '</sup>',
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
        const color = sanitizeCssColor(mark.attrs['color']);
        return color ? `<span style="color: ${color}">` : '';
      },
      close(_state, mark) {
        return sanitizeCssColor(mark.attrs['color']) ? '</span>' : '';
      },
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    // `==text==` is not standard Markdown; <mark> renders wherever HTML is allowed.
    highlight: {
      open(_state, mark) {
        const color = sanitizeHighlightColor(mark.attrs['color']) ?? DEFAULT_HIGHLIGHT_COLOR;
        return `<mark style="background-color: ${color}">`;
      },
      close: '</mark>',
      mixable: true,
      expelEnclosingWhitespace: true,
    },
  },
);

// ── Tokenizer extensions ──────────────────────────────────────────
// Raw HTML stays disabled; only the exact tags the serializer emits are
// recognised, so everything we export can be imported again.

const tokenizer = MarkdownIt({ html: false });

/** Inline tags written by the serializer, mapped to markdown-it token names. */
const INLINE_TAGS: Record<string, string> = {
  u: 'ink_underline',
  small: 'ink_small',
  sub: 'ink_sub',
  sup: 'ink_sup',
  span: 'ink_color',
  mark: 'ink_highlight',
};

tokenizer.inline.ruler.before('emphasis', 'ink_inline_tags', (state: any, silent: boolean) => {
  if (state.src.charCodeAt(state.pos) !== 0x3c /* < */) return false;
  const rest: string = state.src.slice(state.pos, state.posMax);
  const open = state.inkOpenTags ?? (state.inkOpenTags = {} as Record<string, number>);

  const close = /^<\/(u|small|sub|sup|span|mark)>/.exec(rest);
  if (close) {
    const tag = close[1];
    if (!open[tag]) return false; // stray closing tag: keep as text
    if (!silent) {
      open[tag]--;
      state.push(`${INLINE_TAGS[tag]}_close`, tag, -1);
    }
    state.pos += close[0].length;
    return true;
  }

  let tag: string;
  let color: string | null = null;
  const simple = /^<(u|small|sub|sup)>/.exec(rest);
  const span = /^<span style="color:\s*([^";]+);?\s*">/.exec(rest);
  const mark = /^<mark(?: style="background-color:\s*([^";]+);?\s*")?>/.exec(rest);
  if (simple) {
    tag = simple[1];
  } else if (span) {
    tag = 'span';
    color = sanitizeCssColor(span[1]);
    if (!color) return false;
  } else if (mark) {
    tag = 'mark';
    color = mark[1] === undefined ? null : sanitizeHighlightColor(mark[1]);
    if (mark[1] !== undefined && !color) return false;
  } else {
    return false;
  }
  const length = (simple ?? span ?? mark)![0].length;
  // Only treat it as a mark when the matching closing tag follows.
  if (!rest.slice(length).includes(`</${tag}>`)) return false;
  if (!silent) {
    open[tag] = (open[tag] ?? 0) + 1;
    const token = state.push(`${INLINE_TAGS[tag]}_open`, tag, 1);
    if (color) token.attrSet('color', color);
  }
  state.pos += length;
  return true;
});

/** Pandoc-style ~sub~ and ^sup^ (no whitespace inside; `~~` stays strikethrough). */
function scriptRule(marker: number, name: string) {
  return (state: any, silent: boolean) => {
    const start = state.pos;
    const max = state.posMax;
    if (silent || state.src.charCodeAt(start) !== marker) return false;
    if (start + 2 >= max || state.src.charCodeAt(start + 1) === marker) return false;
    const end = state.src.indexOf(String.fromCharCode(marker), start + 1);
    if (end < 0 || end >= max) return false;
    const content = state.src.slice(start + 1, end);
    if (!content || /\s/.test(content)) return false;

    state.posMax = end;
    state.pos = start + 1;
    state.push(`${name}_open`, name, 1);
    state.md.inline.tokenize(state);
    state.push(`${name}_close`, name, -1);
    state.pos = end + 1;
    state.posMax = max;
    return true;
  };
}
tokenizer.inline.ruler.after('emphasis', 'ink_sub', scriptRule(0x7e /* ~ */, 'ink_sub'));
tokenizer.inline.ruler.after('emphasis', 'ink_sup', scriptRule(0x5e /* ^ */, 'ink_sup'));

/** `==highlight==` (Obsidian, Typora and others): no whitespace just inside the markers. */
tokenizer.inline.ruler.before('emphasis', 'ink_highlight', (state: any, silent: boolean) => {
  const start = state.pos;
  const max = state.posMax;
  if (silent || state.src.charCodeAt(start) !== 0x3d || state.src.charCodeAt(start + 1) !== 0x3d) {
    return false;
  }
  const end = state.src.indexOf('==', start + 2);
  if (end < 0 || end + 2 > max) return false;
  const content = state.src.slice(start + 2, end);
  if (!content || /^[\s=]|\s$/.test(content)) return false;

  state.posMax = end;
  state.pos = start + 2;
  state.push('ink_highlight_open', 'mark', 1);
  state.md.inline.tokenize(state);
  state.push('ink_highlight_close', 'mark', -1);
  state.pos = end + 2;
  state.posMax = max;
  return true;
});

tokenizer.core.ruler.push('task_list', (state: any) => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'bullet_list_open') {
      let isTask = false;
      let depth = 1;
      for (let j = i + 1; j < tokens.length && depth > 0; j++) {
        if (tokens[j].type === 'bullet_list_open') depth++;
        if (tokens[j].type === 'bullet_list_close') depth--;
        if (
          depth === 1 &&
          tokens[j].type === 'inline' &&
          /^\[([ xX]?)\]\s*/.test(tokens[j].content)
        ) {
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

/**
 * GFM tables → table / table_row / table_header / table_cell tokens. Cells in
 * the schema hold blocks, so each cell's inline content gets a paragraph.
 */
tokenizer.core.ruler.push('ink_tables', (state: any) => {
  const out: any[] = [];
  for (const tok of state.tokens) {
    switch (tok.type) {
      case 'thead_open':
      case 'thead_close':
      case 'tbody_open':
      case 'tbody_close':
        break;
      case 'tr_open':
      case 'tr_close':
        tok.type = tok.type === 'tr_open' ? 'table_row_open' : 'table_row_close';
        out.push(tok);
        break;
      case 'th_open':
      case 'td_open': {
        const align = /text-align:\s*(left|center|right)/.exec(tok.attrGet('style') ?? '');
        tok.type = tok.type === 'th_open' ? 'table_header_open' : 'table_cell_open';
        tok.attrs = align ? [['alignment', align[1]]] : null;
        out.push(tok, new state.Token('paragraph_open', 'p', 1));
        break;
      }
      case 'th_close':
      case 'td_close':
        out.push(new state.Token('paragraph_close', 'p', -1));
        tok.type = tok.type === 'th_close' ? 'table_header_close' : 'table_cell_close';
        out.push(tok);
        break;
      default:
        out.push(tok);
    }
  }
  state.tokens = out;
});

const CALLOUT_ALIASES: Record<string, CalloutKind> = {
  info: 'info',
  note: 'info',
  important: 'info',
  warning: 'warning',
  success: 'success',
  tip: 'success',
  danger: 'danger',
  caution: 'danger',
};

/** `> [!WARNING]` blockquotes (our export format and GitHub alerts) → callouts. */
tokenizer.core.ruler.push('ink_callouts', (state: any) => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i];
    const inline = tokens[i + 2];
    if (
      open.type !== 'blockquote_open' ||
      tokens[i + 1]?.type !== 'paragraph_open' ||
      inline?.type !== 'inline'
    ) {
      continue;
    }
    const m = /^\[!([a-z]+)\][ \t]*(?:\n|$)/i.exec(inline.content);
    const kind = m && CALLOUT_ALIASES[m[1].toLowerCase()];
    if (!m || !kind) continue;

    const close = tokens.findIndex(
      (t: any, j: number) => j > i && t.type === 'blockquote_close' && t.level === open.level,
    );
    if (close < 0) continue;
    open.type = 'callout_open';
    open.attrs = [['kind', kind]];
    tokens[close].type = 'callout_close';

    // Strip the marker (and the line break after it) from the first paragraph.
    inline.content = inline.content.slice(m[0].length);
    const children: any[] = inline.children ?? [];
    let toStrip = `[!${m[1]}]`.length;
    while (toStrip > 0 && children[0]?.type === 'text') {
      const text: string = children[0].content;
      if (text.length <= toStrip) {
        toStrip -= text.length;
        children.shift();
      } else {
        children[0].content = text.slice(toStrip);
        toStrip = 0;
      }
    }
    if (children[0]?.type === 'text')
      children[0].content = children[0].content.replace(/^[ \t]+/, '');
    if (children[0]?.type === 'text' && !children[0].content) children.shift();
    if (children[0]?.type === 'softbreak' || children[0]?.type === 'hardbreak') children.shift();
    if (!inline.content.trim() && children.length === 0) {
      tokens.splice(i + 1, 3); // drop the now-empty paragraph
    }
  }
});

const ALIGN_OPEN = /^<div align="(left|center|right|justify)">$/;
const ALIGN_CLOSE = /^<\/div>$/;

/**
 * Reads the `<div align="…">` wrappers written by the serializer. With raw
 * HTML disabled each wrapper line arrives as a paragraph of its own; the
 * paragraphs and headings between a matching pair (in the same parent block)
 * get the alignment, and the wrapper paragraphs are dropped.
 */
tokenizer.core.ruler.push('ink_alignment', (state: any) => {
  const tokens = state.tokens;
  const wrapperAt = (i: number, re: RegExp) =>
    tokens[i]?.type === 'paragraph_open' &&
    tokens[i + 1]?.type === 'inline' &&
    tokens[i + 2]?.type === 'paragraph_close' &&
    re.exec(tokens[i + 1].content.trim());

  for (let i = 0; i < tokens.length; i++) {
    const open = wrapperAt(i, ALIGN_OPEN);
    if (!open) continue;
    const level = tokens[i].level;
    let close = -1;
    for (let j = i + 3; j < tokens.length && tokens[j].level >= level; j++) {
      if (tokens[j].level === level && wrapperAt(j, ALIGN_CLOSE)) {
        close = j;
        break;
      }
    }
    if (close < 0) continue; // a lone line of text that happens to look like the wrapper
    for (let j = i + 3; j < close; j++) {
      const t = tokens[j];
      if (t.level === level && (t.type === 'paragraph_open' || t.type === 'heading_open')) {
        t.attrSet('align', open[1]);
      }
    }
    tokens.splice(close, 3);
    tokens.splice(i, 3);
    i--;
  }
});

const alignAttr = (tok: any) => sanitizeTextAlign(tok.attrGet('align'));

export const inkMarkdownParser = new MarkdownParser(schema, tokenizer, {
  ...defaultMarkdownParser.tokens,
  paragraph: { block: 'paragraph', getAttrs: (tok: any) => ({ align: alignAttr(tok) }) },
  heading: {
    block: 'heading',
    getAttrs: (tok: any) => ({ level: +tok.tag.slice(1), align: alignAttr(tok) }),
  },
  ink_highlight: {
    mark: 'highlight',
    getAttrs: (tok: any) => {
      const color = tok.attrGet('color');
      return color ? { color } : {};
    },
  },
  s: { mark: 'strikethrough' },
  ink_underline: { mark: 'underline' },
  ink_small: { mark: 'small' },
  ink_sub: { mark: 'subscript' },
  ink_sup: { mark: 'superscript' },
  ink_color: {
    mark: 'textColor',
    getAttrs: (tok: any) => ({ color: tok.attrGet('color') }),
  },
  table: { block: 'table' },
  table_row: { block: 'table_row' },
  table_header: {
    block: 'table_header',
    getAttrs: (tok: any) => ({ alignment: tok.attrGet('alignment') }),
  },
  table_cell: {
    block: 'table_cell',
    getAttrs: (tok: any) => ({ alignment: tok.attrGet('alignment') }),
  },
  callout: {
    block: 'callout',
    getAttrs: (tok: any) => ({ type: tok.attrGet('kind') }),
  },
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
});

export function docToMarkdown(doc: PMNode): string {
  return inkMarkdownSerializer.serialize(doc);
}

export function markdownToDoc(markdown: string): PMNode {
  return inkMarkdownParser.parse(markdown);
}
