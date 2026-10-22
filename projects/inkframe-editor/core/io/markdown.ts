import { Node as PMNode } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import {
  MarkdownParser,
  MarkdownSerializer,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
} from 'prosemirror-markdown';
import MarkdownIt from 'markdown-it';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';
import type Token from 'markdown-it/lib/token.mjs';
import { schema } from '../schema/schema';
import {
  DEFAULT_HIGHLIGHT_COLOR,
  sanitizeHighlightColor,
} from '../extensions/highlight/highlight-schema';
import { sanitizeCssColor } from '../schema/sanitize-css';
import { CalloutKind } from '../extensions/callout/callout-schema';
import { sanitizeTextAlign } from '../extensions/text-align/text-align-schema';
import {
  INDENT_STEP_REM,
  blockFormatCss,
  lineSpacingForHeight,
  sanitizeIndent,
  sanitizeLineSpacing,
} from '../extensions/paragraph-format/paragraph-format-schema';
import { sanitizeFontSize } from '../extensions/font-size/font-size-schema';
import {
  findFontFamily,
  fontFamilyForStack,
  sanitizeFontFamily,
} from '../extensions/font-family/font-family-schema';
import { sanitizeListStart } from '../extensions/lists/list-schema';
import { isListNode } from '../extensions/lists/list-commands';

const ALIGN_MARKER: Record<string, string> = {
  left: ':---',
  center: ':---:',
  right: '---:',
};

type NodeSerializer = (typeof defaultMarkdownSerializer.nodes)[string];

/**
 * The `<div>` that carries a paragraph's or heading's formatting in
 * Markdown, for example `<div align="center" style="margin-left: 3rem">`;
 * null when it has none. Alignment stays the `align` attribute (which GitHub
 * shows); indent and line spacing are a style.
 */
function formatWrapper(node: PMNode): string | null {
  const align = sanitizeTextAlign(node.attrs['align']);
  const style = blockFormatCss({
    indent: node.attrs['indent'],
    lineSpacing: node.attrs['lineSpacing'],
  });
  if (!align && !style) return null;
  return `<div${align ? ` align="${align}"` : ''}${style ? ` style="${style}"` : ''}>`;
}

/**
 * Markdown has no alignment, indent or line spacing, so formatted
 * paragraphs and headings are wrapped in a `<div>` (see formatWrapper) with
 * blank lines around the content. Renderers that allow HTML show the
 * formatting, the Markdown inside is still parsed, and markdownToDoc() reads
 * the wrapper back.
 */
function keepingFormat(serialize: NodeSerializer): NodeSerializer {
  return (state, node, parent, index) => {
    const wrapper = formatWrapper(node);
    if (!wrapper) return serialize(state, node, parent, index);
    state.write(wrapper);
    state.closeBlock(node);
    serialize(state, node, parent, index);
    state.write('</div>');
    state.closeBlock(node);
  };
}

/**
 * Whether a list can be written tight (no blank line between items): every
 * item is one unformatted line of text plus nested lists. A second
 * paragraph, or the blank lines around a format wrapper, need a loose list.
 */
function canBeTight(list: PMNode): boolean {
  let tight = true;
  list.forEach((item) =>
    item.forEach((child, _, i) => {
      if (i > 0 ? !isListNode(child) : !!formatWrapper(child)) tight = false;
    }),
  );
  return tight;
}

/**
 * Lists are written tight unless they were imported loose (`tight: false`)
 * or cannot be written tight.
 */
function withTightness(list: PMNode): PMNode {
  const tight = list.attrs['tight'] !== false && canBeTight(list);
  return tight === list.attrs['tight']
    ? list
    : list.type.create({ ...list.attrs, tight }, list.content);
}

/** How a page break is written in Markdown, and the only form that reads back as one. */
const PAGE_BREAK_HTML = '<div class="ink-page-break"></div>';

