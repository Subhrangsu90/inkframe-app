import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'ink-landing',
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Landing { }

