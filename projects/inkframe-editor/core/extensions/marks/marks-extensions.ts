import { marks as basicMarks } from 'prosemirror-schema-basic';
import { toggleMark } from 'prosemirror-commands';
import { createExtension } from '../../editor/extension-types';
import { code, small, strikethrough, subscript, superscript, underline } from './marks-schema';
import { markRule } from './mark-input-rule';

export const BoldExtension = createExtension({
  name: 'bold',
  marks: { strong: basicMarks.strong },
  inputRules: (ctx) => [markRule(/\*\*([^*]+)\*\*$/, ctx.schema.marks['strong'])],
  keymaps: (ctx) => ({
    'Mod-b': toggleMark(ctx.schema.marks['strong']),
  }),
  toolbarItems: [
    {
      id: 'bold',
      group: 'formatting',
      icon: 'format_bold',
      tooltip: 'Bold (Ctrl+B)',
      shortcut: 'Ctrl+B',
      isActive: (s) => s.isBold(),
      isDisabled: (s) => s.isCode(),
      run: (s) => s.toggleBold(),
    },
  ],
  floatingItems: [
    {
      id: 'bold',
      icon: 'format_bold',
      tooltip: 'Bold (Ctrl+B)',
      isActive: (s) => s.isBold(),
      isDisabled: (s) => s.isCode(),
      run: (s) => s.toggleBold(),
    },
  ],
});

export const ItalicExtension = createExtension({
  name: 'italic',
  marks: { em: basicMarks.em },
  inputRules: (ctx) => [markRule(/(?:^|\s)_([^_\s][^_]*)_$/, ctx.schema.marks['em'])],
  keymaps: (ctx) => ({
    'Mod-i': toggleMark(ctx.schema.marks['em']),
  }),
  toolbarItems: [
    {
      id: 'italic',
      group: 'formatting',
      icon: 'format_italic',
      tooltip: 'Italic (Ctrl+I)',
      shortcut: 'Ctrl+I',
      isActive: (s) => s.isItalic(),
      isDisabled: (s) => s.isCode(),
      run: (s) => s.toggleItalic(),
    },
  ],
  floatingItems: [
    {
      id: 'italic',
      icon: 'format_italic',
      tooltip: 'Italic (Ctrl+I)',
      isActive: (s) => s.isItalic(),
      isDisabled: (s) => s.isCode(),
      run: (s) => s.toggleItalic(),
    },
  ],
});

export const UnderlineExtension = createExtension({
  name: 'underline',
  marks: { underline },
  keymaps: (ctx) => ({
    'Mod-u': toggleMark(ctx.schema.marks['underline']),
  }),
  toolbarItems: [
    {
      id: 'underline',
      group: 'formatting',
      icon: 'format_underlined',
      tooltip: 'Underline (Ctrl+U)',
      shortcut: 'Ctrl+U',
      isActive: (s) => s.isUnderline(),
      isDisabled: (s) => s.isCode(),
      run: (s) => s.toggleUnderline(),
    },
  ],
  floatingItems: [
    {
      id: 'underline',
      icon: 'format_underlined',
      tooltip: 'Underline (Ctrl+U)',
      isActive: (s) => s.isUnderline(),
      isDisabled: (s) => s.isCode(),
      run: (s) => s.toggleUnderline(),
    },
  ],
});

export const StrikeExtension = createExtension({
  name: 'strike',
  marks: { strikethrough },
  inputRules: (ctx) => [markRule(/~~([^~]+)~~$/, ctx.schema.marks['strikethrough'])],
  keymaps: (ctx) => ({
    'Shift-Mod-s': toggleMark(ctx.schema.marks['strikethrough']),
  }),
  toolbarItems: [
    {
      id: 'strike',
      group: 'formatting',
      icon: 'format_strikethrough',
      tooltip: 'Strikethrough (Ctrl+Shift+S)',
      shortcut: 'Ctrl+Shift+S',
      isActive: (s) => s.isStrike(),
      isDisabled: (s) => s.isCode(),
      run: (s) => s.toggleStrike(),
    },
  ],
  floatingItems: [
    {
      id: 'strike',
      icon: 'format_strikethrough',
      tooltip: 'Strikethrough (Ctrl+Shift+S)',
      isActive: (s) => s.isStrike(),
      isDisabled: (s) => s.isCode(),
      run: (s) => s.toggleStrike(),
    },
  ],
});

export const CodeExtension = createExtension({
  name: 'code',
  marks: { code },
  inputRules: (ctx) => [markRule(/`([^`]+)`$/, ctx.schema.marks['code'])],
  keymaps: (ctx) => ({
    'Mod-e': toggleMark(ctx.schema.marks['code']),
    'Shift-Mod-m': toggleMark(ctx.schema.marks['code']),
  }),
  toolbarItems: [
    {
      id: 'code',
      group: 'formatting',
      icon: 'code',
      tooltip: 'Inline code (Ctrl+E)',
      shortcut: 'Ctrl+E',
      isActive: (s) => s.isCode(),
      run: (s) => s.toggleCode(),
    },
  ],
  floatingItems: [
    {
      id: 'code',
      icon: 'code',
      tooltip: 'Inline code (Ctrl+E)',
      isActive: (s) => s.isCode(),
      run: (s) => s.toggleCode(),
    },
  ],
});

export const SubscriptExtension = createExtension({
  name: 'subscript',
  marks: { subscript },
  inputRules: (ctx) => [markRule(/~([^~]+)~$/, ctx.schema.marks['subscript'])],
  keymaps: (ctx) => ({
    'Shift-Mod-,': toggleMark(ctx.schema.marks['subscript']),
  }),
  toolbarItems: [
    {
      id: 'subscript',
      group: 'formatting',
      glyph: 'x₂',
      tooltip: 'Subscript (Ctrl+Shift+,)',
      shortcut: 'Ctrl+Shift+,',
      isActive: (s) => s.isSubscript(),
      isDisabled: (s) => s.isCode(),
      run: (s) => s.toggleSubscript(),
    },
  ],
});

export const SuperscriptExtension = createExtension({
  name: 'superscript',
  marks: { superscript },
  inputRules: (ctx) => [markRule(/\^([^^]+)\^$/, ctx.schema.marks['superscript'])],
  keymaps: (ctx) => ({
    'Shift-Mod-.': toggleMark(ctx.schema.marks['superscript']),
  }),
  toolbarItems: [
    {
      id: 'superscript',
      group: 'formatting',
      glyph: 'x²',
      tooltip: 'Superscript (Ctrl+Shift+.)',
      shortcut: 'Ctrl+Shift+.',
      isActive: (s) => s.isSuperscript(),
      isDisabled: (s) => s.isCode(),
      run: (s) => s.toggleSuperscript(),
    },
  ],
});

export const SmallExtension = createExtension({
  name: 'small',
  marks: { small },
  keymaps: (ctx) => ({
    'Mod-Alt-7': toggleMark(ctx.schema.marks['small']),
  }),
});
