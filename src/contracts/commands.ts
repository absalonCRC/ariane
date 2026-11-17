export interface CommandDefinition {
  id: string;
  label: string;
  scope: 'app' | 'editor' | 'global';
  shortcut: string | null;
  native?: boolean;
}
export type ShortcutBindings = Record<string, string | null>;
