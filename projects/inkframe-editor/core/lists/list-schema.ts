import { AttributeSpec, Node as PMNode, NodeSpec } from 'prosemirror-model';

/**
 * Node specs for bullet, numbered and task lists.
 *
 * Nested lists live inside the item they belong to. An item starts with a
 * paragraph or heading (the `list_lead` group) and may hold any blocks after
 * it: more paragraphs, nested lists, code blocks, tables.
 *
 * All three list types share one set of attributes, so converting a list from
 * one type to another and back never loses its start number or styles. Each
 * type shows only the attributes that apply to it and keeps the rest in
 * `data-*` attributes, which also survive copy and paste.
 */

export type ListKind = 'bullet_list' | 'ordered_list' | 'task_list';
export const LIST_KINDS: readonly ListKind[] = ['bullet_list', 'ordered_list', 'task_list'];

/** Group of the blocks that can start a list item. */
export const LIST_LEAD_GROUP = 'list_lead';
export const LIST_ITEM_CONTENT = `${LIST_LEAD_GROUP} block*`;

// ── Bullet styles ─────────────────────────────────────────────────

export type BulletStyle = 'disc' | 'circle' | 'square' | 'dash' | 'arrow' | 'check' | 'star';

export interface BulletStyleOption {
  value: BulletStyle;
  label: string;
  /** What the bullet looks like, for menus. */
  glyph: string;
}

export const BULLET_STYLES: readonly BulletStyleOption[] = [
  { value: 'disc', label: 'Disc', glyph: '•' },
  { value: 'circle', label: 'Circle', glyph: '◦' },
  { value: 'square', label: 'Square', glyph: '▪' },
  { value: 'dash', label: 'Dash', glyph: '–' },
  { value: 'arrow', label: 'Arrow', glyph: '→' },
  { value: 'check', label: 'Check', glyph: '✓' },
  { value: 'star', label: 'Star', glyph: '★' },
];

const NATIVE_BULLETS = new Set(['disc', 'circle', 'square']);
const BULLET_GLYPHS = new Map(BULLET_STYLES.map((s) => [s.value as string, s.glyph]));

// A custom bullet is one short symbol. Quotes, backslashes and CSS punctuation
// are refused so the value can never break out of the CSS string it goes in.
const CUSTOM_BULLET = /^[^\s"'\\<>;:{}()[\]/]{1,8}$/u;

/** A named bullet style, a custom bullet symbol, or null for the default (by depth). */
export function sanitizeBulletStyle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (BULLET_GLYPHS.has(value)) return value;
  return CUSTOM_BULLET.test(value) ? value : null;
}

/** The CSS `list-style-type` for a bullet style. */
export function bulletStyleCss(style: string): string {
  if (NATIVE_BULLETS.has(style)) return style;
  return `"${BULLET_GLYPHS.get(style) ?? style} "`;
}

/** The symbol a bullet style draws, for menus and previews. */
export function bulletStyleGlyph(style: string | null): string {
  return style ? (BULLET_GLYPHS.get(style) ?? style) : '•';
}

// ── Number styles ─────────────────────────────────────────────────

export type NumberStyle = 'decimal' | 'lower-alpha' | 'upper-alpha' | 'lower-roman' | 'upper-roman';

export interface NumberStyleOption {
  value: NumberStyle;
  label: string;
  glyph: string;
  /** The HTML `<ol type>` value. */
  htmlType: string;
}

export const NUMBER_STYLES: readonly NumberStyleOption[] = [
  { value: 'decimal', label: 'Numbers', glyph: '1.', htmlType: '1' },
  { value: 'lower-alpha', label: 'Lowercase letters', glyph: 'a.', htmlType: 'a' },
  { value: 'upper-alpha', label: 'Uppercase letters', glyph: 'A.', htmlType: 'A' },
  { value: 'lower-roman', label: 'Lowercase Roman', glyph: 'i.', htmlType: 'i' },
  { value: 'upper-roman', label: 'Uppercase Roman', glyph: 'I.', htmlType: 'I' },
];

