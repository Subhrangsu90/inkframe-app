export interface FloatingMenuState {
  left: number;
  top: number;
  placement?: 'top' | 'bottom';
}

export interface SlashMenuState {
  query: string;
  from: number;
  to: number;
  left: number;
  /** The menu's top edge, or with `placement: 'top'` its bottom edge. */
  top: number;
  /** Above or below the line; below unless there is more room above (default 'bottom'). */
  placement?: 'top' | 'bottom';
  /** The height that fits between the line and the edge of the editor's visible area. */
  maxHeight?: number;
}

export interface TableMenuState {
  left: number;
  top: number;
}

export interface EditorHooks {
  onFloatingMenu(state: FloatingMenuState | null): void;
  onSlashMenu(state: SlashMenuState | null): void;
  onTableMenu?(state: TableMenuState | null): void;
  /** Return true if the key was consumed by the slash menu. */
  onSlashKeyDown(event: KeyboardEvent): boolean;
  /** Page view: how many pages the document fills on screen; 0 when page view is off. */
  onPageCount?(pages: number): void;
}
