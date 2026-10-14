import { createExtension } from '../../editor/extension-types';
import { link } from './link-schema';

export const LinkExtension = createExtension({
  name: 'link',
  marks: { link },
  keymaps: (ctx) => ({
    'Mod-k': () => {
      ctx.service.requestLinkEditor();
      return true; // also stops the browser's own Ctrl+K (address bar search)
    },
  }),
  toolbarItems: [
    {
      id: 'link',
      group: 'insert',
      icon: 'link',
      tooltip: 'Insert or edit link (Ctrl+K)',
      shortcut: 'Ctrl+K',
      isActive: (s) => s.isLink(),
      run: (s) => {
        if (typeof window === 'undefined') return;
        const current = s.getLinkHref() || '';
        const href = window.prompt('Enter link URL (https://...):', current);
        if (href) {
          s.setLink(href);
        } else if (href === '') {
          s.removeLink();
        }
      },
    },
  ],
  floatingItems: [
    {
      id: 'link',
      icon: 'link',
      tooltip: 'Link (Ctrl+K)',
      isActive: (s) => s.isLink(),
      run: (s) => {
        if (typeof window === 'undefined') return;
        const current = s.getLinkHref() || '';
        const href = window.prompt('Enter link URL (https://...):', current);
        if (href) {
          s.setLink(href);
        } else if (href === '') {
          s.removeLink();
        }
      },
    },
  ],
});
