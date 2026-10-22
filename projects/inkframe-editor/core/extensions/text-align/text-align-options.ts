import { TextAlign } from './text-align-schema';

export interface TextAlignOption {
  value: TextAlign;
  label: string;
  icon: string;
  shortcut: string;
}

/** The alignment choices shown by the toolbar and the floating menu. */
export const TEXT_ALIGN_OPTIONS: TextAlignOption[] = [
  { value: 'left', label: 'Align left', icon: 'format_align_left', shortcut: 'Ctrl+Shift+L' },
  { value: 'center', label: 'Center', icon: 'format_align_center', shortcut: 'Ctrl+Shift+E' },
  { value: 'right', label: 'Align right', icon: 'format_align_right', shortcut: 'Ctrl+Shift+R' },
  { value: 'justify', label: 'Justify', icon: 'format_align_justify', shortcut: 'Ctrl+Shift+J' },
];

/** Icon for the current alignment (left when the block cannot be aligned). */
export function textAlignIcon(align: TextAlign | null): string {
  return TEXT_ALIGN_OPTIONS.find((o) => o.value === align)?.icon ?? 'format_align_left';
}
