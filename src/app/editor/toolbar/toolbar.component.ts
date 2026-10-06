import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { EditorService } from '../editor.service';
import { CalloutKind } from '../core/schema';

@Component({
  selector: 'ink-toolbar',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatDividerModule,
    MatMenuModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ink-toolbar" role="toolbar" aria-label="Text formatting"
         (mousedown)="$event.preventDefault()">
      <!-- Mark toggles -->
      <button mat-icon-button
              aria-label="Bold"
              matTooltip="Bold (Ctrl+B)"
              [attr.aria-pressed]="svc.isBold()"
              [class.active]="svc.isBold()"
              (click)="svc.toggleBold()">
        <mat-icon>format_bold</mat-icon>
      </button>
      <button mat-icon-button
              aria-label="Italic"
              matTooltip="Italic (Ctrl+I)"
              [attr.aria-pressed]="svc.isItalic()"
              [class.active]="svc.isItalic()"
              (click)="svc.toggleItalic()">
        <mat-icon>format_italic</mat-icon>
      </button>
      <button mat-icon-button
              aria-label="Inline code"
              matTooltip="Code (Ctrl+E)"
              [attr.aria-pressed]="svc.isCode()"
              [class.active]="svc.isCode()"
              (click)="svc.toggleCode()">
        <mat-icon>code</mat-icon>
      </button>
      <button mat-icon-button
              aria-label="Link"
              matTooltip="Link"
              [attr.aria-pressed]="svc.isLink()"
              [class.active]="svc.isLink()"
              (click)="promptLink()">
        <mat-icon>link</mat-icon>
      </button>

      <mat-divider vertical />

      <!-- Block types -->
      <button mat-icon-button
              aria-label="Heading 1"
              matTooltip="Heading 1"
              [attr.aria-pressed]="svc.block().level === 1"
              [class.active]="svc.block().level === 1"
              (click)="svc.heading(1)">
        <mat-icon>format_h1</mat-icon>
      </button>
      <button mat-icon-button
              aria-label="Heading 2"
              matTooltip="Heading 2"
              [attr.aria-pressed]="svc.block().level === 2"
              [class.active]="svc.block().level === 2"
              (click)="svc.heading(2)">
        <mat-icon>format_h2</mat-icon>
      </button>
      <button mat-icon-button
              aria-label="Heading 3"
              matTooltip="Heading 3"
              [attr.aria-pressed]="svc.block().level === 3"
              [class.active]="svc.block().level === 3"
              (click)="svc.heading(3)">
        <mat-icon>format_h3</mat-icon>
      </button>

      <mat-divider vertical />

      <!-- Lists -->
      <button mat-icon-button
              aria-label="Bullet list"
              matTooltip="Bullet list"
              [attr.aria-pressed]="svc.block().list === 'bullet_list'"
              [class.active]="svc.block().list === 'bullet_list'"
              (click)="svc.toggleList('bullet_list')">
        <mat-icon>format_list_bulleted</mat-icon>
      </button>
      <button mat-icon-button
              aria-label="Numbered list"
              matTooltip="Numbered list"
              [attr.aria-pressed]="svc.block().list === 'ordered_list'"
              [class.active]="svc.block().list === 'ordered_list'"
              (click)="svc.toggleList('ordered_list')">
        <mat-icon>format_list_numbered</mat-icon>
      </button>

      <mat-divider vertical />

      <!-- Block inserts -->
      <button mat-icon-button
              aria-label="Blockquote"
              matTooltip="Quote"
              (click)="svc.blockquote()">
        <mat-icon>format_quote</mat-icon>
      </button>
      <button mat-icon-button
              aria-label="Code block"
              matTooltip="Code block"
              (click)="svc.codeBlock()">
        <mat-icon>data_object</mat-icon>
      </button>

      <!-- Callout menu -->
      <button mat-icon-button
              aria-label="Callout"
              matTooltip="Callout note"
              [matMenuTriggerFor]="calloutMenu">
        <mat-icon>announcement</mat-icon>
      </button>
      <mat-menu #calloutMenu="matMenu">
        <button mat-menu-item (click)="svc.insertCallout('info')">
          <mat-icon color="primary">info</mat-icon>
          <span>Info note</span>
        </button>
        <button mat-menu-item (click)="svc.insertCallout('warning')">
          <mat-icon>warning</mat-icon>
          <span>Warning</span>
        </button>
        <button mat-menu-item (click)="svc.insertCallout('success')">
          <mat-icon>check_circle</mat-icon>
          <span>Success</span>
        </button>
        <button mat-menu-item (click)="svc.insertCallout('danger')">
          <mat-icon color="warn">error</mat-icon>
          <span>Danger</span>
        </button>
      </mat-menu>

      <!-- Table insert or table controls -->
      @if (svc.isInTable()) {
        <button mat-icon-button
                aria-label="Table options"
                matTooltip="Table tools"
                class="active"
                [matMenuTriggerFor]="tableMenu">
          <mat-icon>table_chart</mat-icon>
        </button>
        <mat-menu #tableMenu="matMenu">
          <button mat-menu-item (click)="svc.addRow()">
            <mat-icon>add</mat-icon>
            <span>Insert row below</span>
          </button>
          <button mat-menu-item (click)="svc.deleteRow()">
            <mat-icon>delete</mat-icon>
            <span>Delete row</span>
          </button>
          <button mat-menu-item (click)="svc.addColumn()">
            <mat-icon>add</mat-icon>
            <span>Insert column right</span>
          </button>
          <button mat-menu-item (click)="svc.deleteColumn()">
            <mat-icon>delete</mat-icon>
            <span>Delete column</span>
          </button>
          <mat-divider />
          <button mat-menu-item (click)="svc.deleteTable()">
            <mat-icon color="warn">delete_forever</mat-icon>
            <span>Delete entire table</span>
          </button>
        </mat-menu>
      } @else {
        <button mat-icon-button
                aria-label="Insert Table"
                matTooltip="Table (3x3)"
                (click)="svc.insertTable(3, 3)">
          <mat-icon>table_chart</mat-icon>
        </button>
      }

      <!-- Image upload to IndexedDB -->
      <button mat-icon-button
              aria-label="Insert Image"
              matTooltip="Image (IndexedDB)"
              (click)="uploadImage()">
        <mat-icon>image</mat-icon>
      </button>

      <button mat-icon-button
              aria-label="Divider"
              matTooltip="Horizontal rule"
              (click)="svc.insertDivider()">
        <mat-icon>horizontal_rule</mat-icon>
      </button>

      <mat-divider vertical />

      <!-- Undo / redo -->
      <button mat-icon-button
              aria-label="Undo"
              matTooltip="Undo (Ctrl+Z)"
              [disabled]="!svc.canUndo()"
              (click)="svc.undo()">
        <mat-icon>undo</mat-icon>
      </button>
      <button mat-icon-button
              aria-label="Redo"
              matTooltip="Redo (Ctrl+Y)"
              [disabled]="!svc.canRedo()"
              (click)="svc.redo()">
        <mat-icon>redo</mat-icon>
      </button>
    </div>
  `,
  styles: `
    .ink-toolbar {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 4px 8px;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #c4c7c5);
      background: var(--mat-sys-surface-container, #f3f3f3);
      flex-wrap: wrap;
    }
    .ink-toolbar mat-divider {
      height: 24px;
      margin: 0 4px;
    }
    .ink-toolbar button.active {
      background: var(--mat-sys-secondary-container, #d3e3fd);
      color: var(--mat-sys-on-secondary-container, #041e49);
    }
  `,
})
export class ToolbarComponent {
  protected readonly svc = inject(EditorService);

  protected promptLink(): void {
    if (typeof window === 'undefined') return;
    const current = this.svc.getLinkHref();
    if (this.svc.isLink()) {
      const url = window.prompt('Edit or remove link URL (clear to remove):', current || '');
      if (url === null) return;
      if (!url.trim()) {
        this.svc.removeLink();
      } else {
        this.svc.setLink(url.trim());
      }
    } else {
      const url = window.prompt('Enter link URL (e.g. https://...):');
      if (url?.trim()) {
        this.svc.setLink(url.trim());
      }
    }
  }

  protected uploadImage(): void {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        this.svc.insertImage(file);
      }
    };
    input.click();
  }
}
