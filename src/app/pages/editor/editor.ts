import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Editor } from '@inkframe-ui/editor';
import {
  DEFAULT_EXTENSIONS,
  HistoryExtension,
  HeadingExtension,
  BoldExtension,
  ItalicExtension,
  BulletListExtension,
  TableExtension,
  CalloutExtension,
  CodeBlockExtension,
  EditorExtension,
  createExtension,
} from '@inkframe-ui/editor/core';

// Custom plugin demo: adds a custom mark, toolbar button, and slash item
const CustomPluginDemo: EditorExtension = createExtension({
  name: 'custom_star_tool',
  toolbarItems: [
    {
      id: 'custom_star',
      glyph: '★ Custom Plugin',
      tooltip: 'Custom Plugin Tool: Insert starred snippet',
      run: (svc) => {
        svc.insertText(' ★ [Custom Plugin Tool Activated] ★ ');
      },
    },
  ],
  slashItems: [
    {
      id: 'star_action',
      label: 'Custom Plugin Action',
      hint: 'Inserted via your custom plugin',
      icon: 'stars',
      keywords: ['custom', 'plugin', 'star'],
      run: (svc) => {
        svc.insertText('✨ This block was created by your custom plugin slash command! ✨\n');
      },
    },
  ],
});

export type PluginPreset = 'starter-kit' | 'minimal' | 'custom' | 'zen';

@Component({
  selector: 'ink-editor-page',
  imports: [CommonModule, RouterLink, Editor],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorView {
  readonly activePreset = signal<PluginPreset>('starter-kit');
  readonly showToolbar = computed(() => this.activePreset() !== 'zen');

  readonly extensions = computed<EditorExtension[]>(() => {
    switch (this.activePreset()) {
      case 'minimal':
        // Minimal editor: only 5 tools picked one by one!
        return [
          HistoryExtension,
          HeadingExtension,
          BoldExtension,
          ItalicExtension,
          BulletListExtension,
          CodeBlockExtension
        ];

      case 'custom':
        // Custom plugin added alongside standard formatting
        return [
          HistoryExtension,
          HeadingExtension,
          BoldExtension,
          ItalicExtension,
          BulletListExtension,
          TableExtension,
          CustomPluginDemo,
        ];

      case 'zen':
        // Zen mode: no toolbar, purely slash and floating menu
        return DEFAULT_EXTENSIONS;

      case 'starter-kit':
      default:
        // Full standard suite
        return DEFAULT_EXTENSIONS;
    }
  });

  setPreset(preset: PluginPreset): void {
    this.activePreset.set(preset);
  }
}
