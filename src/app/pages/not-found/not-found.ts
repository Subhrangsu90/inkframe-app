import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { InkIcon } from '../../shared/ui/icons/icon';
import { LayoutService } from '../../shared/layout/layout.service';

@Component({
  selector: 'ink-not-found',
  standalone: true,
  imports: [RouterLink, InkIcon],
  templateUrl: './not-found.html',
  styleUrl: './not-found.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFound {
  private readonly layout = inject(LayoutService);

  readonly headerLeftTpl = viewChild<TemplateRef<unknown>>('headerLeft');

  constructor() {
    effect(() => {
      const left = this.headerLeftTpl();
      this.layout.setHeaderTemplates({
        left: left ?? null,
        center: null,
        right: null,
      });
    });

    inject(DestroyRef).onDestroy(() => {
      this.layout.clearHeaderTemplates();
    });
  }
}
