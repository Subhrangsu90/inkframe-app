import { MarkSpec } from 'prosemirror-model';

export const underline: MarkSpec = {
  parseDOM: [
    { tag: 'u' },
    { style: 'text-decoration=underline' },
    { style: 'text-decoration-line=underline' },
  ],
  toDOM: () => ['u', 0],
};

export const strikethrough: MarkSpec = {
  parseDOM: [
    { tag: 's' },
    { tag: 'del' },
    { tag: 'strike' },
    { style: 'text-decoration=line-through' },
    { style: 'text-decoration-line=line-through' },
  ],
  toDOM: () => ['s', 0],
};

// Google Docs writes sub- and superscript as `vertical-align` styles.
export const subscript: MarkSpec = {
  excludes: 'superscript',
  parseDOM: [{ tag: 'sub' }, { style: 'vertical-align=sub' }],
  toDOM: () => ['sub', 0],
};

export const superscript: MarkSpec = {
  excludes: 'subscript',
  parseDOM: [{ tag: 'sup' }, { style: 'vertical-align=super' }],
  toDOM: () => ['sup', 0],
};

export const small: MarkSpec = {
  parseDOM: [{ tag: 'small' }],
  toDOM: () => ['small', 0],
};

export const code: MarkSpec = {
  parseDOM: [{ tag: 'code' }],
  toDOM: () => ['code', 0],
  excludes: '_',
};
