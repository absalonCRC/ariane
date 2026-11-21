import { ArrowRight } from 'lucide-react';
import { t } from '../i18n';
import type { comparePassages } from './comparison';
import { ReadingDiff } from './ReadingDiff';

type Row = ReturnType<typeof comparePassages>[number];
type Side = 'left' | 'right';

function DiffCell({
  row,
  index,
  side,
  reading,
}: {
  row: Row;
  index: number;
  side: Side;
  reading: boolean;
}) {
  const left = side === 'left';
  const marked = row.changed && row[side].length > 0;
  return (
    <div className={'history-diff-cell' + (marked ? (left ? ' diff-removed' : ' diff-added') : '')}>
      <span
        className="diff-gutter"
        aria-label={row.changed ? t(left ? 'Retrait' : 'Ajout') : undefined}
      >
        {marked ? (left ? '−' : '+') : ''}
        <small>{row[side].length ? (left ? row.leftStart : row.rightStart) + 1 : ''}</small>
      </span>
      <div
        className={'diff-prose' + (reading ? ' is-reading' : '')}
        data-diff-side={side}
        data-diff-row={index}
      >
        {reading ? (
          <ReadingDiff words={row.words} side={side} />
        ) : (
          row.words
            .filter((word) => (left ? !word.added : !word.removed))
            .map((word, i) =>
              word.removed ? (
                <del key={i}>{word.value}</del>
              ) : word.added ? (
                <ins key={i}>{word.value}</ins>
              ) : (
                <span key={i}>{word.value}</span>
              ),
            )
        )}
      </div>
    </div>
  );
}

export function ComparisonRows({
  rows,
  reading,
  currentChange,
  alignedRow,
  canApply,
  busy,
  apply,
  group,
}: {
  rows: Row[];
  reading: boolean;
  currentChange: number | undefined;
  alignedRow?: number;
  canApply: boolean;
  busy: boolean;
  apply: (index: number) => Promise<void>;
  group: { start: number; end: number } | null;
}) {
  const classes = (row: Row, index: number) =>
    'history-diff-row' +
    (row.changed ? ' is-changed' : '') +
    (currentChange === index ? ' is-current-change' : '');
  const action = (row: Row, index: number) =>
    canApply &&
    row.changed && (
      <div className="history-passage-action">
        <button disabled={busy} onClick={() => void apply(index)}>
          <ArrowRight size={12} /> {t('Reprendre le passage de référence')}
        </button>
      </div>
    );
  return rows.map((row, index) => {
    if (group && index >= group.start && index <= group.end) {
      if (index !== group.start) return null;
      const part = rows.slice(group.start, group.end + 1);
      return (
        <div className="history-aligned-group" key={index}>
          {(['left', 'right'] as const).map((side) => (
            <div className="history-aligned-column" key={side}>
              {part.map((entry, slot) => {
                const at = group.start + slot;
                return (
                  <div
                    className={classes(entry, at)}
                    data-change={side === 'right' ? at : undefined}
                    key={at}
                  >
                    <DiffCell row={entry} index={at} side={side} reading={reading} />
                    {side === 'right' && action(entry, at)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      );
    }
    return (
      <div
        className={classes(row, index)}
        data-change={index}
        data-phrase-aligned={alignedRow === index || undefined}
        key={index}
      >
        <DiffCell row={row} index={index} side="left" reading={reading} />
        <DiffCell row={row} index={index} side="right" reading={reading} />
        {action(row, index)}
      </div>
    );
  });
}
