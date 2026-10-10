import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'ink-docs',
  templateUrl: './docs.html',
  styleUrl: './docs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Docs { }


