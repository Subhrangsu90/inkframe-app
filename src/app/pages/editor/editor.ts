import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'ink-editor-page',
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorView { }
