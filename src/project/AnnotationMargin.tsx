import type { Project } from '../contracts/project';
import { SourceBrowser } from '../sources/Browser';
import type { Source } from '../contracts/sources';
import type { AnnotationTarget } from './annotations';
import type { Dispatch, SetStateAction } from 'react';
import type { ManuscriptMatch } from '../app/projectSearch';
import type { ProjectController } from './useProject';
import { localizeMessage, t, useLocale } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { request } from '../platform/client';
import { resolveAnnotation } from './annotations';
import { type Annotation } from '../contracts/annotations';
import '../styles/annotations.css';
export interface AnnotationInput {
  p: Project | null;
  beginReaderRequest: () => () => boolean;
  annotationTarget: AnnotationTarget | null;
  doc: ProjectController;
  setAnnotationTarget: Dispatch<SetStateAction<AnnotationTarget | null>>;
  setAnnotationsOpen: Dispatch<SetStateAction<boolean>>;
  locateSourceMatch: (hit: ManuscriptMatch, matched: string) => Promise<void>;
}
export function Annotations({
  workspace: w,
  left,
  width,
  onDocument,
  onManage,
}: {
  workspace: AnnotationInput;
  left: number;
  width: number;
  onDocument: (source: Source, annotation: Annotation, replacing: boolean) => void;
  onManage: () => void;
}) {
  useLocale();
  const [replacement, setReplacement] = useState<string | null>(null);
  const [items, setItems] = useState<Annotation[]>([]),
    [note, setNote] = useState('');
  const [editing, setEditing] = useState<string | null>(null),
    [editNote, setEditNote] = useState('');
  const [resolved, setResolved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const path = w.p!.path,
    target = w.annotationTarget;
  const current = useRef(path);
  current.current = path;
  useEffect(
    () => () => {
      current.current = '';
    },
    [],
  );
  useEffect(() => {
    let live = true;
    void request('annotations', { projectPath: path })
      .then((v) => {
        if (live) setItems(v);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [path]);
  async function save(value?: Annotation, edit = false) {
    setBusy(true);
    setError('');
    try {
      if (value) {
        const updated = await request('updateAnnotation', {
          projectPath: path,
          id: value.id,
          revision: value.revision,
          note: edit ? editNote : value.note,
          done: edit ? value.done : !value.done,
        });
        if (current.current === path) {
          setItems((items) => items.map((i) => (i.id === updated.id ? updated : i)));
          setEditing(null);
        }
      } else if (target) {
        await w.doc.flush();
        const section = w.doc.ref.current?.sections.find((s) => s.id === target.section);
        if (w.doc.ref.current?.path !== path || section?.text !== target.original)
          throw new Error(t('Le passage a changé. Sélectionnez-le à nouveau pour l’annoter.'));
        const added = await request('addAnnotation', {
          projectPath: path,
          section: target.section,
          revision: section.revision,
          from: target.from,
          to: target.to,
          note,
          requestId: target.requestId,
          document: target.document,
          branch: target.branch,
        });
        if (current.current === path) {
          setItems((items) => [...items, added]);
          setNote('');
          w.setAnnotationTarget(null);
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside
      aria-label={t('Annotations du manuscrit')}
      className="annotation-margin"
      style={{ left, width }}
    >
      <header>
        <h2>{t('Annotations')}</h2>
        <button
          className="icon-button"
          aria-label={t('Fermer les annotations')}
          onClick={() => w.setAnnotationsOpen(false)}
        >
          <X size={15} />
        </button>
      </header>
      {target && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <blockquote>{target.text.slice(0, 200)}</blockquote>
          {target.document && (
            <p>
              {target.document.path} · {target.document.page} ·{' '}
              {target.document.quote || t('Zone sélectionnée')}
            </p>
          )}
          <label>
            {t('À vérifier ou à faire')}
            <textarea
              autoFocus
              maxLength={20000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button disabled={busy || !note.trim()}>{t('Ajouter l’annotation')}</button>
        </form>
      )}
      {error && <p role="alert">{localizeMessage(error)}</p>}
      <label className="annotation-filter">
        <input type="checkbox" checked={resolved} onChange={(e) => setResolved(e.target.checked)} />
        {t('Afficher les annotations résolues')}
      </label>
      {!items.some((a) => resolved || !a.done) && (
        <p className="hint">
          {items.length
            ? t('Tout est résolu.')
            : t('Sélectionnez un passage puis choisissez Annoter.')}
        </p>
      )}
      {items
        .filter((a) => resolved || !a.done)
        .map((a) => {
          const anchor = resolveAnnotation(a, w.p!.sections);
          return (
            <article key={a.id}>
              <button
                className="annotation-quote"
                disabled={!anchor}
                onClick={() =>
                  anchor &&
                  w.locateSourceMatch(
                    {
                      key: a.id,
                      section: anchor.section,
                      title: '',
                      from: anchor.from,
                      to: anchor.from + a.quote.length,
                      excerpt: a.quote,
                    },
                    a.quote,
                  )
                }
              >
                {a.quote.slice(0, 110)}
              </button>
              {!anchor && <small>{t('Passage modifié ou introuvable')}</small>}
              {a.document && (
                <div>
                  <button
                    onClick={async () => {
                      try {
                        const valid = w.beginReaderRequest();
                        const source = await request('source', { id: a.document!.sourceId });
                        if (!valid() || current.current !== path) return;
                        if (source.fingerprint !== a.document!.fingerprint)
                          throw new Error(t('Source modifiée. Vérifiez le lien documentaire.'));
                        onDocument(source, a, false);
                      } catch (e) {
                        setError(String(e));
                        setReplacement(a.id);
                      }
                    }}
                  >
                    {t('Retrouver la source')} · {a.document.path} · {a.document.page}
                  </button>
                  {a.document.quote && <blockquote>{a.document.quote}</blockquote>}
                  <button
                    aria-expanded={replacement === a.id}
                    onClick={() => setReplacement(replacement === a.id ? null : a.id)}
                  >
                    {t('Rattacher à une source')}
                  </button>
                  {replacement === a.id && (
                    <SourceBrowser
                      onManage={onManage}
                      onRead={(s) => {
                        if (s.kind === 'PDF' || s.kind === 'Image') onDocument(s, a, true);
                        else setError(t('Choisissez un PDF ou une image.'));
                      }}
                    />
                  )}
                </div>
              )}
              {editing === a.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save(a, true);
                  }}
                >
                  <label>
                    {t('Annotation')}
                    <textarea
                      autoFocus
                      value={editNote}
                      maxLength={20000}
                      onChange={(e) => setEditNote(e.target.value)}
                    />
                  </label>
                  <button disabled={busy || !editNote.trim()}>{t('Enregistrer')}</button>
                  <button type="button" onClick={() => setEditing(null)}>
                    {t('Annuler')}
                  </button>
                </form>
              ) : (
                <>
                  <p>{a.note}</p>
                  <button
                    onClick={() => {
                      setEditing(a.id);
                      setEditNote(a.note);
                    }}
                  >
                    {t('Modifier')}
                  </button>
                </>
              )}
              <button disabled={busy} onClick={() => void save(a)}>
                {a.done ? t('Rouvrir') : t('Marquer comme résolu')}
              </button>
            </article>
          );
        })}
    </aside>
  );
}
