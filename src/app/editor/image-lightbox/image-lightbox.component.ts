import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface ImagePreviewPayload {
  src: string;
  alt?: string;
  title?: string;
}

@Component({
  selector: 'ink-image-lightbox',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ink-lightbox-backdrop" (click)="onBackdropClick($event)">
      <!-- Top Toolbar -->
      <div class="ink-lightbox-header" (click)="$event.stopPropagation()">
        <div class="ink-lightbox-info">
          @if (title() || alt()) {
            <span class="ink-lightbox-title">{{ title() || alt() }}</span>
          }
          @if (dimensions()) {
            <span class="ink-lightbox-dimensions">{{ dimensions() }}</span>
          }
        </div>

        <div class="ink-lightbox-actions">
          <!-- Zoom Out -->
          <button mat-icon-button
                  type="button"
                  class="ink-lightbox-btn"
                  matTooltip="Zoom out (-)"
                  [disabled]="zoom() <= 0.5"
                  (click)="zoomOut()">
            <mat-icon>zoom_out</mat-icon>
          </button>

          <!-- Zoom Reset Badge -->
          <button type="button"
                  class="ink-lightbox-zoom-badge"
                  matTooltip="Reset zoom"
                  (click)="resetZoom()">
            {{ Math.round(zoom() * 100) }}%
          </button>

          <!-- Zoom In -->
          <button mat-icon-button
                  type="button"
                  class="ink-lightbox-btn"
                  matTooltip="Zoom in (+)"
                  [disabled]="zoom() >= 3"
                  (click)="zoomIn()">
            <mat-icon>zoom_in</mat-icon>
          </button>

          <!-- Download -->
          <button mat-icon-button
                  type="button"
                  class="ink-lightbox-btn"
                  matTooltip="Download image"
                  (click)="downloadImage()">
            <mat-icon>download</mat-icon>
          </button>

          <!-- Open in new tab -->
          <button mat-icon-button
                  type="button"
                  class="ink-lightbox-btn"
                  matTooltip="Open original in new tab"
                  (click)="openInNewTab()">
            <mat-icon>open_in_new</mat-icon>
          </button>

          <!-- Close -->
          <button mat-icon-button
                  type="button"
                  class="ink-lightbox-btn close-btn"
                  matTooltip="Close (Esc)"
                  (click)="closed.emit()">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      </div>

      <!-- Main Image Stage -->
      <div class="ink-lightbox-stage" (click)="onBackdropClick($event)">
        <div class="ink-lightbox-img-wrapper"
             [style.transform]="'scale(' + zoom() + ')'"
             (click)="$event.stopPropagation()">
          <img #imgRef
               [src]="src()"
               [alt]="alt() || 'Preview image'"
               class="ink-lightbox-img"
               referrerpolicy="no-referrer"
               (load)="onImageLoaded($event)"
               (click)="toggleZoom()" />
        </div>
      </div>

      <!-- Bottom Caption Footer -->
      @if (alt() || title()) {
        <div class="ink-lightbox-footer" (click)="$event.stopPropagation()">
          <span>{{ alt() || title() }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: block;
      user-select: none;
      animation: inkFadeIn 0.18s ease-out;
    }

    .ink-lightbox-backdrop {
      width: 100%;
      height: 100%;
      background: var(--ink-lightbox-backdrop, rgba(12, 13, 16, 0.88));
      backdrop-filter: blur(12px);
      display: flex;
      flex-direction: column;
      position: relative;
    }

    .ink-lightbox-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 16px;
      background: var(--ink-bg-header, var(--ink-bg-card, #18191c));
      border-bottom: 1px solid var(--ink-border-default, #2e3036);
      z-index: 10;
      transition: background-color 0.15s ease, border-color 0.15s ease;

      @media (max-width: 640px) {
        padding: 8px 10px;
      }
    }

    .ink-lightbox-info {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--ink-text-primary, #f1f5f9);
      overflow: hidden;
      min-width: 0;
      flex: 1;

      .ink-lightbox-title {
        font-size: 0.92rem;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 320px;
        color: var(--ink-text-heading, #ffffff);

        @media (max-width: 640px) {
          max-width: 140px;
          font-size: 0.84rem;
        }
      }

      .ink-lightbox-dimensions {
        font-size: 0.76rem;
        color: var(--ink-badge-text, #94a3b8);
        background: var(--ink-badge-bg, rgba(255, 255, 255, 0.08));
        border: 1px solid var(--ink-border-subtle, rgba(255, 255, 255, 0.08));
        padding: 2px 8px;
        border-radius: 4px;
        font-family: monospace;

        @media (max-width: 520px) {
          display: none;
        }
      }
    }

    .ink-lightbox-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;

      .ink-lightbox-btn {
        color: var(--ink-text-secondary, #cbd5e1);
        width: 36px;
        height: 36px;
        line-height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        transition: background-color 0.12s ease, color 0.12s ease;

        &:hover:not([disabled]) {
          color: var(--ink-text-primary, #ffffff);
          background: var(--ink-btn-hover-bg, rgba(255, 255, 255, 0.1));
        }

        &[disabled] {
          color: var(--ink-text-muted, #64748b);
          opacity: 0.4;
        }

        &.close-btn:hover:not([disabled]) {
          background: var(--ink-danger-bg, rgba(239, 68, 68, 0.18));
          color: var(--ink-danger-text, #f87171);
        }

        mat-icon {
          font-size: 20px;
          width: 20px;
          height: 20px;
        }
      }

      .ink-lightbox-zoom-badge {
        background: var(--ink-badge-bg, rgba(255, 255, 255, 0.08));
        border: 1px solid var(--ink-border-default, rgba(255, 255, 255, 0.1));
        border-radius: 6px;
        color: var(--ink-text-primary, #e2e8f0);
        font-size: 0.78rem;
        font-family: monospace;
        padding: 3px 8px;
        cursor: pointer;
        transition: all 0.12s ease;

        &:hover {
          background: var(--ink-active-bg, #172c47);
          color: var(--ink-active-text, #60a5fa);
          border-color: var(--ink-active-border, #1e3a5f);
        }
      }
    }

    .ink-lightbox-stage {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: auto;
      padding: 24px;
      cursor: zoom-out;
    }

    .ink-lightbox-img-wrapper {
      transition: transform 0.15s cubic-bezier(0.2, 0, 0, 1);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      max-width: 92vw;
      max-height: 80vh;
      cursor: default;
    }

    .ink-lightbox-img {
      max-width: 90vw;
      max-height: 82vh;
      object-fit: contain;
      border-radius: 8px;
      border: 1px solid var(--ink-border-subtle, rgba(255, 255, 255, 0.1));
      box-shadow: var(--ink-shadow-popover, 0 16px 48px rgba(0, 0, 0, 0.65));
      cursor: zoom-in;
      animation: inkScaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .ink-lightbox-footer {
      padding: 10px 16px;
      text-align: center;
      color: var(--ink-text-secondary, #94a3b8);
      font-size: 0.85rem;
      background: var(--ink-bg-header, var(--ink-bg-card, #18191c));
      border-top: 1px solid var(--ink-border-default, #2e3036);
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }

    @keyframes inkFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes inkScaleIn {
      from { transform: scale(0.96); opacity: 0.8; }
      to { transform: scale(1); opacity: 1; }
    }
  `,
})
export class ImageLightboxComponent {
  readonly src = input.required<string>();
  readonly alt = input<string | undefined>();
  readonly title = input<string | undefined>();
  readonly closed = output<void>();

  protected readonly Math = Math;
  protected readonly zoom = signal<number>(1);
  protected readonly dimensions = signal<string>('');
  private readonly imgRef = viewChild<ElementRef<HTMLImageElement>>('imgRef');

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }

  protected onImageLoaded(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img.naturalWidth && img.naturalHeight) {
      this.dimensions.set(`${img.naturalWidth} × ${img.naturalHeight}`);
    }
  }

  protected zoomIn(): void {
    this.zoom.update((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100));
  }

  protected zoomOut(): void {
    this.zoom.update((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100));
  }

  protected resetZoom(): void {
    this.zoom.set(1);
  }

  protected toggleZoom(): void {
    this.zoom.update((z) => (z === 1 ? 1.75 : 1));
  }

  protected openInNewTab(): void {
    window.open(this.src(), '_blank', 'noopener,noreferrer');
  }

  protected downloadImage(): void {
    const a = document.createElement('a');
    a.href = this.src();
    a.download = this.alt() || 'image';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
