import { useEffect, useState, type RefObject } from 'react';
import type { Text } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { Dialog } from '../components/Dialog';
import { t } from '../i18n';
import { blankMarker, writingAidLimit } from '../project/writingAids';
import type { Span } from './composite';
import {
  changeAid,
  editorAids,
  reattachAid,
  showWritingTrial,
  writeWithAid,
  type EditorAid,
} from './writingAids';

export type WritingAidCommand = 'blank-insert' | 'blank-fill' | 'trial-start' | 'writing-aids';

type Capture = { doc: Text; from: number; to: number; section: string; quote: string };
type AidKey = { section: string; id: string };
type Panel =
  | { kind: 'insert' | 'fill'; capture: Capture }
  | { kind: 'list'; capture: Capture | null }
  | { kind: 'aid'; key: AidKey; capture: Capture | null };

function atSelection(view: EditorView, spans: Span[]): Capture | null {
  const { from, to } = view.state.selection.main;
  const span = [...spans].reverse().find((span) => span.from <= from && span.to >= to);
  const quote = view.state.sliceDoc(from, to);
  return span ? { doc: view.state.doc, from, to, section: span.id, quote } : null;
}

function selectedBlank(view: EditorView, spans: Span[]): Capture | null {
  const capture = atSelection(view, spans);
  if (!capture) return null;
  if (capture.quote === blankMarker) return capture;
  if (capture.from !== capture.to) return null;
  const pos = capture.from;
  const span = spans.find((span) => span.id === capture.section)!;
  for (let from = Math.max(span.from, pos - blankMarker.length); from <= pos; from++) {
    const to = from + blankMarker.length;
    if (to <= span.to && view.state.sliceDoc(from, to) === blankMarker) {
      return { ...capture, from, to, quote: blankMarker };
    }
  }
  return null;
}

function canTry(capture: Capture | null): capture is Capture {
  return (
    !!capture?.quote.trim() &&
    !/\n[ \t]*\n/.test(capture.quote) &&
    capture.quote.length <= writingAidLimit
  );
}

export function openWritingAid(
  view: EditorView,
  spans: Span[],
  command: WritingAidCommand,
): Panel | null {
  if (view.state.readOnly || view.composing) return null;
  const captured = atSelection(view, spans);
  if (command === 'writing-aids') return { kind: 'list', capture: captured };
  if (!captured) return null;
  if (command === 'blank-insert') {
    const head = view.state.selection.main.head;
    const span = [...spans].reverse().find((span) => span.from <= head && span.to >= head);
    if (!span) return null;
    return {
      kind: 'insert',
      capture: { ...captured, section: span.id, from: head, to: head, quote: '' },
    };
  }
  if (command === 'blank-fill') {
    const capture = selectedBlank(view, spans);
    return capture ? { kind: 'fill', capture } : null;
  }
  if (!canTry(captured)) return null;
  const existing = editorAids(view.state).find(
    (aid) =>
      aid.kind === 'trial' &&
      aid.section === captured.section &&
      aid.from === captured.from &&
      aid.quote === captured.quote,
  );
  const aid: EditorAid = existing ?? {
    id: crypto.randomUUID(),
    kind: 'trial',
    from: captured.from,
    section: captured.section,
    quote: captured.quote,
    value: '',
  };
  if (!existing) changeAid(view, aid);
  return { kind: 'aid', key: aid, capture: captured };
}

