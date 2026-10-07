import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EditorService } from '../editor.service';
import { ThemeService } from '../../core/theme.service';
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
      <!-- 1. History Group (Undo / Redo) -->
      <div class="tb-group" role="group" aria-label="History">
        <button type="button"
                class="ink-tb-icon-btn"
                [disabled]="!svc.canUndo()"
                (click)="svc.undo()"
                aria-label="Undo"
                matTooltip="Undo (Ctrl+Z)">
          <mat-icon>undo</mat-icon>
        </button>
        <button type="button"
                class="ink-tb-icon-btn"
                [disabled]="!svc.canRedo()"
                (click)="svc.redo()"
                aria-label="Redo"
                matTooltip="Redo (Ctrl+Y)">
          <mat-icon>redo</mat-icon>
        </button>
      </div>

      <div class="tb-divider"></div>

      <!-- 2. Text Hierarchy / Block Type -->
      <div class="tb-group" role="group" aria-label="Block style">
        <button type="button"
                class="ink-tb-block-btn"
                [class.active]="svc.block().type !== 'paragraph' || svc.isSmall()"
                [matMenuTriggerFor]="blockMenu"
                aria-label="Text block style"
                matTooltip="Text style (Ctrl+Alt+0..6)">
          <span class="block-glyph">{{ currentBlockGlyph() }}</span>
          <span class="block-label">{{ currentBlockLabel() }}</span>
          <mat-icon class="caret">expand_more</mat-icon>
        </button>

        <mat-menu #blockMenu="matMenu" class="ink-toolbar-mat-menu">
          <button mat-menu-item
                  [class.selected]="svc.block().type === 'paragraph' && !svc.isSmall()"
                  (click)="svc.paragraph()">
            <span class="menu-item-glyph">¶</span>
            <span class="menu-item-text">Paragraph</span>
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
            <span class="menu-item-glyph heading-glyph">H1</span>
            <span class="menu-item-text heading-h1">Heading 1</span>
            <span class="menu-shortcut">Ctrl+Alt+1</span>
          </button>
          <button mat-menu-item
                  [class.selected]="svc.block().type === 'heading' && svc.block().level === 2"
                  (click)="svc.heading(2)">
            <span class="menu-item-glyph heading-glyph">H2</span>
            <span class="menu-item-text heading-h2">Heading 2</span>
            <span class="menu-shortcut">Ctrl+Alt+2</span>
          </button>
          <button mat-menu-item
                  [class.selected]="svc.block().type === 'heading' && svc.block().level === 3"
                  (click)="svc.heading(3)">
            <span class="menu-item-glyph heading-glyph">H3</span>
            <span class="menu-item-text heading-h3">Heading 3</span>
            <span class="menu-shortcut">Ctrl+Alt+3</span>
          </button>
          <button mat-menu-item
                  [class.selected]="svc.block().type === 'heading' && svc.block().level === 4"
                  (click)="svc.heading(4)">
            <span class="menu-item-glyph heading-glyph">H4</span>
            <span class="menu-item-text heading-h4">Heading 4</span>
            <span class="menu-shortcut">Ctrl+Alt+4</span>
          </button>
          <button mat-menu-item
                  [class.selected]="svc.block().type === 'heading' && svc.block().level === 5"
                  (click)="svc.heading(5)">
            <span class="menu-item-glyph heading-glyph">H5</span>
            <span class="menu-item-text heading-h5">Heading 5</span>
            <span class="menu-shortcut">Ctrl+Alt+5</span>
          </button>
          <button mat-menu-item
                  [class.selected]="svc.block().type === 'heading' && svc.block().level === 6"
                  (click)="svc.heading(6)">
            <span class="menu-item-glyph heading-glyph">H6</span>
            <span class="menu-item-text heading-h6">Heading 6</span>
            <span class="menu-shortcut">Ctrl+Alt+6</span>
          </button>
        </mat-menu>
      </div>

      <div class="tb-divider"></div>

      <!-- 3. Primary Formatting Group (Bold, Italic, Underline, Strikethrough, Code, Color, More) -->
      <div class="tb-group" role="group" aria-label="Text formatting">
        <button type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.isBold()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleBold()"
                aria-label="Bold"
                matTooltip="Bold (Ctrl+B)">
          <mat-icon>format_bold</mat-icon>
        </button>
        <button type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.isItalic()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleItalic()"
                aria-label="Italic"
                matTooltip="Italic (Ctrl+I)">
          <mat-icon>format_italic</mat-icon>
        </button>
        <button type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.isUnderline()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleUnderline()"
                aria-label="Underline"
                matTooltip="Underline (Ctrl+U)">
          <mat-icon>format_underlined</mat-icon>
        </button>
        <button type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.isStrike()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleStrike()"
                aria-label="Strikethrough"
                matTooltip="Strikethrough (Ctrl+Shift+S)">
          <mat-icon>strikethrough_s</mat-icon>
        </button>
        <button type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.isCode()"
                (click)="svc.toggleCode()"
                aria-label="Inline code"
                matTooltip="Inline code (Ctrl+Shift+M)">
          <mat-icon>code</mat-icon>
        </button>

        <!-- Text Color Popover Trigger -->
        <button type="button"
                class="ink-tb-icon-btn color-trigger-btn"
                [class.active]="!!svc.currentColor()"
                aria-label="Text color"
                matTooltip="Text color"
                [disabled]="svc.isCode()"
                [matMenuTriggerFor]="colorMenu">
          <mat-icon [style.color]="svc.currentColor() ">format_color_text</mat-icon>
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
              Reset to default color
            </button>
          </div>
        </mat-menu>

        <!-- More Text Formatting Dropdown -->
        <button type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.isSubscript() || svc.isSuperscript()"
                [matMenuTriggerFor]="moreFormatMenu"
                aria-label="More formatting options"
                matTooltip="More options">
          <mat-icon>more_vert</mat-icon>
        </button>
        <mat-menu #moreFormatMenu="matMenu" class="ink-toolbar-mat-menu">
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
            <mat-icon>format_clear</mat-icon>
            <span class="menu-item-text">Clear formatting</span>
            <span class="menu-shortcut">Ctrl+\\</span>
          </button>
        </mat-menu>
      </div>

      <div class="tb-divider"></div>

      <!-- 4. Lists Group -->
      <div class="tb-group" role="group" aria-label="Lists">
        <button type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.block().list === 'bullet_list'"
                (click)="svc.toggleList('bullet_list')"
                aria-label="Bulleted list"
                matTooltip="Bulleted list (Ctrl+Shift+8)">
          <mat-icon>format_list_bulleted</mat-icon>
        </button>
        <button type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.block().list === 'ordered_list'"
                (click)="svc.toggleList('ordered_list')"
                aria-label="Numbered list"
                matTooltip="Numbered list (Ctrl+Shift+7)">
          <mat-icon>format_list_numbered</mat-icon>
        </button>
        <button type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.block().list === 'task_list'"
                (click)="svc.toggleList('task_list')"
                aria-label="Task list"
                matTooltip="Task list (Ctrl+Shift+6)">
          <mat-icon>checklist</mat-icon>
        </button>
      </div>

      <div class="tb-divider"></div>

      <!-- 5. Rich Blocks Group (Quote, Code block, Divider) -->
      <div class="tb-group" role="group" aria-label="Blocks">
        <button type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.block().type === 'blockquote'"
                (click)="svc.blockquote()"
                aria-label="Quote block"
                matTooltip="Quote block">
          <mat-icon>format_quote</mat-icon>
        </button>
        <button type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.block().type === 'code_block'"
                (click)="svc.codeBlock()"
                aria-label="Code block"
                matTooltip="Code block">
          <mat-icon>data_object</mat-icon>
        </button>
        <button type="button"
                class="ink-tb-icon-btn"
                (click)="svc.insertDivider()"
                aria-label="Horizontal divider"
                matTooltip="Horizontal divider">
          <mat-icon>horizontal_rule</mat-icon>
        </button>
      </div>

      <div class="tb-divider"></div>

      <!-- 6. Inserts & Media Group -->
      <div class="tb-group" role="group" aria-label="Inserts and Media">
        <!-- Link Button -->
        <button type="button"
                class="ink-tb-icon-btn"
                #linkTrigger="matMenuTrigger"
                [matMenuTriggerFor]="linkMenu"
                (menuOpened)="onLinkMenuOpened()"
                aria-label="Insert link"
                matTooltip="Link (Ctrl+K)"
                [class.active]="linkTrigger.menuOpen || svc.isLink()">
          <mat-icon>link</mat-icon>
        </button>
        <mat-menu #linkMenu="matMenu">
          <div class="ink-link-popover" (click)="$event.stopPropagation()">
            <div class="ink-link-title">Link</div>
            <div class="ink-link-input-wrapper">
              <input type="url"
                     class="ink-link-url-input"
                     [(ngModel)]="linkUrl"
                     placeholder="Paste link (https://...)"
                     (keydown.enter)="applyLink(linkTrigger)">
              @if (svc.isLink() && linkUrl) {
                <a [href]="linkUrl"
                   target="_blank"
                   rel="noopener noreferrer"
                   class="ink-link-open-btn"
                   matTooltip="Open in new tab">
                  <mat-icon>open_in_new</mat-icon>
                </a>
              }
            </div>
            <div class="ink-link-actions">
              <button type="button"
                      class="ink-link-submit-btn"
                      [disabled]="!linkUrl.trim()"
                      (click)="applyLink(linkTrigger)">
                {{ svc.isLink() ? 'Update' : 'Apply' }}
              </button>
              @if (svc.isLink()) {
                <button type="button"
                        class="ink-link-remove-btn"
                        (click)="removeLink(linkTrigger)">
                  Unlink
                </button>
              }
            </div>
          </div>
        </mat-menu>

        <!-- Image Button -->
        <button type="button"
                class="ink-tb-icon-btn"
                aria-label="Insert image"
                matTooltip="Insert image"
                [matMenuTriggerFor]="imageMenu">
          <mat-icon>image</mat-icon>
        </button>
        <mat-menu #imageMenu="matMenu" (menuOpened)="onImageMenuOpened()">
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
                       (ngModelChange)="onImageUrlChange()"
                       placeholder="Paste image URL (https://...)">
                <div class="ink-image-preview-box">
                  @if (imageUrl.trim()) {
                    @if (previewError) {
                      <div class="ink-preview-error">
                        <mat-icon>broken_image</mat-icon>
                        <span>Unable to load image</span>
                      </div>
                    } @else {
                      <img [src]="imageUrl.trim()"
                           alt="Preview"
                           class="ink-preview-img"
                           referrerpolicy="no-referrer"
                           (error)="previewError = true"
                           (load)="previewError = false">
                    }
                  } @else {
                    <div class="ink-preview-placeholder">
                      <mat-icon>image</mat-icon>
                      <span>Image preview</span>
                    </div>
                  }
                </div>
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

        <!-- Table Insert Dropdown -->
        <button type="button"
                class="ink-tb-icon-btn"
                aria-label="Insert table"
                matTooltip="Insert table"
                [matMenuTriggerFor]="insertTableMenu">
          <mat-icon>table_chart</mat-icon>
        </button>
        <mat-menu #insertTableMenu="matMenu" class="ink-toolbar-mat-menu">
          <button mat-menu-item (click)="svc.insertTable(3, 3)">
            <mat-icon>table_chart</mat-icon>
            <span class="menu-item-text">Standard table (3×3)</span>
          </button>
          <button mat-menu-item (click)="svc.insertTable(2, 2)">
            <mat-icon>grid_view</mat-icon>
            <span class="menu-item-text">Compact table (2×2)</span>
          </button>
          <button mat-menu-item (click)="svc.insertTable(4, 4)">
            <mat-icon>grid_on</mat-icon>
            <span class="menu-item-text">Large table (4×4)</span>
          </button>
        </mat-menu>

        <!-- Callout Dropdown -->
        <button type="button"
                class="ink-tb-icon-btn"
                aria-label="Insert callout"
                matTooltip="Callout box"
                [matMenuTriggerFor]="calloutMenu">
          <mat-icon>announcement</mat-icon>
        </button>
        <mat-menu #calloutMenu="matMenu" class="ink-toolbar-mat-menu">
          <button mat-menu-item (click)="svc.insertCallout('info')">
            <mat-icon style="color: #60a5fa;">info</mat-icon>
            <span class="menu-item-text">Info callout</span>
          </button>
          <button mat-menu-item (click)="svc.insertCallout('warning')">
            <mat-icon style="color: #fbbf24;">warning</mat-icon>
            <span class="menu-item-text">Warning callout</span>
          </button>
          <button mat-menu-item (click)="svc.insertCallout('success')">
            <mat-icon style="color: #34d399;">check_circle</mat-icon>
            <span class="menu-item-text">Success callout</span>
          </button>
          <button mat-menu-item (click)="svc.insertCallout('danger')">
            <mat-icon style="color: #f87171;">error</mat-icon>
            <span class="menu-item-text">Danger callout</span>
          </button>
        </mat-menu>

        <!-- Emoji Picker -->
        <button type="button"
                class="ink-tb-icon-btn"
                aria-label="Insert emoji"
                matTooltip="Insert emoji"
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
      </div>


      <span class="toolbar-spacer"></span>

      <!-- 8. Document History & Theme Toggle -->
      <div class="tb-group" role="group" aria-label="Editor settings">
        <button type="button"
                class="ink-tb-icon-btn"
                aria-label="Revision history"
                matTooltip="Revision history"
                (click)="openHistory()">
          <mat-icon>history</mat-icon>
        </button>
        <button type="button"
                class="ink-tb-icon-btn ink-tb-theme-toggle"
                [attr.aria-label]="themeService.theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
                [matTooltip]="themeService.theme() === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'"
                (click)="themeService.toggleTheme()">
          <mat-icon>{{ themeService.theme() === 'dark' ? 'light_mode' : 'dark_mode' }}</mat-icon>
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      flex-shrink: 0;
      position: relative;
      z-index: 20;
    }

    .ink-toolbar {
      display: flex;
      align-items: center;
      gap: 4px 3px;
      padding: 6px 10px;
      border-bottom: 1px solid var(--ink-border-default, #2e3036);
      background: var(--ink-bg-toolbar, #18191c);
      flex-wrap: nowrap;
      overflow-x: auto;
      scrollbar-width: none;
      &::-webkit-scrollbar {
        display: none;
      }
      user-select: none;
      box-sizing: border-box;
      min-height: 44px;
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }

    .tb-group {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
    }

    .tb-divider {
      width: 1px;
      height: 20px;
      background: var(--ink-border-default, #2e3036);
      margin: 0 4px;
      flex-shrink: 0;
      transition: background-color 0.15s ease;
    }

    .toolbar-spacer {
      flex: 1;
      min-width: 6px;
    }

    /* Block dropdown selector */
    .ink-tb-block-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      padding: 0 6px 0 8px;
      border-radius: 6px;
      border: 1px solid var(--ink-border-default, rgba(255, 255, 255, 0.06));
      background: var(--ink-btn-hover-bg, rgba(255, 255, 255, 0.04));
      color: var(--ink-text-secondary, #cbd5e1);
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.14s ease;

      &:hover {
        background: var(--ink-btn-hover-bg);
        border-color: var(--ink-border-focus);
        color: var(--ink-text-primary, #f8fafc);
      }

      &.active {
        background: var(--ink-btn-active-bg, #172c47);
        color: var(--ink-btn-active-text, #60a5fa);
        border-color: var(--ink-btn-active-border, #1e3a5f);
      }

      .block-glyph {
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
        padding: 2px 4px;
        border-radius: 3px;
        background: var(--ink-btn-hover-bg, rgba(255, 255, 255, 0.08));
        color: var(--ink-text-secondary, #94a3b8);
      }

      .block-label {
        font-size: 13px;
        min-width: 68px;
        max-width: 95px;
        text-align: left;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .caret {
        font-size: 18px;
        width: 18px;
        height: 18px;
        opacity: 0.7;
        margin-left: -2px;
      }
    }

    /* Standard icon button */
    .ink-tb-icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border-radius: 6px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--ink-text-secondary, #94a3b8);
      cursor: pointer;
      transition: all 0.12s ease;

      &:hover:not(:disabled) {
        background: var(--ink-btn-hover-bg, rgba(255, 255, 255, 0.08));
        color: var(--ink-text-primary, #f8fafc);
      }

      &.active {
        background: var(--ink-btn-active-bg, #172c47);
        color: var(--ink-btn-active-text, #60a5fa);
        border-color: var(--ink-btn-active-border, #1e3a5f);
      }

      &:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }

      &.ink-tb-theme-toggle {
        mat-icon {
          transition: color 0.15s ease;
        }
      }

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        line-height: 18px;
      }
    }

    /* Text color picker button */
    .color-trigger-btn {
      position: relative;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        margin-bottom: 3px;
      }

      .color-indicator-bar {
        position: absolute;
        bottom: 3px;
        left: 6px;
        right: 6px;
        height: 3px;
        border-radius: 2px;
        transition: background-color 0.15s ease;
      }
    }


    /* Typography helper classes for menu items */
    .heading-h1 { font-size: 15px; font-weight: 700; }
    .heading-h2 { font-size: 14px; font-weight: 600; }
    .heading-h3 { font-size: 13.5px; font-weight: 600; }
    .heading-h4 { font-size: 13px; font-weight: 600; }
    .heading-h5 { font-size: 12.5px; font-weight: 600; }
    .heading-h6 { font-size: 12px; font-weight: 600; }
    .small-text { font-size: 12px; }
  `,
})
export class ToolbarComponent {
  protected readonly svc = inject(EditorService);
  protected readonly themeService = inject(ThemeService);
  protected readonly textColors: ColorSwatch[] = TEXT_COLORS;
  protected readonly emojis: string[] = COMMON_EMOJIS;

  protected imageTab: 'file' | 'link' = 'file';
  protected imageUrl = '';
  protected previewError = false;
  protected linkUrl = '';

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
    return 'Paragraph';
  }

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
    return '¶';
  }

  protected onImageUrlChange(): void {
    this.previewError = false;
  }

  protected onImageMenuOpened(): void {
    this.previewError = false;
  }

  protected onLinkMenuOpened(): void {
    this.linkUrl = this.svc.getLinkHref() || '';
  }

  protected applyLink(trigger: MatMenuTrigger): void {
    if (this.linkUrl.trim()) {
      this.svc.setLink(this.linkUrl.trim());
      trigger.closeMenu();
    }
  }

  protected removeLink(trigger: MatMenuTrigger): void {
    this.svc.removeLink();
    this.linkUrl = '';
    trigger.closeMenu();
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
      this.previewError = false;
    }
  }

  protected openHistory(): void {
    this.svc.requestOpenHistory();
  }
}
