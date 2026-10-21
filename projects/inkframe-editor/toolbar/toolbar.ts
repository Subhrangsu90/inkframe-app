import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  EditorService,
  KeepMenuOpen,
  ThemeService,
  TEXT_COLORS,
  HIGHLIGHT_COLORS,
  TEXT_ALIGN_OPTIONS,
  COMMON_EMOJIS,
  ColorSwatch,
  focusLinkInput,
  textAlignIcon,
  BULLET_STYLES,
  NUMBER_STYLES,
  MAX_LIST_START,
  defaultNumberStyle,
  FONT_SIZES,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  FONT_FAMILIES,
  findFontFamily,
  findDocumentFont,
  LINE_SPACINGS,
} from '@inkframe-ui/editor/core';

let nextToolbarId = 0;

/** A font size in whole pixels, MIN_FONT_SIZE to MAX_FONT_SIZE. */
function clampFontSize(size: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
}

@Component({
  selector: 'ink-toolbar',

  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatMenuModule,
    MatTooltipModule,
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    KeepMenuOpen,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="ink-toolbar-wrapper"
      [class.can-scroll-left]="canScrollLeft()"
      [class.can-scroll-right]="canScrollRight()"
    >
      @if (canScrollLeft()) {
        <button
          type="button"
          class="ink-tb-scroll-btn ink-tb-scroll-left"
          (click)="scrollByOffset(-180)"
          aria-label="Scroll toolbar left"
          tabindex="-1"
        >
          <mat-icon>chevron_left</mat-icon>
        </button>
      }

      <!-- mousedown: a click or tap must not move focus out of the document, which would close the on-screen keyboard. -->
      <div
        #toolbarEl
        class="ink-toolbar"
        role="toolbar"
        aria-label="Editor toolbar"
        (scroll)="onToolbarScroll()"
        (mousedown)="$event.preventDefault()"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
        (pointerup)="onPointerUp()"
        (pointercancel)="onPointerCancel()"
      >
        <!-- 1. History Group (Undo / Redo) -->
        @if (svc.hasExtension('history')) {
          <div class="tb-group" role="group" aria-label="History">
            <button
              type="button"
              class="ink-tb-icon-btn"
              [disabled]="!svc.canUndo()"
              (click)="svc.undo()"
              aria-label="Undo"
              matTooltip="Undo (Ctrl+Z)"
            >
              <mat-icon>undo</mat-icon>
            </button>
            <button
              type="button"
              class="ink-tb-icon-btn"
              [disabled]="!svc.canRedo()"
              (click)="svc.redo()"
              aria-label="Redo"
              matTooltip="Redo (Ctrl+Y)"
            >
              <mat-icon>redo</mat-icon>
            </button>
          </div>
          <div class="tb-divider"></div>
        }

        <!-- 2. Text Hierarchy / Block Type -->
        @if (
          svc.hasExtension('heading') || svc.hasExtension('paragraph') || svc.hasExtension('small')
        ) {
          <div class="tb-group" role="group" aria-label="Block style">
            <button
              type="button"
              class="ink-tb-block-btn"
              [class.active]="svc.block().type !== 'paragraph' || svc.isSmall()"
              [matMenuTriggerFor]="blockMenu"
              aria-label="Text block style"
              matTooltip="Text style (Ctrl+Alt+0..6)"
            >
              <span class="block-glyph">{{ currentBlockGlyph() }}</span>
              <span class="block-label">{{ currentBlockLabel() }}</span>
              <mat-icon class="caret">expand_more</mat-icon>
            </button>

            <mat-menu #blockMenu="matMenu" class="ink-toolbar-mat-menu">
              @if (svc.hasExtension('paragraph')) {
                <button
                  mat-menu-item
                  [class.selected]="svc.block().type === 'paragraph' && !svc.isSmall()"
                  (click)="svc.paragraph()"
                >
                  <span class="menu-item-glyph">¶</span>
                  <span class="menu-item-text">Paragraph</span>
                  <span class="menu-shortcut">Ctrl+Alt+0</span>
                </button>
              }
              @if (svc.hasExtension('small')) {
                <button mat-menu-item [class.selected]="svc.isSmall()" (click)="svc.toggleSmall()">
                  <span class="menu-item-glyph">T<sub>s</sub></span>
                  <span class="menu-item-text small-text">Small text</span>
                  <span class="menu-shortcut">Ctrl+Alt+7</span>
                </button>
              }
              @if (svc.hasExtension('heading')) {
                <mat-divider />
                <button
                  mat-menu-item
                  [class.selected]="svc.block().type === 'heading' && svc.block().level === 1"
                  (click)="svc.heading(1)"
                >
                  <span class="menu-item-glyph heading-glyph">H1</span>
                  <span class="menu-item-text heading-h1">Heading 1</span>
                  <span class="menu-shortcut">Ctrl+Alt+1</span>
                </button>
                <button
                  mat-menu-item
                  [class.selected]="svc.block().type === 'heading' && svc.block().level === 2"
                  (click)="svc.heading(2)"
                >
                  <span class="menu-item-glyph heading-glyph">H2</span>
                  <span class="menu-item-text heading-h2">Heading 2</span>
                  <span class="menu-shortcut">Ctrl+Alt+2</span>
                </button>
                <button
                  mat-menu-item
                  [class.selected]="svc.block().type === 'heading' && svc.block().level === 3"
                  (click)="svc.heading(3)"
                >
                  <span class="menu-item-glyph heading-glyph">H3</span>
                  <span class="menu-item-text heading-h3">Heading 3</span>
                  <span class="menu-shortcut">Ctrl+Alt+3</span>
                </button>
                <button
                  mat-menu-item
                  [class.selected]="svc.block().type === 'heading' && svc.block().level === 4"
                  (click)="svc.heading(4)"
                >
                  <span class="menu-item-glyph heading-glyph">H4</span>
                  <span class="menu-item-text heading-h4">Heading 4</span>
                  <span class="menu-shortcut">Ctrl+Alt+4</span>
                </button>
                <button
                  mat-menu-item
                  [class.selected]="svc.block().type === 'heading' && svc.block().level === 5"
                  (click)="svc.heading(5)"
                >
                  <span class="menu-item-glyph heading-glyph">H5</span>
                  <span class="menu-item-text heading-h5">Heading 5</span>
                  <span class="menu-shortcut">Ctrl+Alt+5</span>
                </button>
                <button
                  mat-menu-item
                  [class.selected]="svc.block().type === 'heading' && svc.block().level === 6"
                  (click)="svc.heading(6)"
                >
                  <span class="menu-item-glyph heading-glyph">H6</span>
                  <span class="menu-item-text heading-h6">Heading 6</span>
                  <span class="menu-shortcut">Ctrl+Alt+6</span>
                </button>
              }
            </mat-menu>
          </div>
          <div class="tb-divider"></div>
        }

        <!-- Font and font size -->
        @if (svc.hasExtension('fontFamily') || svc.hasExtension('fontSize')) {
          <div class="tb-group" role="group" aria-label="Font">
            @if (svc.hasExtension('fontFamily')) {
              <button
                type="button"
                class="ink-tb-block-btn ink-tb-font-btn"
                [disabled]="svc.isCode()"
                [matMenuTriggerFor]="fontMenu"
                [attr.aria-label]="'Font: ' + fontLabel()"
                matTooltip="Font"
              >
                <span class="block-label">{{ fontLabel() }}</span>
                <mat-icon class="caret">expand_more</mat-icon>
              </button>
              <mat-menu #fontMenu="matMenu" class="ink-toolbar-mat-menu ink-font-menu">
                <button
                  mat-menu-item
                  [class.selected]="!svc.fontFamily()"
                  (click)="svc.setFontFamily(null)"
                >
                  <span class="menu-item-text">Default ({{ documentFontLabel() }})</span>
                </button>
                <mat-divider />
                @for (font of fontFamilies; track font.value) {
                  <button
                    mat-menu-item
                    [class.selected]="svc.fontFamily() === font.value"
                    (click)="svc.setFontFamily(font.value)"
                  >
                    <span class="menu-item-text" [style.font-family]="font.stack">{{
                      font.label
                    }}</span>
                  </button>
                }
              </mat-menu>
            }

            <!-- Font size: − and + change it by a pixel; the box takes a size typed in or picked from its list -->
            @if (svc.hasExtension('fontSize')) {
              <div class="ink-tb-size-control">
                <button
                  type="button"
                  class="ink-tb-icon-btn ink-tb-step-btn"
                  [disabled]="!canStepFontSize(-1)"
                  (click)="stepFontSize(-1)"
                  aria-label="Decrease font size"
                  matTooltip="Decrease font size"
                >
                  <mat-icon>remove</mat-icon>
                </button>
                <!-- mousedown: unlike the buttons, the box takes focus, to be typed in. -->
                <input
                  #sizeInput
                  cdkOverlayOrigin
                  #sizeOrigin="cdkOverlayOrigin"
                  type="text"
                  inputmode="numeric"
                  autocomplete="off"
                  class="ink-tb-size-input"
                  role="combobox"
                  aria-label="Font size"
                  aria-autocomplete="none"
                  [attr.aria-expanded]="sizeListOpen()"
                  [attr.aria-controls]="sizeListId"
                  [attr.aria-activedescendant]="
                    sizeListOpen() && activeSize() >= 0 ? sizeListId + '-' + activeSize() : null
                  "
                  matTooltip="Font size"
                  [matTooltipDisabled]="sizeListOpen()"
                  [disabled]="svc.isCode()"
                  [value]="sizeListOpen() ? sizeText() : (svc.shownFontSize() ?? '')"
                  (mousedown)="$event.stopPropagation()"
                  (focus)="openSizeList()"
                  (input)="onSizeInput($event)"
                  (keydown)="onSizeKeydown($event)"
                  (blur)="closeSizeList()"
                />
                <button
                  type="button"
                  class="ink-tb-icon-btn ink-tb-step-btn"
                  [disabled]="!canStepFontSize(1)"
                  (click)="stepFontSize(1)"
                  aria-label="Increase font size"
                  matTooltip="Increase font size"
                >
                  <mat-icon>add</mat-icon>
                </button>
              </div>
              <ng-template
                cdkConnectedOverlay
                [cdkConnectedOverlayOrigin]="sizeOrigin"
                [cdkConnectedOverlayOpen]="sizeListOpen()"
                [cdkConnectedOverlayPositions]="sizeListPositions"
                (overlayOutsideClick)="onSizeOutsideClick($event)"
                (detach)="closeSizeList()"
              >
                <!-- mousedown: picking a size must not take focus from the box before the click. -->
                <div
                  class="ink-size-list"
                  role="listbox"
                  aria-label="Font sizes"
                  [id]="sizeListId"
                  (mousedown)="$event.preventDefault()"
                >
                  @for (size of sizeOptions; track $index) {
                    <!-- Keyboard users pick with the arrow keys and Enter in the box (onSizeKeydown), so focus stays there. -->
                    <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
                    <div
                      #sizeOption
                      role="option"
                      class="ink-size-option"
                      [id]="sizeListId + '-' + $index"
                      [class.active]="activeSize() === $index"
                      [class.selected]="svc.fontSize() === size"
                      [attr.aria-selected]="svc.fontSize() === size"
                      (click)="pickFontSize(size)"
                    >
                      {{ size ?? 'Default' }}
                    </div>
                  }
                </div>
              </ng-template>
            }
          </div>
          <div class="tb-divider"></div>
        }

        <!-- 3. Primary Formatting Group (Bold, Italic, Underline, Strikethrough, Code, Color, More) -->
        @if (
          svc.hasExtension('bold') ||
          svc.hasExtension('italic') ||
          svc.hasExtension('underline') ||
          svc.hasExtension('strike') ||
          svc.hasExtension('code') ||
          svc.hasExtension('textColor') ||
          svc.hasExtension('subscript') ||
          svc.hasExtension('superscript') ||
          svc.hasExtension('clear_formatting')
        ) {
          <div class="tb-group" role="group" aria-label="Text formatting">
            @if (svc.hasExtension('bold')) {
              <button
                type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.isBold()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleBold()"
                aria-label="Bold"
                matTooltip="Bold (Ctrl+B)"
              >
                <mat-icon>format_bold</mat-icon>
              </button>
            }
            @if (svc.hasExtension('italic')) {
              <button
                type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.isItalic()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleItalic()"
                aria-label="Italic"
                matTooltip="Italic (Ctrl+I)"
              >
                <mat-icon>format_italic</mat-icon>
              </button>
            }
            @if (svc.hasExtension('underline')) {
              <button
                type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.isUnderline()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleUnderline()"
                aria-label="Underline"
                matTooltip="Underline (Ctrl+U)"
              >
                <mat-icon>format_underlined</mat-icon>
              </button>
            }
            @if (svc.hasExtension('strike')) {
              <button
                type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.isStrike()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleStrike()"
                aria-label="Strikethrough"
                matTooltip="Strikethrough (Ctrl+Shift+S)"
              >
                <mat-icon>strikethrough_s</mat-icon>
              </button>
            }
            @if (svc.hasExtension('code')) {
              <button
                type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.isCode()"
                (click)="svc.toggleCode()"
                aria-label="Inline code"
                matTooltip="Inline code (Ctrl+Shift+M)"
              >
                <mat-icon>code</mat-icon>
              </button>
            }

            <!-- Text Color Popover Trigger -->
            @if (svc.hasExtension('textColor')) {
              <button
                type="button"
                class="ink-tb-icon-btn color-trigger-btn"
                [class.active]="!!svc.currentColor()"
                aria-label="Text color"
                matTooltip="Text color"
                [disabled]="svc.isCode()"
                [matMenuTriggerFor]="colorMenu"
              >
                <mat-icon [style.color]="svc.currentColor()">format_color_text</mat-icon>
              </button>
              <mat-menu #colorMenu="matMenu">
                <div class="ink-color-popover" inkKeepMenuOpen>
                  <div class="ink-color-title">Text color</div>
                  <div class="ink-color-grid">
                    @for (c of textColors; track c.value) {
                      <button
                        type="button"
                        class="ink-color-swatch"
                        [class.light]="c.isLight"
                        [class.active]="svc.currentColor() === c.value"
                        [style.background-color]="c.value"
                        [attr.title]="c.name"
                        (click)="svc.setTextColor(c.value)"
                      >
                        @if (svc.currentColor() === c.value) {
                          <mat-icon class="swatch-check">check</mat-icon>
                        }
                      </button>
                    }
                  </div>
                  <button
                    type="button"
                    class="ink-remove-color-btn"
                    (click)="svc.removeTextColor()"
                  >
                    Reset to default color
                  </button>
                </div>
              </mat-menu>
            }

            <!-- Highlight Color Popover Trigger -->
            @if (svc.hasExtension('highlight')) {
              <button
                type="button"
                class="ink-tb-icon-btn highlight-trigger-btn"
                [class.active]="!!svc.currentHighlight()"
                aria-label="Highlight color"
                matTooltip="Highlight (Ctrl+Alt+H)"
                [disabled]="svc.isCode()"
                [matMenuTriggerFor]="highlightMenu"
              >
                <mat-icon>format_ink_highlighter</mat-icon>
                <span
                  class="highlight-indicator-bar"
                  [style.background-color]="svc.currentHighlight() || 'transparent'"
                ></span>
              </button>
              <mat-menu #highlightMenu="matMenu">
                <div class="ink-color-popover" inkKeepMenuOpen>
                  <div class="ink-color-title">Highlight</div>
                  <div class="ink-color-grid ink-highlight-grid">
                    @for (c of highlightColors; track c.value) {
                      <button
                        type="button"
                        class="ink-color-swatch light"
                        [class.active]="svc.currentHighlight() === c.value"
                        [style.background-color]="c.value"
                        [attr.title]="c.name"
                        [attr.aria-label]="c.name + ' highlight'"
                        (click)="svc.setHighlight(c.value)"
                      >
                        @if (svc.currentHighlight() === c.value) {
                          <mat-icon class="swatch-check">check</mat-icon>
                        }
                      </button>
                    }
                  </div>
                  <button
                    type="button"
                    class="ink-remove-color-btn"
                    (click)="svc.removeHighlight()"
                  >
                    Remove highlight
                  </button>
                </div>
              </mat-menu>
            }

            <!-- More Text Formatting Dropdown -->
            @if (
              svc.hasExtension('subscript') ||
              svc.hasExtension('superscript') ||
              svc.hasExtension('clear_formatting')
            ) {
              <button
                type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.isSubscript() || svc.isSuperscript()"
                [matMenuTriggerFor]="moreFormatMenu"
                aria-label="More formatting options"
                matTooltip="More options"
              >
                <mat-icon>more_vert</mat-icon>
              </button>
              <mat-menu #moreFormatMenu="matMenu" class="ink-toolbar-mat-menu">
                @if (svc.hasExtension('subscript')) {
                  <button
                    mat-menu-item
                    [class.selected]="svc.isSubscript()"
                    [disabled]="svc.isCode()"
                    (click)="svc.toggleSubscript()"
                  >
                    <span class="menu-item-glyph">X<sub>1</sub></span>
                    <span class="menu-item-text">Subscript</span>
                    <span class="menu-shortcut">Ctrl+Shift+,</span>
                  </button>
                }
                @if (svc.hasExtension('superscript')) {
                  <button
                    mat-menu-item
                    [class.selected]="svc.isSuperscript()"
                    [disabled]="svc.isCode()"
                    (click)="svc.toggleSuperscript()"
                  >
                    <span class="menu-item-glyph">X<sup>1</sup></span>
                    <span class="menu-item-text">Superscript</span>
                    <span class="menu-shortcut">Ctrl+Shift+.</span>
                  </button>
                }
                @if (svc.hasExtension('clear_formatting')) {
                  <mat-divider />
                  <button mat-menu-item (click)="svc.clearFormatting()">
                    <mat-icon>format_clear</mat-icon>
                    <span class="menu-item-text">Clear formatting</span>
                    <span class="menu-shortcut">Ctrl+\\</span>
                  </button>
                }
              </mat-menu>
            }
          </div>
          <div class="tb-divider"></div>
        }

        <!-- Paragraph: alignment and indent, line spacing -->
        @if (
          svc.hasExtension('text_align') ||
          svc.hasExtension('indent') ||
          svc.hasExtension('line_spacing')
        ) {
          <div class="tb-group" role="group" aria-label="Paragraph">
            @if (svc.hasExtension('text_align') || svc.hasExtension('indent')) {
              <button
                type="button"
                class="ink-tb-icon-btn ink-tb-align-btn"
                [class.active]="paragraphFormatted()"
                [disabled]="!svc.textAlign() && !svc.canIndent() && !svc.canOutdent()"
                [matMenuTriggerFor]="paragraphMenu"
                aria-label="Alignment and indent"
                matTooltip="Alignment and indent"
              >
                @if (svc.hasExtension('text_align')) {
                  <mat-icon>{{ alignIcon(svc.textAlign()) }}</mat-icon>
                } @else {
                  <mat-icon>format_indent_increase</mat-icon>
                }
                <mat-icon class="caret">arrow_drop_down</mat-icon>
              </button>
              <mat-menu #paragraphMenu="matMenu" class="ink-toolbar-mat-menu ink-paragraph-menu">
                @if (svc.hasExtension('text_align')) {
                  @for (option of alignOptions; track option.value) {
                    <button
                      mat-menu-item
                      [class.selected]="svc.textAlign() === option.value"
                      [disabled]="!svc.textAlign()"
                      (click)="svc.setTextAlign(option.value)"
                    >
                      <mat-icon>{{ option.icon }}</mat-icon>
                      <span class="menu-item-text">{{ option.label }}</span>
                      <span class="menu-shortcut">{{ option.shortcut }}</span>
                    </button>
                  }
                }
                @if (svc.hasExtension('indent')) {
                  @if (svc.hasExtension('text_align')) {
                    <mat-divider />
                  }
                  <button mat-menu-item [disabled]="!svc.canIndent()" (click)="svc.indent()">
                    <mat-icon>format_indent_increase</mat-icon>
                    <span class="menu-item-text">Increase indent</span>
                    <span class="menu-shortcut">Ctrl+]</span>
                  </button>
                  <button mat-menu-item [disabled]="!svc.canOutdent()" (click)="svc.outdent()">
                    <mat-icon>format_indent_decrease</mat-icon>
                    <span class="menu-item-text">Decrease indent</span>
                    <span class="menu-shortcut">Ctrl+[</span>
                  </button>
                }
              </mat-menu>
            }

            @if (svc.hasExtension('line_spacing')) {
              <button
                type="button"
                class="ink-tb-icon-btn ink-tb-spacing-btn"
                [class.active]="!!svc.lineSpacing()"
                [disabled]="!svc.canSetLineSpacing()"
                [matMenuTriggerFor]="lineSpacingMenu"
                [attr.aria-label]="'Line spacing: ' + lineSpacingLabel()"
                matTooltip="Line spacing"
              >
                <mat-icon>format_line_spacing</mat-icon>
                <mat-icon class="caret">arrow_drop_down</mat-icon>
              </button>
              <mat-menu #lineSpacingMenu="matMenu" class="ink-toolbar-mat-menu ink-spacing-menu">
                <button
                  mat-menu-item
                  [class.selected]="!svc.lineSpacing()"
                  (click)="svc.setLineSpacing(null)"
                >
                  <span class="menu-item-text">Default</span>
                </button>
                <mat-divider />
                @for (option of lineSpacings; track option.value) {
                  <button
                    mat-menu-item
                    [class.selected]="svc.lineSpacing() === option.value"
                    (click)="svc.setLineSpacing(option.value)"
                  >
                    <span class="menu-item-text">{{ option.label }}</span>
                  </button>
                }
              </mat-menu>
            }
          </div>
          <div class="tb-divider"></div>
        }

        <!-- 4. Lists Group -->
        @if (
          svc.hasExtension('bullet_list') ||
          svc.hasExtension('ordered_list') ||
          svc.hasExtension('task_list')
        ) {
          <div class="tb-group" role="group" aria-label="Lists">
            @if (svc.hasExtension('bullet_list')) {
              <button
                type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.block().list === 'bullet_list'"
                (click)="svc.toggleList('bullet_list')"
                aria-label="Bulleted list"
                matTooltip="Bulleted list (Ctrl+Shift+8)"
              >
                <mat-icon>format_list_bulleted</mat-icon>
              </button>
            }
            @if (svc.hasExtension('ordered_list')) {
              <button
                type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.block().list === 'ordered_list'"
                (click)="svc.toggleList('ordered_list')"
                aria-label="Numbered list"
                matTooltip="Numbered list (Ctrl+Shift+7)"
              >
                <mat-icon>format_list_numbered</mat-icon>
              </button>
            }
            @if (svc.hasExtension('task_list')) {
              <button
                type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.block().list === 'task_list'"
                (click)="svc.toggleList('task_list')"
                aria-label="Task list"
                matTooltip="Task list (Ctrl+Shift+6)"
              >
                <mat-icon>checklist</mat-icon>
              </button>
            }
            <button
              type="button"
              class="ink-tb-icon-btn ink-tb-list-btn"
              [disabled]="!svc.listState()"
              [matMenuTriggerFor]="listMenu"
              aria-label="List options"
              matTooltip="List options"
            >
              <mat-icon>tune</mat-icon>
              <mat-icon class="caret">arrow_drop_down</mat-icon>
            </button>
            <mat-menu #listMenu="matMenu" class="ink-toolbar-mat-menu">
              @if (svc.listState(); as list) {
                @if (list.kind === 'bullet_list') {
                  <div class="menu-section-label" role="presentation">Bullet style</div>
                  <button
                    mat-menu-item
                    [class.selected]="!list.bulletStyle"
                    (click)="svc.setBulletStyle(null)"
                  >
                    <span class="menu-item-glyph">{{ levelBullet(list.level) }}</span>
                    <span class="menu-item-text">By level</span>
                  </button>
                  @for (style of bulletStyles; track style.value) {
                    <button
                      mat-menu-item
                      [class.selected]="list.bulletStyle === style.value"
                      (click)="svc.setBulletStyle(style.value)"
                    >
                      <span class="menu-item-glyph">{{ style.glyph }}</span>
                      <span class="menu-item-text">{{ style.label }}</span>
                    </button>
                  }
                  <mat-divider />
                }
                @if (list.kind === 'ordered_list') {
                  <div class="menu-section-label" role="presentation">Numbering</div>
                  <button
                    mat-menu-item
                    [class.selected]="!list.numberStyle"
                    (click)="svc.setNumberStyle(null)"
                  >
                    <span class="menu-item-glyph">{{ levelNumber(list.level) }}</span>
                    <span class="menu-item-text">By level</span>
                  </button>
                  @for (style of numberStyles; track style.value) {
                    <button
                      mat-menu-item
                      [class.selected]="list.numberStyle === style.value"
                      (click)="svc.setNumberStyle(style.value)"
                    >
                      <span class="menu-item-glyph">{{ style.glyph }}</span>
                      <span class="menu-item-text">{{ style.label }}</span>
                    </button>
                  }
                  <mat-divider />
                  <button
                    mat-menu-item
                    [disabled]="!list.canRestart"
                    (click)="svc.restartListNumbering()"
                  >
                    <span class="menu-item-glyph">1.</span>
                    <span class="menu-item-text">Restart numbering here</span>
                  </button>
                  <button
                    mat-menu-item
                    [disabled]="!list.canContinue"
                    (click)="svc.continueListNumbering()"
                  >
                    <span class="menu-item-glyph">…</span>
                    <span class="menu-item-text">Continue previous numbering</span>
                  </button>
                  <button mat-menu-item (click)="promptListStart(list.itemNumber)">
                    <span class="menu-item-glyph">#</span>
                    <span class="menu-item-text">Set number here…</span>
                  </button>
                  <mat-divider />
                }
                @if (list.kind === 'task_list') {
                  <button mat-menu-item (click)="svc.toggleTaskChecked()">
                    <mat-icon>check_box</mat-icon>
                    <span class="menu-item-text">Mark done or not done</span>
                    <span class="menu-shortcut">Ctrl+Enter</span>
                  </button>
                  <mat-divider />
                }
                <button mat-menu-item [disabled]="!list.canIndent" (click)="svc.indentListItem()">
                  <span class="menu-item-glyph">⇥</span>
                  <span class="menu-item-text">Indent</span>
                  <span class="menu-shortcut">Tab</span>
                </button>
                <button mat-menu-item [disabled]="!list.canOutdent" (click)="svc.outdentListItem()">
                  <span class="menu-item-glyph">⇤</span>
                  <span class="menu-item-text">Outdent</span>
                  <span class="menu-shortcut">Shift+Tab</span>
                </button>
                <button mat-menu-item [disabled]="!list.canMoveUp" (click)="svc.moveListItem('up')">
                  <span class="menu-item-glyph">↑</span>
                  <span class="menu-item-text">Move up</span>
                  <span class="menu-shortcut">Alt+Shift+↑</span>
                </button>
                <button
                  mat-menu-item
                  [disabled]="!list.canMoveDown"
                  (click)="svc.moveListItem('down')"
                >
                  <span class="menu-item-glyph">↓</span>
                  <span class="menu-item-text">Move down</span>
                  <span class="menu-shortcut">Alt+Shift+↓</span>
                </button>
              }
            </mat-menu>
          </div>
          <div class="tb-divider"></div>
        }

        <!-- 5. Rich Blocks Group (Quote, Code block, Divider) -->
        @if (
          svc.hasExtension('blockquote') ||
          svc.hasExtension('code_block') ||
          svc.hasExtension('divider')
        ) {
          <div class="tb-group" role="group" aria-label="Blocks">
            @if (svc.hasExtension('blockquote')) {
              <button
                type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.block().type === 'blockquote'"
                (click)="svc.blockquote()"
                aria-label="Quote block"
                matTooltip="Quote block"
              >
                <mat-icon>format_quote</mat-icon>
              </button>
            }
            @if (svc.hasExtension('code_block')) {
              <button
                type="button"
                class="ink-tb-icon-btn"
                [class.active]="svc.block().type === 'code_block'"
                (click)="svc.codeBlock()"
                aria-label="Code block"
                matTooltip="Code block"
              >
                <mat-icon>data_object</mat-icon>
              </button>
            }
            @if (svc.hasExtension('divider')) {
              <button
                type="button"
                class="ink-tb-icon-btn"
                (click)="svc.insertDivider()"
                aria-label="Horizontal divider"
                matTooltip="Horizontal divider"
              >
                <mat-icon>horizontal_rule</mat-icon>
              </button>
            }
          </div>
          <div class="tb-divider"></div>
        }

        <!-- 6. Inserts & Media Group -->
        @if (
          svc.hasExtension('link') ||
          svc.hasExtension('image') ||
          svc.hasExtension('table') ||
          svc.hasExtension('callout')
        ) {
          <div class="tb-group" role="group" aria-label="Inserts and Media">
            <!-- Link Button -->
            @if (svc.hasExtension('link')) {
              <button
                type="button"
                class="ink-tb-icon-btn"
                #linkTrigger="matMenuTrigger"
                [matMenuTriggerFor]="linkMenu"
                (menuOpened)="onLinkMenuOpened()"
                aria-label="Insert link"
                matTooltip="Link (Ctrl+K)"
                [class.active]="linkTrigger.menuOpen || svc.isLink()"
              >
                <mat-icon>link</mat-icon>
              </button>
              <mat-menu #linkMenu="matMenu">
                <div class="ink-link-popover" inkKeepMenuOpen>
                  <div class="ink-link-title">Link</div>
                  <div class="ink-link-input-wrapper">
                    <input
                      type="url"
                      class="ink-link-url-input"
                      [(ngModel)]="linkUrl"
                      placeholder="Paste link (https://...)"
                      (keydown.enter)="applyLink(linkTrigger)"
                    />
                    @if (svc.isLink() && linkUrl) {
                      <a
                        [href]="linkUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="ink-link-open-btn"
                        matTooltip="Open in new tab"
                      >
                        <mat-icon>open_in_new</mat-icon>
                      </a>
                    }
                  </div>
                  <div class="ink-link-actions">
                    <button
                      type="button"
                      class="ink-link-submit-btn"
                      [disabled]="!linkUrl.trim()"
                      (click)="applyLink(linkTrigger)"
                    >
                      {{ svc.isLink() ? 'Update' : 'Apply' }}
                    </button>
                    @if (svc.isLink()) {
                      <button
                        type="button"
                        class="ink-link-remove-btn"
                        (click)="removeLink(linkTrigger)"
                      >
                        Unlink
                      </button>
                    }
                  </div>
                </div>
              </mat-menu>
            }

            <!-- Image Button -->
            @if (svc.hasExtension('image')) {
              <button
                type="button"
                class="ink-tb-icon-btn"
                #imageTrigger="matMenuTrigger"
                aria-label="Insert image"
                matTooltip="Insert image"
                [matMenuTriggerFor]="imageMenu"
              >
                <mat-icon>image</mat-icon>
              </button>
              <mat-menu #imageMenu="matMenu" (menuOpened)="onImageMenuOpened()">
                <div class="ink-image-popover" inkKeepMenuOpen>
                  <div class="ink-image-tabs">
                    <button
                      type="button"
                      class="ink-tab-btn"
                      [class.active]="imageTab === 'file'"
                      (click)="imageTab = 'file'"
                    >
                      File
                    </button>
                    <button
                      type="button"
                      class="ink-tab-btn"
                      [class.active]="imageTab === 'link'"
                      (click)="imageTab = 'link'"
                    >
                      Link
                    </button>
                  </div>

                  <div class="ink-tab-content">
                    @if (imageTab === 'file') {
                      <input
                        type="file"
                        #fileInput
                        style="display:none"
                        accept="image/*"
                        (change)="onFileSelected($event, imageTrigger)"
                      />
                      <button
                        type="button"
                        class="ink-image-upload-box"
                        (click)="fileInput.click()"
                      >
                        <mat-icon>cloud_upload</mat-icon>
                        <span>Upload an image</span>
                      </button>
                    } @else {
                      <input
                        type="url"
                        class="ink-image-url-input"
                        [(ngModel)]="imageUrl"
                        (ngModelChange)="onImageUrlChange()"
                        (keydown.enter)="embedImageLink(imageTrigger)"
                        placeholder="Paste image URL (https://...)"
                      />
                      <div class="ink-image-preview-box">
                        @if (imageUrl.trim()) {
                          @if (previewError) {
                            <div class="ink-preview-error">
                              <mat-icon>broken_image</mat-icon>
                              <span>Unable to load image</span>
                            </div>
                          } @else {
                            <img
                              [src]="imageUrl.trim()"
                              alt="Preview"
                              class="ink-preview-img"
                              referrerpolicy="no-referrer"
                              (error)="previewError = true"
                              (load)="previewError = false"
                            />
                          }
                        } @else {
                          <div class="ink-preview-placeholder">
                            <mat-icon>image</mat-icon>
                            <span>Image preview</span>
                          </div>
                        }
                      </div>
                      <button
                        type="button"
                        class="ink-image-submit-btn"
                        [disabled]="!imageUrl.trim()"
                        (click)="embedImageLink(imageTrigger)"
                      >
                        Embed image
                      </button>
                    }
                  </div>
                </div>
              </mat-menu>
            }

            <!-- Table Insert Dropdown -->
            @if (svc.hasExtension('table')) {
              <button
                type="button"
                class="ink-tb-icon-btn"
                #tableTrigger="matMenuTrigger"
                aria-label="Insert table"
                matTooltip="Insert table"
                [matMenuTriggerFor]="insertTableMenu"
                (menuOpened)="onTableMenuOpened()"
              >
                <mat-icon>grid_on</mat-icon>
              </button>
              <mat-menu #insertTableMenu="matMenu">
                <div class="ink-table-grid-popover" inkKeepMenuOpen>
                  <div class="ink-table-grid" role="grid" aria-label="Table dimension selector">
                    @for (r of gridRows; track r) {
                      <div class="ink-table-grid-row" role="row">
                        @for (c of gridCols; track c) {
                          <button
                            type="button"
                            role="gridcell"
                            class="ink-table-grid-cell"
                            [class.active]="r <= tableHoverRows() && c <= tableHoverCols()"
                            (mouseenter)="onCellHover(r, c)"
                            (click)="insertTableGrid(r, c, tableTrigger)"
                            [attr.aria-label]="c + ' columns by ' + r + ' rows'"
                          ></button>
                        }
                      </div>
                    }
                  </div>

                  <button
                    type="button"
                    class="ink-table-pills"
                    (click)="insertTableGrid(tableHoverRows(), tableHoverCols(), tableTrigger)"
                    [attr.aria-label]="
                      'Insert table, ' +
                      tableHoverCols() +
                      ' columns by ' +
                      tableHoverRows() +
                      ' rows'
                    "
                    title="Click to insert table"
                  >
                    <span class="ink-table-pill">
                      <svg
                        class="pill-icon"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.4"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <rect x="2" y="2" width="12" height="12" rx="2.5" />
                        <line x1="6" y1="2" x2="6" y2="14" />
                        <line x1="10" y1="2" x2="10" y2="14" />
                      </svg>
                      <span class="pill-val">{{ tableHoverCols() }}</span>
                    </span>
                    <span class="ink-table-times">×</span>
                    <span class="ink-table-pill">
                      <svg
                        class="pill-icon"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.4"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <rect x="2" y="2" width="12" height="12" rx="2.5" />
                        <line x1="2" y1="6" x2="14" y2="6" />
                        <line x1="2" y1="10" x2="14" y2="10" />
                      </svg>
                      <span class="pill-val">{{ tableHoverRows() }}</span>
                    </span>
                  </button>
                </div>
              </mat-menu>
            }

            <!-- Callout Dropdown -->
            @if (svc.hasExtension('callout')) {
              <button
                type="button"
                class="ink-tb-icon-btn"
                aria-label="Insert callout"
                matTooltip="Callout box"
                [matMenuTriggerFor]="calloutMenu"
              >
                <mat-icon>announcement</mat-icon>
              </button>
              <mat-menu #calloutMenu="matMenu" class="ink-toolbar-mat-menu">
                <button mat-menu-item (click)="svc.insertCallout('info')">
                  <mat-icon style="color: #60a5fa;">info</mat-icon>
                  <span class="menu-item-text">Info</span>
                </button>
                <button mat-menu-item (click)="svc.insertCallout('note')">
                  <mat-icon style="color: #c084fc;">sticky_note_2</mat-icon>
                  <span class="menu-item-text">Note</span>
                </button>
                <button mat-menu-item (click)="svc.insertCallout('warning')">
                  <mat-icon style="color: #fbbf24;">warning</mat-icon>
                  <span class="menu-item-text">Warning</span>
                </button>
                <button mat-menu-item (click)="svc.insertCallout('success')">
                  <mat-icon style="color: #34d399;">check_circle</mat-icon>
                  <span class="menu-item-text">Success</span>
                </button>
                <button mat-menu-item (click)="svc.insertCallout('danger')">
                  <mat-icon style="color: #f87171;">error</mat-icon>
                  <span class="menu-item-text">Danger</span>
                </button>
              </mat-menu>
            }

            <!-- Emoji Picker -->
            <button
              type="button"
              class="ink-tb-icon-btn"
              aria-label="Insert emoji"
              matTooltip="Insert emoji"
              [matMenuTriggerFor]="emojiMenu"
            >
              <mat-icon>sentiment_satisfied</mat-icon>
            </button>
            <mat-menu #emojiMenu="matMenu">
              <div class="ink-emoji-popover" inkKeepMenuOpen>
                <div class="ink-emoji-title">Emojis</div>
                <div class="ink-emoji-grid">
                  @for (em of emojis; track em) {
                    <button type="button" class="ink-emoji-btn" (click)="svc.insertText(em)">
                      {{ em }}
                    </button>
                  }
                </div>
              </div>
            </mat-menu>
          </div>
        }

        <!-- 7. Custom Extensions Tools -->
        @if (svc.customToolbarItems().length > 0) {
          <div class="tb-divider"></div>
          <div class="tb-group" role="group" aria-label="Custom tools">
            @for (item of svc.customToolbarItems(); track item.id) {
              <button
                type="button"
                class="ink-tb-icon-btn"
                [class.active]="item.isActive?.(svc)"
                [disabled]="item.isDisabled?.(svc)"
                (click)="item.run(svc)"
                [attr.aria-label]="item.label || item.id"
                [matTooltip]="item.tooltip || item.label || item.id"
              >
                @if (item.glyph) {
                  <span class="block-glyph">{{ item.glyph }}</span>
                } @else if (item.icon) {
                  <mat-icon>{{ item.icon }}</mat-icon>
                }
              </button>
            }
          </div>
        }

        <span class="toolbar-spacer"></span>

        <!-- 8. Document History & Theme Toggle -->
        <div class="tb-group" role="group" aria-label="Editor settings">
          @if (svc.hasExtension('search')) {
            <button
              type="button"
              class="ink-tb-icon-btn"
              [class.active]="svc.searchOpen()"
              [attr.aria-pressed]="svc.searchOpen()"
              aria-label="Find and replace"
              matTooltip="Find and replace (Ctrl+F)"
              (click)="svc.searchOpen() ? svc.closeSearch() : svc.openSearch()"
            >
              <mat-icon>search</mat-icon>
            </button>
          }
          <button
            type="button"
            class="ink-tb-icon-btn"
            aria-label="Version history"
            matTooltip="Version history"
            (click)="openHistory()"
          >
            <mat-icon>history</mat-icon>
          </button>
          <button
            type="button"
            class="ink-tb-icon-btn ink-tb-theme-toggle"
            [attr.aria-label]="
              themeService.theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
            "
            [matTooltip]="
              themeService.theme() === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'
            "
            (click)="themeService.toggleTheme($event)"
          >
            <mat-icon>{{ themeService.theme() === 'dark' ? 'light_mode' : 'dark_mode' }}</mat-icon>
          </button>
        </div>
      </div>

      @if (canScrollRight()) {
        <button
          type="button"
          class="ink-tb-scroll-btn ink-tb-scroll-right"
          (click)="scrollByOffset(180)"
          aria-label="Scroll toolbar right"
          tabindex="-1"
        >
          <mat-icon>chevron_right</mat-icon>
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      flex-shrink: 0;
      position: sticky;
      top: 0;
      z-index: 20;
    }

    .ink-toolbar-wrapper {
      position: relative;
      width: 100%;
      display: flex;
      align-items: center;

      /* Visual gradient fade hints when overflowed */
      &.can-scroll-left::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 28px;
        background: linear-gradient(to right, var(--ink-bg-toolbar, #18191c), transparent);
        pointer-events: none;
        z-index: 12;
      }

      &.can-scroll-right::after {
        content: '';
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        width: 28px;
        background: linear-gradient(to left, var(--ink-bg-toolbar, #18191c), transparent);
        pointer-events: none;
        z-index: 12;
      }
    }

    /* Scroll nudge buttons for touch / mobile screens */
    .ink-tb-scroll-btn {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      z-index: 15;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 30px;
      padding: 0;
      border: 1px solid var(--ink-border-default, rgba(255, 255, 255, 0.12));
      border-radius: 6px;
      background: var(--ink-bg-toolbar, #18191c);
      color: var(--ink-text-primary, #f8fafc);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
      cursor: pointer;
      opacity: 0.95;
      transition: all 0.15s ease;

      &:hover {
        opacity: 1;
        background: var(--ink-btn-hover-bg, rgba(255, 255, 255, 0.1));
        color: var(--ink-accent-light, #60a5fa);
      }

      &:active {
        transform: translateY(-50%) scale(0.92);
      }

      &.ink-tb-scroll-left {
        left: 3px;
      }

      &.ink-tb-scroll-right {
        right: 3px;
      }

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
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
      -webkit-overflow-scrolling: touch;
      touch-action: pan-x;
      overscroll-behavior-x: contain;
      scroll-behavior: smooth;
      user-select: none;
      -webkit-user-select: none;
      box-sizing: border-box;
      min-height: 44px;
      width: 100%;
      cursor: grab;
      transition:
        background-color 0.15s ease,
        border-color 0.15s ease;

      &:active {
        cursor: grabbing;
      }

      &::-webkit-scrollbar {
        display: none;
      }
    }

    .tb-group {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
      touch-action: pan-x;
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
      touch-action: pan-x;
      -webkit-tap-highlight-color: transparent;
      transition: all 0.14s ease;

      &:hover:not(:disabled) {
        background: var(--ink-btn-hover-bg);
        border-color: var(--ink-border-focus);
        color: var(--ink-text-primary, #f8fafc);
      }

      &:disabled {
        opacity: 0.35;
        cursor: not-allowed;
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
      touch-action: pan-x;
      -webkit-tap-highlight-color: transparent;
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

    /* Highlight button: a bar under the icon shows the current color */
    .highlight-trigger-btn {
      position: relative;

      .highlight-indicator-bar {
        position: absolute;
        bottom: 4px;
        left: 8px;
        right: 8px;
        height: 3px;
        border-radius: 2px;
      }
    }

    /* Paragraph, line spacing and list dropdowns: an icon plus a caret */
    .ink-tb-align-btn,
    .ink-tb-spacing-btn,
    .ink-tb-list-btn {
      width: auto;
      padding: 0 2px 0 6px;
      gap: 0;

      .caret {
        width: 16px;
        font-size: 16px;
        opacity: 0.7;
      }
    }

    /* Font dropdown: the font's name */
    .ink-tb-font-btn .block-label {
      min-width: 56px;
      max-width: 104px;
    }

    /* Font size: − box + */
    .ink-tb-size-control {
      display: inline-flex;
      align-items: center;
      gap: 1px;
    }

    .ink-tb-step-btn {
      width: 26px;
    }

    .ink-tb-size-input {
      width: 38px;
      height: 26px;
      padding: 0 2px;
      box-sizing: border-box;
      border: 1px solid var(--ink-border-default, #2e3036);
      border-radius: 5px;
      background: var(--ink-bg-input, transparent);
      color: var(--ink-text-primary, #f8fafc);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      text-align: center;
      cursor: text;
      /* The toolbar's text cannot be selected; the box's must be, to type in it (iOS). */
      user-select: text;
      -webkit-user-select: text;
      transition: border-color 0.12s ease;

      &:hover:not(:disabled) {
        border-color: var(--ink-border-focus);
      }

      &:focus {
        outline: none;
        border-color: var(--ink-active-text, #60a5fa);
        box-shadow: 0 0 0 1px var(--ink-active-text, #60a5fa);
      }

      &:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
    }

    /* The box's list of sizes, under it (in the overlay container) */
    .ink-size-list {
      min-width: 64px;
      max-height: min(360px, 60vh);
      overflow-y: auto;
      padding: 4px;
      box-sizing: border-box;
      background: var(--ink-bg-menu, #242423);
      border: 1px solid var(--ink-border-default, #2e3036);
      border-radius: 10px;
      box-shadow: var(--ink-shadow-menu);
      scrollbar-width: thin;
    }

    .ink-size-option {
      padding: 6px 14px;
      border-radius: 6px;
      color: var(--ink-text-primary, #f8fafc);
      font-size: 13px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
      text-align: center;
      cursor: pointer;
      user-select: none;
      transition: background-color 0.12s ease;

      &:hover,
      &.active {
        background-color: var(--ink-bg-hover);
      }

      &.selected {
        background-color: var(--ink-active-bg);
        color: var(--ink-active-text);
        font-weight: 600;
      }
    }

    /* Typography helper classes for menu items */
    .heading-h1 {
      font-size: 15px;
      font-weight: 700;
    }
    .heading-h2 {
      font-size: 14px;
      font-weight: 600;
    }
    .heading-h3 {
      font-size: 13.5px;
      font-weight: 600;
    }
    .heading-h4 {
      font-size: 13px;
      font-weight: 600;
    }
    .heading-h5 {
      font-size: 12.5px;
      font-weight: 600;
    }
    .heading-h6 {
      font-size: 12px;
      font-weight: 600;
    }
    .small-text {
      font-size: 12px;
    }

    /* Touch screens: 44px targets. A swipe scrolls the row, so the scroll buttons would only cover buttons. */
    @media (pointer: coarse) {
      .ink-toolbar {
        min-height: 56px;
        padding: 6px 8px;
        cursor: auto;
      }
      .ink-tb-icon-btn {
        width: 44px;
        height: 44px;
      }
      .ink-tb-align-btn,
      .ink-tb-spacing-btn,
      .ink-tb-list-btn {
        width: auto;
        min-width: 44px;
      }
      .ink-tb-block-btn {
        height: 44px;
      }
      .ink-tb-step-btn {
        width: 36px;
      }
      /* 16px: iOS zooms into smaller text boxes when they take focus. */
      .ink-tb-size-input {
        width: 46px;
        height: 36px;
        font-size: 16px;
      }
      .ink-size-option {
        padding: 10px 16px;
        font-size: 15px;
      }
      .ink-tb-scroll-btn {
        display: none;
      }
    }
  `,
})
export class Toolbar implements OnDestroy {
  protected readonly svc = inject(EditorService);
  protected readonly themeService = inject(ThemeService);
  protected readonly textColors: ColorSwatch[] = TEXT_COLORS;
  protected readonly highlightColors: ColorSwatch[] = HIGHLIGHT_COLORS;
  protected readonly alignOptions = TEXT_ALIGN_OPTIONS;
  protected readonly alignIcon = textAlignIcon;
  protected readonly fontFamilies = FONT_FAMILIES;
  protected readonly lineSpacings = LINE_SPACINGS;

  /** Whether the block at the cursor is aligned or indented other than by default. */
  protected readonly paragraphFormatted = computed(
    () => (!!this.svc.textAlign() && this.svc.textAlign() !== 'left') || this.svc.indentLevel() > 0,
  );

  /** The name of the document's font (the page setup's), which text without a font of its own has. */
  protected readonly documentFontLabel = computed(
    () => findDocumentFont(this.svc.pageSetup().font).label,
  );

  /** The font the font menu shows: the selection's own, or the document's. */
  protected readonly fontLabel = computed(
    () => findFontFamily(this.svc.fontFamily())?.label ?? this.documentFontLabel(),
  );

  /** The line spacing the line spacing button names: Single, 1.15, 1.5, Double or Default. */
  protected readonly lineSpacingLabel = computed(
    () => LINE_SPACINGS.find((o) => o.value === this.svc.lineSpacing())?.label ?? 'Default',
  );

  // ── Font size box ────────────────────────────────────────────────
  /** The box's list: Default (the document's size), then FONT_SIZES. */
  protected readonly sizeOptions: readonly (number | null)[] = [null, ...FONT_SIZES];
  protected readonly sizeListId = `ink-size-list-${nextToolbarId++}`;
  protected readonly sizeListPositions: ConnectedPosition[] = [
    { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 4 },
    { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -4 },
  ];
  /** Whether the box has focus, with its list open below it. */
  protected readonly sizeListOpen = signal(false);
  /** What is typed in the box while it has focus. */
  protected readonly sizeText = signal('');
  /** The option picked with the arrow keys (an index of sizeOptions), or -1. */
  protected readonly activeSize = signal(-1);
  private readonly sizeInput = viewChild<ElementRef<HTMLInputElement>>('sizeInput');
  private readonly sizeOptionEls = viewChildren<ElementRef<HTMLElement>>('sizeOption');

  /** Whether − (`delta` -1) or + (1) would change the font size. */
  protected canStepFontSize(delta: 1 | -1): boolean {
    const size = this.svc.shownFontSize();
    if (this.svc.isCode() || size === null) return false;
    return delta > 0 ? size < MAX_FONT_SIZE : size > MIN_FONT_SIZE;
  }

  /** Makes the selection's text a pixel larger (`delta` 1) or smaller (-1) than it is shown. */
  protected stepFontSize(delta: 1 | -1): void {
    const size = this.svc.shownFontSize();
    if (size !== null) this.svc.setFontSize(clampFontSize(size + delta));
  }

  protected openSizeList(): void {
    const size = this.svc.shownFontSize();
    this.sizeText.set(size === null ? '' : String(size));
    this.activeSize.set(-1);
    this.sizeListOpen.set(true);
    // After the click that focused the box, which puts the caret where it landed.
    setTimeout(() => this.sizeInput()?.nativeElement.select());
  }

  protected closeSizeList(): void {
    this.sizeListOpen.set(false);
    this.activeSize.set(-1);
  }

  protected onSizeInput(event: Event): void {
    this.sizeText.set((event.target as HTMLInputElement).value);
    this.activeSize.set(-1);
  }

  /** Enter applies the size typed or picked; arrows pick from the list; Escape goes back to the document. */
  protected onSizeKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        const from =
          this.activeSize() >= 0
            ? this.activeSize()
            : this.sizeOptions.indexOf(this.svc.fontSize());
        const last = this.sizeOptions.length - 1;
        const next = Math.min(last, Math.max(0, from + (event.key === 'ArrowDown' ? 1 : -1)));
        this.activeSize.set(next);
        this.sizeOptionEls()[next]?.nativeElement.scrollIntoView?.({ block: 'nearest' });
        break;
      }
      case 'Enter': {
        event.preventDefault();
        if (this.activeSize() >= 0) {
          this.pickFontSize(this.sizeOptions[this.activeSize()]);
          break;
        }
        const typed = parseFloat(this.sizeText());
        if (Number.isFinite(typed)) {
          this.pickFontSize(clampFontSize(typed));
        } else {
          this.closeSizeList();
          this.svc.focus();
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.closeSizeList();
        this.svc.focus();
        break;
    }
  }

  /** Sets the selection's font size (null for the document's) and goes back to the document. */
  protected pickFontSize(size: number | null): void {
    this.closeSizeList();
    this.svc.setFontSize(size);
  }

  /** A click outside the list and the box, which kept focus (the toolbar does not take it). */
  protected onSizeOutsideClick(event: MouseEvent): void {
    if (event.target === this.sizeInput()?.nativeElement) return;
    this.closeSizeList();
    this.svc.focus();
  }
  protected readonly emojis: string[] = COMMON_EMOJIS;
  protected readonly bulletStyles = BULLET_STYLES;
  protected readonly numberStyles = NUMBER_STYLES;

  /** The bullet a list shows at `level` when it has no style of its own. */
  protected levelBullet(level: number): string {
    return ['•', '◦', '▪'][(Math.max(level, 1) - 1) % 3];
  }

  /** The number a list shows at `level` when it has no style of its own. */
  protected levelNumber(level: number): string {
    return NUMBER_STYLES.find((s) => s.value === defaultNumberStyle(level))!.glyph;
  }

  /** Asks for the number the item at the cursor should have; the list restarts there. */
  protected promptListStart(current: number): void {
    if (typeof window === 'undefined') return;
    const value = window.prompt(`Number this item (0 to ${MAX_LIST_START}):`, String(current));
    if (value === null) return;
    const number = Number(value.trim());
    if (Number.isInteger(number) && number >= 0 && number <= MAX_LIST_START) {
      this.svc.setListStart(number);
    }
  }

  protected readonly toolbarRef = viewChild<ElementRef<HTMLDivElement>>('toolbarEl');
  private readonly linkTrigger = viewChild<MatMenuTrigger>('linkTrigger');
  private readonly menuTriggers = viewChildren(MatMenuTrigger);
  /** When the toolbar was last pressed, and whether the document had focus then. */
  private lastPress = { at: 0, documentFocused: false };
  /** Whether the open menu should hand focus back to the document when it closes. */
  private refocusDocumentOnClose = false;
  private handledLinkRequests = this.svc.linkEditorRequests();
  protected readonly canScrollLeft = signal(false);
  protected readonly canScrollRight = signal(false);

  // Pointer drag-to-scroll state
  private isPointerDown = false;
  private startX = 0;
  private startScrollLeft = 0;
  private hasDragged = false;
  private lastDragTimestamp = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => {
      this.initToolbarScroll();
    });

    // Mod-k: the toolbar handles it unless the floating menu is showing.
    effect(() => {
      const requests = this.svc.linkEditorRequests();
      if (requests === this.handledLinkRequests) return;
      this.handledLinkRequests = requests;
      if (!untracked(() => this.svc.floatingMenu())) this.linkTrigger()?.openMenu();
    });

    // A menu opened by a click or tap while typing returns focus to the
    // document when it closes, not to its button: on a phone that keeps the
    // on-screen keyboard up. Menus opened from the keyboard return to their button.
    effect((onCleanup) => {
      const subscriptions = this.menuTriggers().flatMap((trigger) => [
        trigger.menuOpened.subscribe(() => {
          this.refocusDocumentOnClose =
            this.lastPress.documentFocused && Date.now() - this.lastPress.at < 1000;
        }),
        trigger.menuClosed.subscribe(() => {
          if (this.refocusDocumentOnClose) this.svc.focus();
          this.refocusDocumentOnClose = false;
        }),
      ]);
      onCleanup(() => subscriptions.forEach((s) => s.unsubscribe()));
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  private initToolbarScroll(): void {
    const el = this.toolbarRef()?.nativeElement;
    if (!el) return;

    // Suppress accidental button click triggers when swiping
    el.addEventListener(
      'click',
      (e: MouseEvent) => {
        if (this.hasDragged || Date.now() - this.lastDragTimestamp < 200) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
      },
      true, // capture phase
    );

    this.checkScrollState();

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.checkScrollState();
      });
      this.resizeObserver.observe(el);
    }
  }

  protected onToolbarScroll(): void {
    this.checkScrollState();
  }

  protected checkScrollState(): void {
    const el = this.toolbarRef()?.nativeElement;
    if (!el) return;

    const maxScroll = el.scrollWidth - el.clientWidth;
    const current = el.scrollLeft;
    this.canScrollLeft.set(current > 4);
    this.canScrollRight.set(current < maxScroll - 4);
  }

  protected scrollByOffset(offset: number): void {
    const el = this.toolbarRef()?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: offset, behavior: 'smooth' });
    setTimeout(() => this.checkScrollState(), 250);
  }

  protected onPointerDown(event: PointerEvent): void {
    this.lastPress = { at: Date.now(), documentFocused: this.svc.view?.hasFocus() ?? false };
    if (event.button !== 0 && event.pointerType === 'mouse') return;

    const el = this.toolbarRef()?.nativeElement;
    if (!el) return;

    this.isPointerDown = true;
    this.hasDragged = false;
    this.startX = event.clientX;
    this.startScrollLeft = el.scrollLeft;
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.isPointerDown) return;

    const el = this.toolbarRef()?.nativeElement;
    if (!el) return;

    const deltaX = event.clientX - this.startX;

    if (!this.hasDragged && Math.abs(deltaX) > 6) {
      this.hasDragged = true;
    }

    if (this.hasDragged) {
      el.scrollLeft = this.startScrollLeft - deltaX;
      this.checkScrollState();
    }
  }

  protected onPointerUp(): void {
    if (this.isPointerDown) {
      if (this.hasDragged) {
        this.lastDragTimestamp = Date.now();
      }
      this.isPointerDown = false;
      setTimeout(() => {
        this.hasDragged = false;
      }, 80);
    }
  }

  protected onPointerCancel(): void {
    this.isPointerDown = false;
    this.hasDragged = false;
  }

  protected imageTab: 'file' | 'link' = 'file';
  protected imageUrl = '';
  protected previewError = false;
  protected linkUrl = '';

  protected readonly gridRows = [1, 2, 3, 4, 5, 6, 7, 8];
  protected readonly gridCols = [1, 2, 3, 4, 5, 6, 7, 8];
  protected readonly tableHoverRows = signal(1);
  protected readonly tableHoverCols = signal(1);

  protected onTableMenuOpened(): void {
    this.tableHoverRows.set(1);
    this.tableHoverCols.set(1);
  }

  protected onCellHover(r: number, c: number): void {
    this.tableHoverRows.set(r);
    this.tableHoverCols.set(c);
  }

  protected insertTableGrid(rows: number, cols: number, trigger: MatMenuTrigger): void {
    this.svc.insertTable(rows, cols);
    trigger.closeMenu();
  }

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
    focusLinkInput();
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

  protected onFileSelected(event: Event, trigger?: MatMenuTrigger): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.svc.insertImage(file);
      input.value = '';
      trigger?.closeMenu();
    }
  }

  protected embedImageLink(trigger?: MatMenuTrigger): void {
    if (this.imageUrl.trim()) {
      this.svc.insertImage(this.imageUrl.trim());
      this.imageUrl = '';
      this.previewError = false;
      trigger?.closeMenu();
    }
  }

  protected openHistory(): void {
    this.svc.requestOpenHistory();
  }
}

// Backward compatibility alias
export { Toolbar as ToolbarComponent };