export function WritingAidDialog({
  panel,
  editor,
  spans,
  onSelect,
  onClose,
  onError,
  reveal,
}: {
  panel: Panel;
  editor: RefObject<EditorView | null>;
  spans: Span[];
  onSelect: (panel: Panel) => void;
  onClose: () => void;
  onError: (message: string) => void;
  reveal: (aid: EditorAid) => void;
}) {
  const [alternative, setAlternative] = useState(true);
  const [value, setValue] = useState('');
  const view = editor.current;
  const entries = view ? editorAids(view.state) : [];
  const aid =
    panel.kind === 'aid'
      ? entries.find((entry) => entry.id === panel.key.id && entry.section === panel.key.section)
      : undefined;
  const attached = aid?.from != null;
  const isTrial = aid?.kind === 'trial';
  const preview = attached && isTrial;
  const aidId = aid?.id,
    sectionId = aid?.section;
  useEffect(() => {
    if (!view || !preview || !aid) return;
    showWritingTrial(view, aid, alternative);
    return () => {
      if (editor.current === view) showWritingTrial(view, null);
    };
  }, [view, preview, aidId, sectionId, alternative, editor]);

  const capture = panel.capture;
  const blankPosition =
    panel.kind === 'fill' ? capture?.from : aid?.kind === 'blank' ? aid.from : null;
  const blankAid = entries.find(
    (entry) => blankPosition != null && entry.kind === 'blank' && entry.from === blankPosition,
  );
  const current = (target: Capture | null) =>
    !!target && view && !view.state.readOnly && !view.composing && view.state.doc === target.doc;
  const stale = () => {
    onError(t('Le texte a changé. Replacez le curseur puis réessayez.'));
    onClose();
  };
  const finishBlank = () => {
    if (!view || view.state.readOnly || view.composing || !value.trim()) return;
    const from =
      panel.kind === 'fill' && current(capture)
        ? capture?.from
        : panel.kind === 'aid' && aid?.kind === 'blank'
          ? aid.from
          : null;
    if (from == null || view.state.sliceDoc(from, from + blankMarker.length) !== blankMarker) {
      stale();
      return;
    }
    if (writeWithAid(view, from, from + blankMarker.length, value, blankAid, true)) onClose();
  };
  if (panel.kind === 'list') {
    return (
      <Dialog title={t('Repères d’écriture')} modal onClose={onClose}>
        {entries.length ? (
          <ul className="writing-aid-list">
            {entries.map((entry) => (
              <li key={entry.section + ':' + entry.id}>
                <button
                  className="soft"
                  type="button"
                  onClick={() => {
                    reveal(entry);
                    onSelect({ kind: 'aid', key: entry, capture });
                  }}
                >
                  {entry.kind === 'trial' ? t('Essai de formulation') : t('Blanc à compléter')}
                  <span>
                    {spans.find((span) => span.id === entry.section)?.title} · {entry.quote}
                  </span>
                  {entry.from == null && <span>{t('Passage à rattacher')}</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('Aucun repère dans le texte ouvert.')}</p>
        )}
      </Dialog>
    );
  }
  if (panel.kind === 'insert') {
    return (
      <Dialog title={t('Laisser un blanc')} modal onClose={onClose}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!view || !capture || !current(capture)) return stale();
            const marker: EditorAid = {
              section: capture.section,
              from: capture.from,
              id: crypto.randomUUID(),
              kind: 'blank',
              quote: blankMarker,
              value,
            };
            if (writeWithAid(view, capture.from, capture.to, blankMarker, marker)) onClose();
          }}
        >
          <label className="writing-aid-field">
            {t('Indice privé (facultatif)')}
            <input
              maxLength={writingAidLimit}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <div className="dialog-actions">
            <button className="primary">{t('Insérer le blanc')}</button>
          </div>
        </form>
      </Dialog>
    );
  }
  if (panel.kind === 'aid' && aid && !attached) {
    const target = aid.kind === 'blank' ? capture?.quote === blankMarker : canTry(capture);
    return (
      <Dialog title={t('Passage à rattacher')} modal onClose={onClose}>
        <p className="writing-aid-quote">{aid.quote}</p>
        <label className="writing-aid-field">
          {aid.kind === 'blank' ? t('Indice privé (facultatif)') : t('Autre formulation')}
          <input value={aid.value} readOnly />
        </label>
        <div className="dialog-actions">
          <button
            className="soft"
            type="button"
            onClick={() => {
              if (view && !view.state.readOnly) changeAid(view, aid, true, true);
              onClose();
            }}
          >
            {t('Retirer le repère')}
          </button>
          <button
            className="primary"
            disabled={!target}
            type="button"
            onClick={() => {
              if (!view || !capture || !current(capture)) return stale();
              if (
                entries.some(
                  (entry) =>
                    entry.section === capture.section &&
                    entry.kind === aid.kind &&
                    entry.from === capture.from &&
                    entry.quote === capture.quote,
                )
              )
                return onError(t('Ce passage possède déjà un repère de ce type.'));
              reattachAid(view, aid, {
                ...aid,
                section: capture.section,
                from: capture.from,
                quote: capture.quote,
                id: aid.section === capture.section ? aid.id : crypto.randomUUID(),
              });
              onClose();
            }}
          >
            {t('Rattacher à la sélection')}
          </button>
        </div>
      </Dialog>
    );
  }
  if (isTrial && aid) {
    return (
      <Dialog title={t('Essai de formulation')} onClose={onClose}>
        <div className="writing-trial-controls">
          <div className="writing-trial-switch" role="group" aria-label={t('Formulation affichée')}>
            <button
              className="soft"
              aria-pressed={!alternative}
              onClick={() => setAlternative(false)}
            >
              {t('Original')}
            </button>
            <button
              className="soft"
              aria-pressed={alternative}
              onClick={() => setAlternative(true)}
            >
              {t('Essai')}
            </button>
          </div>
          <p className="writing-aid-quote">{aid.quote}</p>
          <label className="writing-aid-field">
            {t('Autre formulation')}
            <input
              value={aid.value}
              maxLength={writingAidLimit}
              onChange={(event) => {
                if (view && !view.state.readOnly) {
                  changeAid(view, { ...aid, value: event.target.value });
                  setAlternative(true);
                }
              }}
            />
          </label>
          <div className="dialog-actions">
            <button
              className="soft"
              onClick={() => {
                if (view && !view.state.readOnly) changeAid(view, aid, true, true);
                onClose();
              }}
            >
              {t('Garder l’original')}
            </button>
            <button
              className="primary"
              disabled={!aid.value.trim()}
              onClick={() => {
                if (
                  !view ||
                  view.state.readOnly ||
                  view.composing ||
                  aid.from === null ||
                  view.state.sliceDoc(aid.from, aid.from + aid.quote.length) !== aid.quote
                )
                  return stale();
                if (writeWithAid(view, aid.from, aid.from + aid.quote.length, aid.value, aid, true))
                  onClose();
              }}
            >
              {t('Adopter l’essai')}
            </button>
          </div>
        </div>
      </Dialog>
    );
  }
  return (
    <Dialog title={t('Compléter le blanc')} modal onClose={onClose}>
      {blankAid?.value && <p className="writing-aid-quote">{blankAid.value}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          finishBlank();
        }}
      >
        <label className="writing-aid-field">
          {t('Texte du blanc')}
          <input value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
        <div className="dialog-actions">
          <button className="primary" disabled={!value.trim()}>
            {t('Remplacer le blanc')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
