export interface ColorSwatch {
  name: string;
  value: string;
  isLight?: boolean;
}

export const TEXT_COLORS: ColorSwatch[] = [
  // Row 1: Pastels & Light shades
  { name: 'Light Grey', value: '#e0e0e0', isLight: true },
  { name: 'Light Blue', value: '#93c5fd', isLight: true },
  { name: 'Light Cyan', value: '#a5f3fc', isLight: true },
  { name: 'Light Green', value: '#6ee7b7', isLight: true },
  { name: 'Light Orange', value: '#f97316' },
  { name: 'Light Coral', value: '#fca5a5', isLight: true },
  { name: 'Light Purple', value: '#d8b4fe', isLight: true },

  // Row 2: Medium / Vibrant shades
  { name: 'Medium Grey', value: '#6b7280' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Green', value: '#10b981' },
  { name: 'Brown', value: '#b45309' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Purple', value: '#a855f7' },

  // Row 3: Dark / Deep shades
  { name: 'Dark Charcoal', value: '#1f2937' },
  { name: 'Navy Blue', value: '#1e3a8a' },
  { name: 'Deep Teal', value: '#0f766e' },
  { name: 'Forest Green', value: '#065f46' },
  { name: 'Deep Brown', value: '#713f12' },
  { name: 'Burgundy', value: '#7f1d1d' },
  { name: 'Deep Purple', value: '#581c87' },
];

export const COMMON_EMOJIS = [
  '😀', '😃', '😄', '😁', '😅', '😂',
  '😊', '😍', '🥰', '😘', '😋', '🤔',
  '😎', '🥳', '👍', '👎', '👏', '🙌',
  '🎉', '🔥', '✨', '💡', '📌', '🚀',
  '❤️', '💯', '✅', '⚠️', '📝', '⭐',
];
