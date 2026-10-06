import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EditorService } from '../editor.service';
import { TEXT_COLORS, COMMON_EMOJIS, ColorSwatch } from '../core/colors';

@Component({
  selector: 'ink-toolbar',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatMenuModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ink-toolbar" role="toolbar" aria-label="Editor toolbar">
      <!-- 1. Block Selector Dropdown (T ▾) -->
      <button type="button"
              class="ink-tb-btn"
              [class.active]="svc.block().type !== 'paragraph' || svc.isSmall()"
              [matMenuTriggerFor]="blockMenu"
              aria-label="Text block style"
              matTooltip="Block style">
        <span class="tb-glyph">{{ currentBlockGlyph() }}</span>
        <mat-icon class="caret">arrow_drop_down</mat-icon>
      </button>
      <mat-menu #blockMenu="matMenu">
        <button mat-menu-item
                [class.selected]="svc.block().type === 'paragraph' && !svc.isSmall()"
                (click)="svc.paragraph()">
          <span class="menu-item-glyph">T</span>
          <span class="menu-item-text">Normal text</span>
          <span class="menu-shortcut">Ctrl+Alt+0</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.isSmall()"
                (click)="svc.toggleSmall()">
          <span class="menu-item-glyph">T<sub>s</sub></span>
          <span class="menu-item-text small-text">Small text</span>
          <span class="menu-shortcut">Ctrl+Alt+7</span>
        </button>
        <mat-divider />
        <button mat-menu-item
                [class.selected]="svc.block().type === 'heading' && svc.block().level === 1"
                (click)="svc.heading(1)">
          <span class="menu-item-glyph">H<sub>1</sub></span>
          <span class="menu-item-text h1-text">Heading 1</span>
          <span class="menu-shortcut">Ctrl+Alt+1</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.block().type === 'heading' && svc.block().level === 2"
                (click)="svc.heading(2)">
          <span class="menu-item-glyph">H<sub>2</sub></span>
          <span class="menu-item-text h2-text">Heading 2</span>
          <span class="menu-shortcut">Ctrl+Alt+2</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.block().type === 'heading' && svc.block().level === 3"
                (click)="svc.heading(3)">
          <span class="menu-item-glyph">H<sub>3</sub></span>
          <span class="menu-item-text h3-text">Heading 3</span>
          <span class="menu-shortcut">Ctrl+Alt+3</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.block().type === 'heading' && svc.block().level === 4"
                (click)="svc.heading(4)">
          <span class="menu-item-glyph">H<sub>4</sub></span>
          <span class="menu-item-text h4-text">Heading 4</span>
          <span class="menu-shortcut">Ctrl+Alt+4</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.block().type === 'heading' && svc.block().level === 5"
                (click)="svc.heading(5)">
          <span class="menu-item-glyph">H<sub>5</sub></span>
          <span class="menu-item-text h5-text">Heading 5</span>
          <span class="menu-shortcut">Ctrl+Alt+5</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.block().type === 'heading' && svc.block().level === 6"
                (click)="svc.heading(6)">
          <span class="menu-item-glyph">H<sub>6</sub></span>
          <span class="menu-item-text h6-text">Heading 6</span>
          <span class="menu-shortcut">Ctrl+Alt+6</span>
        </button>
      </mat-menu>

      <!-- 2. Format Dropdown (B ▾) -->
      <button type="button"
              class="ink-tb-btn"
              [class.active]="svc.isBold() || svc.isItalic() || svc.isUnderline() || svc.isStrike() || svc.isCode()"
              [matMenuTriggerFor]="formatMenu"
              aria-label="Text formatting"
              matTooltip="Formatting">
        <span class="tb-glyph font-bold">B</span>
        <mat-icon class="caret">arrow_drop_down</mat-icon>
      </button>
      <mat-menu #formatMenu="matMenu">
        <button mat-menu-item
                [class.selected]="svc.isBold()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleBold()">
          <span class="menu-item-glyph font-bold">B</span>
          <span class="menu-item-text">Bold</span>
          <span class="menu-shortcut">Ctrl+B</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.isItalic()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleItalic()">
          <span class="menu-item-glyph font-italic">I</span>
          <span class="menu-item-text">Italic</span>
          <span class="menu-shortcut">Ctrl+I</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.isUnderline()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleUnderline()">
          <span class="menu-item-glyph font-underline">U</span>
          <span class="menu-item-text">Underline</span>
          <span class="menu-shortcut">Ctrl+U</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.isStrike()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleStrike()">
          <span class="menu-item-glyph font-strike">S</span>
          <span class="menu-item-text">Strikethrough</span>
          <span class="menu-shortcut">Ctrl+Shift+S</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.isCode()"
                (click)="svc.toggleCode()">
          <span class="menu-item-glyph font-mono">&lt;/&gt;</span>
          <span class="menu-item-text">Code</span>
          <span class="menu-shortcut">Ctrl+Shift+M</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.isSubscript()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleSubscript()">
          <span class="menu-item-glyph">X<sub>1</sub></span>
          <span class="menu-item-text">Subscript</span>
          <span class="menu-shortcut">Ctrl+Shift+,</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.isSuperscript()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleSuperscript()">
          <span class="menu-item-glyph">X<sup>1</sup></span>
          <span class="menu-item-text">Superscript</span>
          <span class="menu-shortcut">Ctrl+Shift+.</span>
        </button>
        <mat-divider />
        <button mat-menu-item (click)="svc.clearFormatting()">
          <span class="menu-item-glyph">⌧</span>
          <span class="menu-item-text">Clear formatting</span>
          <span class="menu-shortcut">Ctrl+\\</span>
        </button>
      </mat-menu>

      <!-- 3. Lists Dropdown (:= ▾) -->
      <button type="button"
              class="ink-tb-btn"
              [class.active]="svc.block().list !== null"
              [matMenuTriggerFor]="listMenu"
              aria-label="Lists"
              matTooltip="Lists">
        <span class="tb-glyph">{{ currentListGlyph() }}</span>
        <mat-icon class="caret">arrow_drop_down</mat-icon>
      </button>
      <mat-menu #listMenu="matMenu">
        <button mat-menu-item
                [class.selected]="svc.block().list === 'bullet_list'"
                (click)="svc.toggleList('bullet_list')">
          <span class="menu-item-glyph">:=</span>
          <span class="menu-item-text">Bulleted list</span>
          <span class="menu-shortcut">Ctrl+Shift+8</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.block().list === 'ordered_list'"
                (click)="svc.toggleList('ordered_list')">
          <span class="menu-item-glyph">½=</span>
          <span class="menu-item-text">Numbered list</span>
          <span class="menu-shortcut">Ctrl+Shift+7</span>
        </button>
        <button mat-menu-item
                [class.selected]="svc.block().list === 'task_list'"
                (click)="svc.toggleList('task_list')">
          <span class="menu-item-glyph">☑</span>
          <span class="menu-item-text">Task list</span>
          <span class="menu-shortcut">Ctrl+Shift+6</span>
        </button>
      </mat-menu>

      <div class="tb-divider"></div>

      <!-- 4. Text Color Picker Popover (A) -->
      <button type="button"
              class="ink-tb-btn color-trigger-btn"
              [class.active]="!!svc.currentColor()"
              aria-label="Text color"
              matTooltip="Text color"
              [disabled]="svc.isCode()"
              [matMenuTriggerFor]="colorMenu">
        <span class="tb-glyph font-bold">A</span>
        <span class="color-indicator-bar" [style.background-color]="svc.currentColor() || '#ffffff'"></span>
      </button>
      <mat-menu #colorMenu="matMenu">
        <div class="ink-color-popover" (click)="$event.stopPropagation()">
          <div class="ink-color-title">Text color</div>
          <div class="ink-color-grid">
            @for (c of textColors; track c.value) {
              <button type="button"
                      class="ink-color-swatch"
                      [class.light]="c.isLight"
                      [class.active]="svc.currentColor() === c.value"
                      [style.background-color]="c.value"
                      [attr.title]="c.name"
                      (click)="svc.setTextColor(c.value)">
                @if (svc.currentColor() === c.value) {
                  <mat-icon class="swatch-check">check</mat-icon>
                }
              </button>
            }
          </div>
          <button type="button" class="ink-remove-color-btn" (click)="svc.removeTextColor()">
            Remove color
          </button>
        </div>
      </mat-menu>

      <!-- 5. Dual-Tab Image Popover (🖼️) -->
      <button mat-icon-button
              class="ink-tb-icon-btn"
              aria-label="Insert Image"
              matTooltip="Image"
              [matMenuTriggerFor]="imageMenu">
        <mat-icon>image</mat-icon>
      </button>
      <mat-menu #imageMenu="matMenu">
        <div class="ink-image-popover" (click)="$event.stopPropagation()">
          <div class="ink-image-tabs">
            <button type="button"
                    class="ink-tab-btn"
                    [class.active]="imageTab === 'file'"
                    (click)="imageTab = 'file'">
              File
            </button>
            <button type="button"
                    class="ink-tab-btn"
                    [class.active]="imageTab === 'link'"
                    (click)="imageTab = 'link'">
              Link
            </button>
          </div>

          <div class="ink-tab-content">
            @if (imageTab === 'file') {
              <input type="file"
                     #fileInput
                     style="display:none"
                     accept="image/*"
                     (change)="onFileSelected($event)">
              <button type="button"
                      class="ink-image-upload-box"
                      (click)="fileInput.click()">
                <mat-icon>cloud_upload</mat-icon>
                <span>Upload an image</span>
              </button>
            } @else {
              <input type="url"
                     class="ink-image-url-input"
                     [(ngModel)]="imageUrl"
                     placeholder="Paste image URL (https://...)">
              <button type="button"
                      class="ink-image-submit-btn"
                      [disabled]="!imageUrl.trim()"
                      (click)="embedImageLink()">
                Embed image
              </button>
            }
          </div>
        </div>
      </mat-menu>

      <!-- 6. Code Block Button (</>) -->
      <button mat-icon-button
              class="ink-tb-icon-btn"
              [class.active]="svc.block().type === 'code_block'"
              aria-label="Code block"
              matTooltip="Code block"
              (click)="svc.codeBlock()">
        <mat-icon>code</mat-icon>
      </button>

      <!-- 7. Emoji Picker Popover (🙂) -->
      <button mat-icon-button
              class="ink-tb-icon-btn"
              aria-label="Insert emoji"
              matTooltip="Emoji"
              [matMenuTriggerFor]="emojiMenu">
        <mat-icon>sentiment_satisfied</mat-icon>
      </button>
      <mat-menu #emojiMenu="matMenu">
        <div class="ink-emoji-popover" (click)="$event.stopPropagation()">
          <div class="ink-emoji-title">Emojis</div>
          <div class="ink-emoji-grid">
            @for (em of emojis; track em) {
              <button type="button"
                      class="ink-emoji-btn"
                      (click)="svc.insertText(em)">
                {{ em }}
              </button>
            }
          </div>
        </div>
      </mat-menu>

      <!-- 8. Insert Dropdown (+) -->
      <button mat-icon-button
              class="ink-tb-icon-btn"
              aria-label="Insert content"
              matTooltip="Insert"
              [matMenuTriggerFor]="insertMenu">
        <mat-icon>add</mat-icon>
      </button>
      <mat-menu #insertMenu="matMenu">
        <button mat-menu-item (click)="svc.blockquote()">
          <mat-icon>format_quote</mat-icon>
          <span class="menu-item-text">Quote block</span>
        </button>
        <button mat-menu-item (click)="svc.insertCallout('info')">
          <mat-icon color="primary">info</mat-icon>
          <span class="menu-item-text">Info callout</span>
        </button>
        <button mat-menu-item (click)="svc.insertCallout('warning')">
          <mat-icon>warning</mat-icon>
          <span class="menu-item-text">Warning callout</span>
        </button>
        <button mat-menu-item (click)="svc.insertCallout('success')">
          <mat-icon>check_circle</mat-icon>
          <span class="menu-item-text">Success callout</span>
        </button>
        <button mat-menu-item (click)="svc.insertCallout('danger')">
          <mat-icon color="warn">error</mat-icon>
          <span class="menu-item-text">Danger callout</span>
        </button>
        <mat-divider />
        <button mat-menu-item (click)="svc.insertTable(3, 3)">
          <mat-icon>table_chart</mat-icon>
          <span class="menu-item-text">Table (3x3)</span>
        </button>
        <button mat-menu-item (click)="svc.insertDivider()">
          <mat-icon>horizontal_rule</mat-icon>
          <span class="menu-item-text">Horizontal rule</span>
        </button>
      </mat-menu>

      <!-- 9. Link Button (🔗) -->
      <button mat-icon-button
              class="ink-tb-icon-btn"
              aria-label="Link"
              matTooltip="Link (Ctrl+K)"
              [class.active]="svc.isLink()"
              (click)="promptLink()">
        <mat-icon>link</mat-icon>
      </button>

      <!-- 10. Table Context Tools (When cursor is inside table) -->
      @if (svc.isInTable()) {
        <button mat-icon-button
                class="ink-tb-icon-btn active"
                aria-label="Table options"
                matTooltip="Table tools"
                [matMenuTriggerFor]="tableMenu">
          <mat-icon>table_rows</mat-icon>
        </button>
        <mat-menu #tableMenu="matMenu">
          <button mat-menu-item (click)="svc.addRow()">
            <mat-icon>add</mat-icon>
            <span class="menu-item-text">Insert row below</span>
          </button>
          <button mat-menu-item (click)="svc.deleteRow()">
            <mat-icon>delete</mat-icon>
            <span class="menu-item-text">Delete row</span>
          </button>
          <button mat-menu-item (click)="svc.addColumn()">
            <mat-icon>add</mat-icon>
            <span class="menu-item-text">Insert column right</span>
          </button>
          <button mat-menu-item (click)="svc.deleteColumn()">
            <mat-icon>delete</mat-icon>
            <span class="menu-item-text">Delete column</span>
          </button>
          <mat-divider />
          <button mat-menu-item (click)="svc.deleteTable()">
            <mat-icon color="warn">delete_forever</mat-icon>
            <span class="menu-item-text">Delete table</span>
          </button>
        </mat-menu>
      }

      <span class="toolbar-spacer"></span>

      <!-- 11. Undo / Redo / History Buttons -->
      <button mat-icon-button
              class="ink-tb-icon-btn"
              aria-label="Undo"
              matTooltip="Undo (Ctrl+Z)"
              [disabled]="!svc.canUndo()"
              (click)="svc.undo()">
        <mat-icon>undo</mat-icon>
      </button>
      <button mat-icon-button
              class="ink-tb-icon-btn"
              aria-label="Redo"
              matTooltip="Redo (Ctrl+Y)"
              [disabled]="!svc.canRedo()"
              (click)="svc.redo()">
        <mat-icon>redo</mat-icon>
      </button>
      <button mat-icon-button
              class="ink-tb-icon-btn"
              aria-label="History"
              matTooltip="History"
              (click)="openHistory()">
        <mat-icon>history</mat-icon>
      </button>
    </div>
  `,
  styles: `
    .ink-toolbar {
      display: flex;
      align-items: center;
      gap: 3px;
      padding: 4px 8px;
      border-bottom: 1px solid #2e3036;
      background: #18191c;
      flex-wrap: wrap;
    }
    .tb-divider {
      width: 1px;
      height: 20px;
      background: #2e3036;
      margin: 0 4px;
    }
    .toolbar-spacer {
      flex: 1;
    }
    .ink-tb-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 1px;
      height: 32px;
      padding: 0 6px;
      border-radius: 6px;
      border: 1px solid transparent;
      background: transparent;
      color: #94a3b8;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.12s ease;

      &:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #f1f5f9;
      }

      &.active {
        background: #172c47;
        color: #60a5fa;
        border-color: #1e3a5f;
      }

      .tb-glyph {
        font-size: 15px;
        line-height: 1;
        display: inline-flex;
        align-items: center;
      }

      .caret {
        font-size: 18px;
        width: 18px;
        height: 18px;
        opacity: 0.8;
        margin-left: -2px;
      }
    }
    .ink-tb-icon-btn {
      width: 32px !important;
      height: 32px !important;
      padding: 0 !important;
      border-radius: 6px !important;
      color: #94a3b8 !important;

      &:hover {
        background: rgba(255, 255, 255, 0.08) !important;
        color: #f1f5f9 !important;
      }

      &.active {
        background: #172c47 !important;
        color: #60a5fa !important;
      }

      mat-icon {
        font-size: 18px !important;
        width: 18px !important;
        height: 18px !important;
      }
    }
    .color-trigger-btn {
      position: relative;
      flex-direction: column;
      padding: 0 8px;

      .color-indicator-bar {
        position: absolute;
        bottom: 3px;
        left: 6px;
        right: 6px;
        height: 2px;
        border-radius: 1px;
      }
    }
    .font-bold { font-weight: 700; }
    .font-italic { font-style: italic; font-weight: 600; }
    .font-underline { text-decoration: underline; font-weight: 600; }
    .font-strike { text-decoration: line-through; font-weight: 600; }
    .font-mono { font-family: monospace; font-size: 13px; font-weight: 700; }
  `,
})
export class ToolbarComponent {
  protected readonly svc = inject(EditorService);
  protected readonly textColors: ColorSwatch[] = TEXT_COLORS;
  protected readonly emojis: string[] = COMMON_EMOJIS;

  protected imageTab: 'file' | 'link' = 'file';
  protected imageUrl = '';

  protected currentBlockGlyph(): string {
    const b = this.svc.block();
    if (b.type === 'heading') {
      return `H${b.level}`;
    }
    if (this.svc.isSmall()) {
      return 'Ts';
    }
    if (b.type === 'code_block') {
      return '</>';
    }
    return 'T';
  }

  protected currentListGlyph(): string {
    const l = this.svc.block().list;
    if (l === 'ordered_list') return '½=';
    if (l === 'task_list') return '☑';
    return ':=';
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

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.svc.insertImage(file);
      input.value = '';
    }
  }

  protected embedImageLink(): void {
    if (this.imageUrl.trim()) {
      this.svc.insertImage(this.imageUrl.trim());
      this.imageUrl = '';
    }
  }

  protected openHistory(): void {
    // Snapshot revision history
  }
}