const NUMBER_STYLE_SET = new Set<string>(NUMBER_STYLES.map((s) => s.value));
const NUMBER_STYLE_BY_HTML_TYPE = new Map(NUMBER_STYLES.map((s) => [s.htmlType, s.value]));

export function sanitizeNumberStyle(raw: unknown): NumberStyle | null {
  return typeof raw === 'string' && NUMBER_STYLE_SET.has(raw) ? (raw as NumberStyle) : null;
}

/** The numbering style lists get at a nesting level (1 = top level) when none is set. */
export function defaultNumberStyle(level: number): NumberStyle {
  return (['decimal', 'lower-alpha', 'lower-roman'] as const)[(Math.max(level, 1) - 1) % 3];
}

// ── Start number ──────────────────────────────────────────────────

export const MAX_LIST_START = 999_999;

/** A whole number from 0 to MAX_LIST_START; anything else becomes 1. */
export function sanitizeListStart(raw: unknown): number {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isFinite(n)) return 1;
  const whole = Math.trunc(n);
  return whole >= 0 && whole <= MAX_LIST_START ? whole : 1;
}

// ── Shared list attributes ────────────────────────────────────────

const LIST_ATTRS: Record<string, AttributeSpec> = {
  /** First number of a numbered list. */
  order: { default: 1 },
  /** Bullet style of a bullet list; null draws bullets by depth. */
  bulletStyle: { default: null },
  /** Number style of a numbered list; null numbers by depth. */
  numberStyle: { default: null },
  /** Markdown export writes tight lists without blank lines between items. */
  tight: { default: true },
};

function readStyleProperty(dom: HTMLElement): string {
  const raw = /list-style-type\s*:\s*([^;]+)/i.exec(dom.getAttribute('style') ?? '')?.[1];
  return (dom.style?.listStyleType || raw || '').trim();
}

