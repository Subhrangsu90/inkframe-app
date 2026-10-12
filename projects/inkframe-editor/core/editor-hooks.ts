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
  top: number;
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
}