// Extend serializer with callouts, task lists, and tables
export const inkMarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    paragraph: keepingFormat(defaultMarkdownSerializer.nodes['paragraph']),
    heading: keepingFormat(defaultMarkdownSerializer.nodes['heading']),
    callout(state, node) {
      const type = (node.attrs['type'] || 'info').toUpperCase();
      state.write(`> [!${type}]\n`);
      state.wrapBlock('> ', null, node, () => state.renderContent(node));
    },
    // `*` for bullets and `-` for tasks: a different marker starts a new list,
    // so a bullet list right before a task list stays a separate list.
    bullet_list(state, node) {
      state.renderList(withTightness(node), '  ', () => '* ');
    },
    ordered_list(state, node) {
      const list = withTightness(node);
      const start = sanitizeListStart(list.attrs['order']);
      const width = String(start + list.childCount - 1).length;
      state.renderList(list, state.repeat(' ', width + 2), (i) => {
        const number = String(start + i);
        return `${state.repeat(' ', width - number.length)}${number}. `;
      });
    },
    task_list(state, node) {
      state.renderList(withTightness(node), '  ', () => '- ');
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
    // Markdown has no page breaks; this HTML line breaks pages wherever HTML is printed.
    page_break(state, node) {
      state.write(PAGE_BREAK_HTML);
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
    fontSize: {
      open(_state, mark) {
        const size = sanitizeFontSize(mark.attrs['size']);
        return size ? `<span style="font-size: ${size}px">` : '';
      },
      close(_state, mark) {
        return sanitizeFontSize(mark.attrs['size']) ? '</span>' : '';
      },
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    fontFamily: {
      open(_state, mark) {
        const font = findFontFamily(mark.attrs['font']);
        return font ? `<span style="font-family: ${font.stack}">` : '';
      },
      close(_state, mark) {
        return findFontFamily(mark.attrs['font']) ? '</span>' : '';
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

/**
 * Inline tags written by the serializer, mapped to markdown-it token names.
 * A `<span>` is a text color, a font size or a font, depending on its style.
 */
const INLINE_TAGS: Record<string, string> = {
  u: 'ink_underline',
  small: 'ink_small',
  sub: 'ink_sub',
  sup: 'ink_sup',
  mark: 'ink_highlight',
};

/**
 * The tags open in an inline run, innermost last, so stray closing tags
 * stay text and each `</span>` closes the mark its `<span>` opened.
 */
const openTags = new WeakMap<StateInline, { tag: string; token: string }[]>();

tokenizer.inline.ruler.before('emphasis', 'ink_inline_tags', (state, silent) => {
  if (state.src.charCodeAt(state.pos) !== 0x3c /* < */) return false;
  const rest = state.src.slice(state.pos, state.posMax);
  let open = openTags.get(state);
  if (!open) openTags.set(state, (open = []));

  const close = /^<\/(u|small|sub|sup|span|mark)>/.exec(rest);
  if (close) {
    const tag = close[1];
    const index = open.map((o) => o.tag).lastIndexOf(tag);
    if (index < 0) return false; // stray closing tag: keep as text
    if (!silent) {
      const [{ token }] = open.splice(index, 1);
      state.push(`${token}_close`, tag, -1);
    }
    state.pos += close[0].length;
    return true;
  }

  let tag: string;
  let token: string;
  const attrs: [string, string][] = [];
  const simple = /^<(u|small|sub|sup)>/.exec(rest);
  const color = /^<span style="color:\s*([^";]+);?\s*">/.exec(rest);
  const size = /^<span style="font-size:\s*(\d+)px;?\s*">/.exec(rest);
  const family = /^<span style="font-family:\s*([^";]+?);?\s*">/.exec(rest);
  const mark = /^<mark(?: style="background-color:\s*([^";]+);?\s*")?>/.exec(rest);
  if (simple) {
    tag = simple[1];
    token = INLINE_TAGS[tag];
  } else if (color) {
    const value = sanitizeCssColor(color[1]);
    if (!value) return false;
    tag = 'span';
    token = 'ink_color';
    attrs.push(['color', value]);
  } else if (size) {
    const value = sanitizeFontSize(size[1]);
    if (!value) return false;
    tag = 'span';
    token = 'ink_font_size';
    attrs.push(['size', String(value)]);
  } else if (family) {
    const value = fontFamilyForStack(family[1]);
    if (!value) return false;
    tag = 'span';
    token = 'ink_font_family';
    attrs.push(['font', value]);
  } else if (mark) {
    const value = mark[1] === undefined ? null : sanitizeHighlightColor(mark[1]);
    if (mark[1] !== undefined && !value) return false;
    tag = 'mark';
    token = INLINE_TAGS[tag];
    if (value) attrs.push(['color', value]);
  } else {
    return false;
  }
  const length = (simple ?? color ?? size ?? family ?? mark)![0].length;
  // Only treat it as a mark when the matching closing tag follows.
  if (!rest.slice(length).includes(`</${tag}>`)) return false;
  if (!silent) {
    open.push({ tag, token });
    const opened = state.push(`${token}_open`, tag, 1);
    for (const [name, value] of attrs) opened.attrSet(name, value);
  }
  state.pos += length;
  return true;
});