/** Reads the shared list attributes from a `<ul>` or `<ol>`. */
export function readListAttrs(dom: HTMLElement, kind: ListKind): Record<string, unknown> {
  const style = readStyleProperty(dom);
  const quoted = /^["'](.+?)\s*["']$/.exec(style)?.[1];
  const start = dom.getAttribute(kind === 'ordered_list' ? 'start' : 'data-start');

  let bulletStyle = sanitizeBulletStyle(dom.getAttribute('data-bullet-style'));
  if (!bulletStyle && kind === 'bullet_list') {
    bulletStyle = NATIVE_BULLETS.has(style) ? style : quoted ? sanitizeBulletStyle(quoted) : null;
  }

  let numberStyle = sanitizeNumberStyle(dom.getAttribute('data-number-style'));
  if (!numberStyle && kind === 'ordered_list') {
    numberStyle =
      NUMBER_STYLE_BY_HTML_TYPE.get(dom.getAttribute('type') ?? '') ?? sanitizeNumberStyle(style);
  }

  return {
    order: start === null ? 1 : sanitizeListStart(start),
    bulletStyle,
    numberStyle,
    tight: dom.getAttribute('data-tight') !== 'false',
  };
}

/** DOM attributes for a list node. Defaults are left out, so a plain list renders as `<ul>`. */
export function listDomAttrs(node: PMNode, kind: ListKind): Record<string, string> {
  const attrs: Record<string, string> = {};
  const order = sanitizeListStart(node.attrs['order']);
  const bulletStyle = sanitizeBulletStyle(node.attrs['bulletStyle']);
  const numberStyle = sanitizeNumberStyle(node.attrs['numberStyle']);

  if (order !== 1) attrs[kind === 'ordered_list' ? 'start' : 'data-start'] = String(order);
  if (bulletStyle) attrs['data-bullet-style'] = bulletStyle;
  if (numberStyle) attrs['data-number-style'] = numberStyle;
  if (kind === 'bullet_list' && bulletStyle) {
    attrs['style'] = `list-style-type: ${bulletStyleCss(bulletStyle)}`;
  }
  if (kind === 'ordered_list' && numberStyle) {
    attrs['type'] = NUMBER_STYLES.find((s) => s.value === numberStyle)!.htmlType;
    attrs['style'] = `list-style-type: ${numberStyle}`;
  }
  if (node.attrs['tight'] === false) attrs['data-tight'] = 'false';
  return attrs;
}

// ── Node specs ────────────────────────────────────────────────────

export const bullet_list: NodeSpec = {
  group: 'block',
  content: 'list_item+',
  attrs: LIST_ATTRS,
  parseDOM: [{ tag: 'ul', getAttrs: (dom) => readListAttrs(dom as HTMLElement, 'bullet_list') }],
  toDOM: (node) => ['ul', listDomAttrs(node, 'bullet_list'), 0],
};

export const ordered_list: NodeSpec = {
  group: 'block',
  content: 'list_item+',
  attrs: LIST_ATTRS,
  parseDOM: [{ tag: 'ol', getAttrs: (dom) => readListAttrs(dom as HTMLElement, 'ordered_list') }],
  toDOM: (node) => ['ol', listDomAttrs(node, 'ordered_list'), 0],
};

export const list_item: NodeSpec = {
  content: LIST_ITEM_CONTENT,
  defining: true,
  parseDOM: [{ tag: 'li' }],
  toDOM: () => ['li', 0],
};

// Task lists are `<ul>`s too: their rules outrank the plain `ul` and `li` rules.
const TASK_PRIORITY = 60;

export const task_list: NodeSpec = {
  group: 'block',
  content: 'task_item+',
  attrs: LIST_ATTRS,
  parseDOM: ['ul.ink-task-list', 'ul[data-type="task_list"]', 'ul.contains-task-list'].map(
    (tag) => ({
      tag,
      priority: TASK_PRIORITY,
      getAttrs: (dom: HTMLElement) => readListAttrs(dom, 'task_list'),
    }),
  ),
  // `list-style: none` makes Safari drop list semantics; the role restores them.
  toDOM: (node) => [
    'ul',
    {
      ...listDomAttrs(node, 'task_list'),
      class: 'ink-task-list',
      'data-type': 'task_list',
      role: 'list',
    },
    0,
  ],
};

function readChecked(dom: HTMLElement): { checked: boolean } {
  const checkbox = dom.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
  return {
    checked:
      dom.getAttribute('data-checked') === 'true' ||
      dom.classList.contains('checked') ||
      !!checkbox?.checked,
  };
}

/** How many task items nested inside `item` are checked, of how many. */
export function nestedTaskProgress(item: PMNode): { checked: number; total: number } {
  let checked = 0;
  let total = 0;
  item.descendants((node) => {
    if (node.type.name === 'task_item') {
      total++;
      if (node.attrs['checked']) checked++;
    }
    return true;
  });
  return { checked, total };
}

/** An unchecked task whose nested tasks are partly done: its box shows a dash. */
export function isTaskIndeterminate(item: PMNode): boolean {
  if (item.attrs['checked']) return false;
  const { checked, total } = nestedTaskProgress(item);
  return checked > 0 && checked < total;
}

export const task_item: NodeSpec = {
  content: LIST_ITEM_CONTENT,
  attrs: {
    checked: { default: false },
  },
  defining: true,
  parseDOM: ['li.ink-task-item', 'li[data-type="task_item"]', 'li.task-list-item'].map((tag) => ({
    tag,
    priority: TASK_PRIORITY,
    getAttrs: (dom: HTMLElement) => readChecked(dom),
  })),
  toDOM: (node) => {
    const checked = !!node.attrs['checked'];
    const indeterminate = isTaskIndeterminate(node);
    return [
      'li',
      {
        class: `ink-task-item${checked ? ' checked' : ''}${indeterminate ? ' indeterminate' : ''}`,
        'data-type': 'task_item',
        'data-checked': String(checked),
      },
      0,
    ];
  },
};
