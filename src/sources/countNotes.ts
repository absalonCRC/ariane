import type { Source } from '../app/types';

/** Count each suggested Markdown note from a vault only once. */
export function countVaultNotes(sources: readonly Source[]): number {
  return new Set(
    sources
      .filter((source) => source.vaultId && /\.md$/i.test(source.path))
      .map((source) => source.id),
  ).size;
}
