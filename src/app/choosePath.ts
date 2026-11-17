import { invoke } from '@tauri-apps/api/core';
type Purpose = 'open' | 'create' | 'vault' | 'import' | 'export' | 'inbox-backup' | 'inbox-restore';
export function choosePath(
  purpose: Purpose,
  options: { title: string; directory?: boolean; name?: string; format?: string },
) {
  return invoke<string | null>('choose_path', { purpose, ...options });
}
