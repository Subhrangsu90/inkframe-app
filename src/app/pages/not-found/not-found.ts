import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'ink-not-found',
  templateUrl: './not-found.html',
  styleUrl: './not-found.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFound { }

