import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'ink-settings',
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings { }

