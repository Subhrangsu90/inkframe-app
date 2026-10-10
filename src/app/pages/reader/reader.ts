import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'ink-reader',
  templateUrl: './reader.html',
  styleUrl: './reader.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Reader { }