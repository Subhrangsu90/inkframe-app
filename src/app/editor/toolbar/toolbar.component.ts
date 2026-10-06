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
      <!-- History undo/redo -->
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

      <mat-divider vertical />

      <!-- Consolidated Block Type Option Select (Screenshot 1) -->
      <button mat-button
              class="ink-select-btn"
              [class.active]="svc.block().type === 'heading' || svc.isSmall()"
              aria-label="Paragraph format"
              matTooltip="Paragraph & Headings"
              [matMenuTriggerFor]="blockMenu">
        <mat-icon class="prefix-icon">title</mat-icon>
        <span class="btn-label">{{ currentBlockLabel() }}</span>
        <mat-icon class="caret">arrow_drop_down</mat-icon>
      </button>
      <mat-menu #blockMenu="matMenu">
        <button mat-menu-item
                [class.selected]="svc.block().type === 'paragraph' && !svc.isSmall()"
                (click)="svc.paragraph()">
          <mat-icon>short_text</mat-icon>
          <span class="menu-item-text">Normal text</span>
          <span class="menu-shortcut">Ctrl+Alt+0</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.isSmall()"
                (click)="svc.toggleSmall()">
          <mat-icon>format_size</mat-icon>
          <span class="menu-item-text">Small text</span>
          <span class="menu-shortcut">Ctrl+Alt+7</span>
        </button>
        <mat-divider />
        <button mat-menu-item
                [class.selected]="svc.block().level === 1"
                (click)="svc.heading(1)">
          <mat-icon>format_h1</mat-icon>
          <span class="menu-item-text h1-text">Heading 1</span>
          <span class="menu-shortcut">Ctrl+Alt+1</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.block().level === 2"
                (click)="svc.heading(2)">
          <mat-icon>format_h2</mat-icon>
          <span class="menu-item-text h2-text">Heading 2</span>
          <span class="menu-shortcut">Ctrl+Alt+2</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.block().level === 3"
                (click)="svc.heading(3)">
          <mat-icon>format_h3</mat-icon>
          <span class="menu-item-text h3-text">Heading 3</span>
          <span class="menu-shortcut">Ctrl+Alt+3</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.block().level === 4"
                (click)="svc.heading(4)">
          <mat-icon>format_h4</mat-icon>
          <span class="menu-item-text">Heading 4</span>
          <span class="menu-shortcut">Ctrl+Alt+4</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.block().level === 5"
                (click)="svc.heading(5)">
          <mat-icon>format_h5</mat-icon>
          <span class="menu-item-text">Heading 5</span>
          <span class="menu-shortcut">Ctrl+Alt+5</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.block().level === 6"
                (click)="svc.heading(6)">
          <mat-icon>format_h6</mat-icon>
          <span class="menu-item-text">Heading 6</span>
          <span class="menu-shortcut">Ctrl+Alt+6</span>
        </button>
      </mat-menu>

      <mat-divider vertical />

      <!-- Format Button Group -->
      <div class="ink-btn-group" role="group" aria-label="Text formatting">
        <button mat-icon-button
                aria-label="Bold"
                matTooltip="Bold (Ctrl+B)"
                [attr.aria-pressed]="svc.isBold()"
                [class.active]="svc.isBold()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleBold()">
          <mat-icon>format_bold</mat-icon>
        </button>
        <button mat-icon-button
                class="caret-btn"
                aria-label="More text formats"
                matTooltip="Format options"
                [class.active]="formatMenuTrigger.menuOpen"
                [matMenuTriggerFor]="formatMenu"
                #formatMenuTrigger="matMenuTrigger">
          <mat-icon>arrow_drop_down</mat-icon>
        </button>
      </div>

      <!-- Format Dropdown Menu: Bold, Italic, Underline, Strikethrough, Code, Subscript, Superscript, Divider, Clear formatting -->
      <mat-menu #formatMenu="matMenu">
        <button mat-menu-item
                [disabled]="svc.isCode()"
                [class.selected]="svc.isBold()"
                (click)="svc.toggleBold()">
          <mat-icon>format_bold</mat-icon>
          <span class="menu-item-text">Bold</span>
          <span class="menu-shortcut">Ctrl+B</span>
        </button>
        <button mat-menu-item
                [disabled]="svc.isCode()"
                [class.selected]="svc.isItalic()"
                (click)="svc.toggleItalic()">
          <mat-icon>format_italic</mat-icon>
          <span class="menu-item-text">Italic</span>
          <span class="menu-shortcut">Ctrl+I</span>
        </button>
        <button mat-menu-item
                [disabled]="svc.isCode()"
                [class.selected]="svc.isUnderline()"
                (click)="svc.toggleUnderline()">
          <mat-icon>format_underlined</mat-icon>
          <span class="menu-item-text">Underline</span>
          <span class="menu-shortcut">Ctrl+U</span>
        </button>
        <button mat-menu-item
                [disabled]="svc.isCode()"
                [class.selected]="svc.isStrike()"
                (click)="svc.toggleStrike()">
          <mat-icon>strikethrough_s</mat-icon>
          <span class="menu-item-text">Strikethrough</span>
          <span class="menu-shortcut">Ctrl+Shift+S</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.isCode()"
                (click)="svc.toggleCode()">
          <mat-icon>code</mat-icon>
          <span class="menu-item-text">Code</span>
          <span class="menu-shortcut">Ctrl+Shift+M</span>
        </button>
        <button mat-menu-item
                [disabled]="svc.isCode()"
                [class.selected]="svc.isSubscript()"
                (click)="svc.toggleSubscript()">
          <mat-icon>subscript</mat-icon>
          <span class="menu-item-text">Subscript</span>
          <span class="menu-shortcut">Ctrl+Shift+,</span>
        </button>
        <button mat-menu-item
                [disabled]="svc.isCode()"
                [class.selected]="svc.isSuperscript()"
                (click)="svc.toggleSuperscript()">
          <mat-icon>superscript</mat-icon>
          <span class="menu-item-text">Superscript</span>
          <span class="menu-shortcut">Ctrl+Shift+.</span>
        </button>
        <mat-divider />
        <button mat-menu-item (click)="svc.clearFormatting()">
          <mat-icon>format_clear</mat-icon>
          <span class="menu-item-text">Clear formatting</span>
          <span class="menu-shortcut">Ctrl+\</span>
        </button>
      </mat-menu>

      <!-- Text Color Menu (disabled when isCode is active) -->
      <button mat-icon-button
              aria-label="Text color"
              matTooltip="Text color"
              [disabled]="svc.isCode()"
              [matMenuTriggerFor]="colorMenu">
        <mat-icon [style.color]="svc.isCode() ? 'inherit' : (svc.currentColor() || 'inherit')">format_color_text</mat-icon>
      </button>
      <mat-menu #colorMenu="matMenu">
        <div class="ink-color-grid" (click)="$event.stopPropagation()">
          @for (c of textColors; track c.value) {
            <button type="button"
                    class="ink-color-swatch"
                    [style.background-color]="c.value"
                    [attr.title]="c.name"
                    (click)="svc.setTextColor(c.value)">
            </button>
          }
        </div>
        <mat-divider />
        <button mat-menu-item (click)="svc.removeTextColor()">
          <mat-icon>format_clear</mat-icon>
          <span>Default text color</span>
        </button>
      </mat-menu>

      <button mat-icon-button
              aria-label="Link"
              matTooltip="Link"
              [attr.aria-pressed]="svc.isLink()"
              [class.active]="svc.isLink()"
              (click)="promptLink()">
        <mat-icon>link</mat-icon>
      </button>

      <mat-divider vertical />

      <!-- Consolidated Lists Option Select (Screenshot 3) -->
      <button mat-button
              class="ink-select-btn ink-list-select-btn"
              [class.active]="svc.block().list !== null"
              aria-label="Lists"
              matTooltip="Lists"
              [matMenuTriggerFor]="listMenu">
        <mat-icon class="prefix-icon">{{ currentListIcon() }}</mat-icon>
        <mat-icon class="caret">arrow_drop_down</mat-icon>
      </button>
      <mat-menu #listMenu="matMenu">
        <button mat-menu-item
                [class.selected]="svc.block().list === 'bullet_list'"
                (click)="svc.toggleList('bullet_list')">
          <mat-icon>format_list_bulleted</mat-icon>
          <span class="menu-item-text">Bulleted list</span>
          <span class="menu-shortcut">Ctrl+Shift+8</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.block().list === 'ordered_list'"
                (click)="svc.toggleList('ordered_list')">
          <mat-icon>format_list_numbered</mat-icon>
          <span class="menu-item-text">Numbered list</span>
          <span class="menu-shortcut">Ctrl+Shift+7</span>
        </button>
      </mat-menu>

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
    .ink-btn-group {
      display: inline-flex;
      align-items: center;

      button.active {
        background: var(--mat-sys-secondary-container, #d3e3fd);
        color: var(--mat-sys-on-secondary-container, #041e49);
      }

      .caret-btn {
        width: 22px;
        min-width: 22px;
        margin-left: -6px;
        padding: 0;

        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
        }
      }
    }
    .ink-select-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 36px;
      padding: 0 8px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      color: var(--mat-sys-on-surface, #1e293b);

      .prefix-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .caret {
        font-size: 18px;
        width: 18px;
        height: 18px;
        opacity: 0.7;
      }
      &:hover {
        background: var(--mat-sys-surface-variant, #e2e8f0);
      }
      &.active {
        background: var(--mat-sys-secondary-container, #d3e3fd);
        color: var(--mat-sys-on-secondary-container, #041e49);
      }
    }
    .ink-list-select-btn {
      padding: 0 4px;
    }
    .menu-item-text {
      flex: 1;
      margin-right: 16px;
    }
    .menu-shortcut {
      font-size: 11px;
      color: var(--mat-sys-outline, #64748b);
      letter-spacing: 0.5px;
    }
    .h1-text { font-size: 16px; font-weight: 700; }
    .h2-text { font-size: 15px; font-weight: 600; }
    .h3-text { font-size: 14px; font-weight: 600; }

    .ink-color-grid {
      display: grid;
      grid-template-columns: repeat(4, 28px);
      gap: 6px;
      padding: 10px 12px;
      justify-content: center;
    }
    .ink-color-swatch {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 2px solid #ffffff;
      outline: 1px solid rgba(0, 0, 0, 0.2);
      cursor: pointer;
      transition: transform 0.15s ease, outline-color 0.15s ease;
      padding: 0;

      &:hover {
        transform: scale(1.15);
        outline-color: var(--mat-sys-primary, #0284c7);
      }
    }
  `,
})
export class ToolbarComponent {
  protected readonly svc = inject(EditorService);

  protected readonly textColors = [
    { name: 'Default Dark', value: '#1e293b' },
    { name: 'Muted Gray', value: '#64748b' },
    { name: 'Red', value: '#dc2626' },
    { name: 'Orange', value: '#ea580c' },
    { name: 'Amber', value: '#d97706' },
    { name: 'Emerald Green', value: '#16a34a' },
    { name: 'Teal', value: '#0d9488' },
    { name: 'Sky Blue', value: '#0284c7' },
    { name: 'Indigo', value: '#4f46e5' },
    { name: 'Purple', value: '#9333ea' },
    { name: 'Pink', value: '#db2777' },
    { name: 'Rose', value: '#e11d48' },
  ];

  protected currentBlockLabel(): string {
    const b = this.svc.block();
    if (b.type === 'heading') {
      return `Heading ${b.level}`;
    }
    if (this.svc.isSmall()) {
      return 'Small text';
    }
    if (b.type === 'code_block') {
      return 'Code block';
    }
    return 'Normal text';
  }

  protected currentListIcon(): string {
    const l = this.svc.block().list;
    if (l === 'ordered_list') return 'format_list_numbered';
    return 'format_list_bulleted';
  }

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
