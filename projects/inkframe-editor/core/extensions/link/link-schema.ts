import { MarkSpec } from 'prosemirror-model';
import { sanitizeHref } from './link-utils';

export const link: MarkSpec = {
  attrs: { href: {}, title: { default: null } },
  inclusive: false,
  parseDOM: [
    {
      tag: 'a[href]',
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        const href = sanitizeHref(el.getAttribute('href'));
        return href ? { href, title: el.getAttribute('title') } : false; // false = drop the mark
      },
    },
  ],
  toDOM: (mark) => [
    'a',
    {
      href: sanitizeHref(mark.attrs['href']) ?? '#',
      title: mark.attrs['title'],
      rel: 'noopener noreferrer nofollow',
      target: '_blank',
    },
    0,
  ],
};