/** Pandoc-style ~sub~ and ^sup^ (no whitespace inside; `~~` stays strikethrough). */
function scriptRule(marker: number, name: string) {
  return (state: StateInline, silent: boolean) => {
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
tokenizer.inline.ruler.before('emphasis', 'ink_highlight', (state, silent) => {
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

tokenizer.core.ruler.push('task_list', (state) => {
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
                const firstChild = tokens[j].children?.[0];
                if (firstChild) firstChild.content = firstChild.content.slice(m[0].length);
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
tokenizer.core.ruler.push('ink_tables', (state: StateCore) => {
  const out: Token[] = [];
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
  note: 'note',
  important: 'info',
  warning: 'warning',
  success: 'success',
  tip: 'success',
  danger: 'danger',
  caution: 'danger',
};

/** `> [!WARNING]` blockquotes (our export format and GitHub alerts) → callouts. */
tokenizer.core.ruler.push('ink_callouts', (state) => {
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
      (t, j) => j > i && t.type === 'blockquote_close' && t.level === open.level,
    );
    if (close < 0) continue;
    open.type = 'callout_open';
    open.attrs = [['kind', kind]];
    tokens[close].type = 'callout_close';

    // Strip the marker (and the line break after it) from the first paragraph.
    inline.content = inline.content.slice(m[0].length);
    const children = inline.children ?? [];
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

const FORMAT_OPEN = /^<div(?: align="(left|center|right|justify)")?(?: style="([^"]+)")?>$/;
const FORMAT_CLOSE = /^<\/div>$/;

/**
 * The formatting a wrapper line written by formatWrapper() stands for, or
 * null when the line is not one: any other style makes it plain text.
 */
function readFormatWrapper(line: string): Record<string, string> | null {
  const m = FORMAT_OPEN.exec(line);
  if (!m || (!m[1] && !m[2])) return null;
  const format: Record<string, string> = {};
  if (m[1]) format['align'] = m[1];
  for (const declaration of m[2]?.split(';') ?? []) {
    const [prop, value = ''] = declaration.split(':').map((part) => part.trim());
    if (!prop) continue;
    if (prop === 'margin-left') {
      const rem = /^(\d+(?:\.\d+)?)rem$/.exec(value);
      const indent = rem && sanitizeIndent(Number(rem[1]) / INDENT_STEP_REM);
      if (!indent) return null;
      format['indent'] = String(indent);
    } else if (prop === 'line-height') {
      const spacing = lineSpacingForHeight(value);
      if (!spacing) return null;
      format['lineSpacing'] = String(spacing);
    } else {
      return null;
    }
  }
  return format;
}

/**
 * Reads the `<div>` wrappers written by the serializer (see formatWrapper).
 * With raw HTML disabled each wrapper line arrives as a paragraph of its
 * own; the paragraphs and headings between a matching pair (in the same
 * parent block) get the formatting, and the wrapper paragraphs are dropped.
 */
tokenizer.core.ruler.push('ink_block_format', (state) => {
  const tokens = state.tokens;
  const wrapperLine = (i: number) =>
    tokens[i]?.type === 'paragraph_open' &&
    tokens[i + 1]?.type === 'inline' &&
    tokens[i + 2]?.type === 'paragraph_close'
      ? tokens[i + 1].content.trim()
      : null;

  for (let i = 0; i < tokens.length; i++) {
    const line = wrapperLine(i);
    const format = line ? readFormatWrapper(line) : null;
    if (!format) continue;
    const level = tokens[i].level;
    let close = -1;
    for (let j = i + 3; j < tokens.length && tokens[j].level >= level; j++) {
      if (tokens[j].level === level && FORMAT_CLOSE.test(wrapperLine(j) ?? '')) {
        close = j;
        break;
      }
    }
    if (close < 0) continue; // a lone line of text that happens to look like the wrapper
    for (let j = i + 3; j < close; j++) {
      const t = tokens[j];
      if (t.level === level && (t.type === 'paragraph_open' || t.type === 'heading_open')) {
        for (const [name, value] of Object.entries(format)) t.attrSet(name, value);
      }
    }
    tokens.splice(close, 3);
    tokens.splice(i, 3);
    i--;
  }
});

/**
 * Reads the page breaks written by the serializer. With raw HTML disabled the
 * line arrives as a paragraph of its own; at the top level it becomes a page
 * break (elsewhere it stays text: page breaks are top-level blocks).
 */
tokenizer.core.ruler.push('ink_page_break', (state) => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    if (
      tokens[i].type === 'paragraph_open' &&
      tokens[i].level === 0 &&
      tokens[i + 1]?.type === 'inline' &&
      tokens[i + 1].content.trim() === PAGE_BREAK_HTML &&
      tokens[i + 2]?.type === 'paragraph_close'
    ) {
      const token = new state.Token('ink_page_break', 'div', 0);
      token.block = true;
      tokens.splice(i, 3, token);
    }
  }
});

/** A paragraph's or heading's formatting, from its wrapper (see the ink_block_format rule). */
const formatAttrs = (tok: Token) => ({
  align: sanitizeTextAlign(tok.attrGet('align')),
  indent: sanitizeIndent(tok.attrGet('indent')),
  lineSpacing: sanitizeLineSpacing(tok.attrGet('lineSpacing')),
});

/** markdown-it hides the paragraphs of tight lists (as prosemirror-markdown reads them). */
function listIsTight(tokens: Token[], i: number): boolean {
  while (++i < tokens.length) {
    if (tokens[i].type !== 'list_item_open' && tokens[i].type !== 'task_item_open') {
      return tokens[i].hidden;
    }
  }
  return false;
}

export const inkMarkdownParser = new MarkdownParser(schema, tokenizer, {
  ...defaultMarkdownParser.tokens,
  paragraph: { block: 'paragraph', getAttrs: formatAttrs },
  heading: {
    block: 'heading',
    getAttrs: (tok) => ({ level: +tok.tag.slice(1), ...formatAttrs(tok) }),
  },
  ink_highlight: {
    mark: 'highlight',
    getAttrs: (tok) => {
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
    getAttrs: (tok) => ({ color: tok.attrGet('color') }),
  },
  ink_font_size: {
    mark: 'fontSize',
    getAttrs: (tok) => ({ size: sanitizeFontSize(tok.attrGet('size')) }),
  },
  ink_font_family: {
    mark: 'fontFamily',
    getAttrs: (tok) => ({ font: sanitizeFontFamily(tok.attrGet('font')) }),
  },
  table: { block: 'table' },
  table_row: { block: 'table_row' },
  table_header: {
    block: 'table_header',
    getAttrs: (tok) => ({ alignment: tok.attrGet('alignment') }),
  },
  table_cell: {
    block: 'table_cell',
    getAttrs: (tok) => ({ alignment: tok.attrGet('alignment') }),
  },
  callout: {
    block: 'callout',
    getAttrs: (tok) => ({ type: tok.attrGet('kind') }),
  },
  ink_page_break: { node: 'page_break' },
  task_list: {
    block: 'task_list',
    getAttrs: (_tok, tokens, i) => ({ tight: listIsTight(tokens, i) }),
  },
  task_item: {
    block: 'task_item',
    getAttrs: (tok) => ({
      checked: tok.attrGet('checked') === 'true',
    }),
  },
  fence: {
    block: 'code_block',
    getAttrs: (tok) => ({
      language: tok.info ? tok.info.trim().toLowerCase() : 'typescript',
    }),
  },
  code_block: {
    block: 'code_block',
    getAttrs: (tok) => ({
      language: tok.info ? tok.info.trim().toLowerCase() : 'typescript',
    }),
  },
});

export function docToMarkdown(doc: PMNode): string {
  return inkMarkdownSerializer.serialize(doc);
}

/**
 * `tight: false` records that a Markdown list was written loose by choice.
 * A list that had to be loose (see canBeTight) keeps the default, so a
 * document survives export and import unchanged.
 */
function keepLooseOnlyByChoice(doc: PMNode): PMNode {
  const tr = new Transform(doc);
  doc.descendants((node, pos) => {
    if (isListNode(node) && node.attrs['tight'] === false && !canBeTight(node)) {
      tr.setNodeAttribute(pos, 'tight', true);
    }
  });
  return tr.doc;
}

export function markdownToDoc(markdown: string): PMNode {
  return keepLooseOnlyByChoice(inkMarkdownParser.parse(markdown));
}
