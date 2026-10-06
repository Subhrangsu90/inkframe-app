export interface FloatingMenuState {
  left: number;
  top: number;
}

export interface SlashMenuState {
  query: string;
  from: number;
  to: number;
  left: number;
  top: number;
}

export interface EditorHooks {
  onFloatingMenu(state: FloatingMenuState | null): void;
  onSlashMenu(state: SlashMenuState | null): void;
  /** Return true if the key was consumed by the slash menu. */
  onSlashKeyDown(event: KeyboardEvent): boolean;
}
