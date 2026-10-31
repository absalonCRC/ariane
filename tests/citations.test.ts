import { it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { composeCitation } from '../src/sources/citations';
import type { Source } from '../src/app/types';
const source: Source = {
  id: 'abcdefghij123456',
  fingerprint: '1234567890abcdef',
  vaultId: 'vault',
  path: 'Notes/La voix.md',
  title: 'La voix',
  kind: 'Note',
  text: 'Une voix traverse la ville.',
  aliases: [],
  tags: [],
  fields: {},
  page: 12,
  score: 1,
  matched: null,
};
// Exercise the same Markdown dialect as the native converter. A citation inserted
// at a paragraph's end must remain a quotation, not print literal > characters.
it.each(['notes', 'apa', 'chicago'] as const)(
  'exports an inserted %s quotation as a block quote',
  (style) => {
    const markdown = 'Le paragraphe précédent.' + composeCitation(source, source.text, style);
    const converted = spawnSync(
      resolve('src-tauri/resources/engine/pandoc'),
      ['-f', 'markdown+footnotes+citations', '-t', 'json'],
      { input: markdown, encoding: 'utf8' },
    );
    expect(converted.status, converted.stderr).toBe(0);
    const blocks = JSON.parse(converted.stdout).blocks as { t: string }[];
    expect(blocks[0].t).toBe('Para');
    expect(blocks.some((block) => block.t === 'BlockQuote')).toBe(true);
    expect(converted.stdout).toContain('Une');
  },
);
