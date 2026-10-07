import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ThemeService } from '../../core/theme.service';

@Component({
  selector: 'ink-landing',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent implements OnInit {
  protected readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      const search = window.location.search;
      const hash = window.location.hash;
      // If someone opens a shared document link at root URL, forward immediately to /editor
      if (search.includes('view=preview') || hash.includes('share=')) {
        const params = new URLSearchParams(search);
        const queryParams: Record<string, string> = {};
        params.forEach((val, key) => {
          queryParams[key] = val;
        });
        const fragment = hash.startsWith('#') ? hash.slice(1) : undefined;
        void this.router.navigate(['/editor'], {
          queryParams,
          fragment,
          replaceUrl: true,
        });
      }
    }
  }

  protected startWriting(): void {
    void this.router.navigate(['/editor']);
  }

  protected exploreDemo(): void {
    void this.router.navigate(['/editor'], {
      queryParams: { demo: 'true' },
    });
  }

  protected newDocument(): void {
    void this.router.navigate(['/editor'], {
      queryParams: { new: 'true' },
    });
  }
}
