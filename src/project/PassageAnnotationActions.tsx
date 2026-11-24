import { useState } from 'react';
import type { RefObject } from 'react';
import type { Annotation, PassageAnchor } from '../contracts/annotations';
import { t } from '../i18n';
import { request } from '../platform/client';
import type { AnnotationRecorder } from '../voice/types';
import type { AnnotationInput } from './AnnotationMargin';
import { captureAnchor, type AnnotationTarget } from './annotations';
import { deliverAnnotation } from './annotationDictation';

export async function confirmedAnchor(w: AnnotationInput, target: AnnotationTarget) {
  const path = w.p?.path;
  await w.doc.flush();
  const section = w.doc.ref.current?.sections.find((s) => s.id === target.section);
  if (
    w.doc.ref.current?.path !== path ||
    !section ||
    section.text !== target.original ||
    section.text.slice(target.from, target.to) !== target.text ||
    !target.text
  )
    throw new Error(t('Le passage a changé. Sélectionnez-le à nouveau pour l’annoter.'));
  return captureAnchor(section, target.from, target.to);
}
export function PassageAnnotationActions({
  workspace: w,
  branch,
  recorder,
  onSaved,
  onError,
}: {
  workspace: AnnotationInput;
  branch: string;
  recorder: RefObject<AnnotationRecorder | null>;
  onSaved: (a: Annotation) => void;
  onError: (e: unknown) => void;
}) {
  const [first, setFirst] = useState<{ origin: PassageAnchor; id: string } | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const target = w.annotationTarget;
  const path = w.p!.path;
  async function act(kind: 'link' | 'dictation') {
    if (!target || busy) return;
    setBusy(true);
    try {
      const selected = await confirmedAnchor(w, target);
      if (kind === 'dictation') {
        const id = crypto.randomUUID();
        if (!recorder.current) throw new Error(t('Microphone indisponible.'));
        recorder.current.begin(async (text) => {
          try {
            const value = await deliverAnnotation(
              {
                id,
                projectPath: path,
                branch,
                action: { kind: 'dictation', origin: selected, note: text },
              },
              w.doc.flush,
            );
            onSaved(value);
          } catch (e) {
            onError(e);
            throw e;
          }
        });
      } else if (!first) {
        setFirst({ origin: selected, id: crypto.randomUUID() });
        w.setAnnotationTarget(null);
      } else {
        const value = await request('passageAnnotation', {
          projectPath: path,
          branch,
          id: first.id,
          action: { kind: 'link', origin: first.origin, destination: selected, caption },
        });
        onSaved(value);
        setFirst(null);
        setCaption('');
        w.setAnnotationTarget(null);
      }
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="passage-actions"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && first) {
          e.stopPropagation();
          setFirst(null);
          setCaption('');
        }
      }}
    >
      {first && (
        <>
          <blockquote>{first.origin.quote}</blockquote>
          <p>{t('Sélectionnez la destination, puis choisissez Annoter.')}</p>
          <label>
            {t('Légende facultative')}
            <input value={caption} maxLength={20000} onChange={(e) => setCaption(e.target.value)} />
          </label>
          <button
            onClick={() => {
              setFirst(null);
              setCaption('');
            }}
          >
            {t('Annuler le lien')}
          </button>
        </>
      )}
      {target && !target.document && (
        <>
          <button disabled={busy} onClick={() => void act('link')}>
            {first ? t('Relier à cette sélection') : t('Nouer deux passages')}
          </button>
          <button disabled={busy} onClick={() => void act('dictation')}>
            {t('Dicter une annotation')}
          </button>
        </>
      )}
    </div>
  );
}
