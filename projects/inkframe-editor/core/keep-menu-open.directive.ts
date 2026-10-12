import { Directive } from '@angular/core';

/**
 * Put on custom content inside a `<mat-menu>` (color grids, link and image
 * forms). Material closes a menu on any click inside it, which would close it
 * while the user picks a color or types a URL; this stops the click at the
 * content. It is not an interaction of its own, so it needs no keyboard
 * counterpart.
 */
@Directive({
  selector: '[inkKeepMenuOpen]',
  host: { '(click)': '$event.stopPropagation()' },
})
export class KeepMenuOpen {}
