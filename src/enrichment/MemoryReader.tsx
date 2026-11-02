import { localizeMessage, t, useLocale } from '../i18n';
import { AnimatedDetails } from '../components/AnimatedDetails';
import { usePresenceValue } from '../components/Presence';
import { useSharedPanel } from '../components/useSharedPanel';
import { useResumeLayout } from './useResumeLayout';
import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { request } from '../app/client';
import type { Workspace } from '../app/useWorkspace';
import type { Source } from '../app/types';
import type { MemoryController, MemoryEntity, MemoryPassage } from './useMemory';

interface EntityDetail extends MemoryEntity {
  passages: MemoryPassage[];
  fields: { name: string; value: string; section: string; node: string | null; quote: string }[];
  timeline: {
    date: string;
    expression?: string;
    approximate?: boolean;
    text: string;
    section: string;
    node: string | null;
    quote: string;
  }[];
}
export function MemoryReader({
  memory,
  workspace,
  projectMenuOpen = false,
  writingMenuOpen = false,
}: {
  memory: MemoryController;
  workspace: Workspace;
  projectMenuOpen?: boolean;
  writingMenuOpen?: boolean;
}) {
  useLocale();
  const [entity, setEntity] = useState<EntityDetail | null>(null);
  const [entities, setEntities] = useState<MemoryEntity[]>([]);
  const [error, setError] = useState('');
  const shown = usePresenceValue(
    useMemo(
      () => (memory.view ? { view: memory.view, origin: memory.origin } : null),
      [memory.view, memory.origin],
    ),
  );
  const view = shown.value?.view ?? null;
  const origin = shown.value?.origin;
  const floating = !!origin;
  const panel = useSharedPanel(origin, floating && view ? view.kind : null, memory.close);
  useResumeLayout(panel, view?.kind === 'resume', projectMenuOpen, writingMenuOpen);
  const path = workspace.p?.path;
  useEffect(() => {
    let alive = true;
    setEntity(null);
    setEntities([]);
    setError('');
    if (view?.kind === 'entity')
      void request<EntityDetail>('memoryEntity', { projectPath: path, id: view.id })
        .then((value) => {
          if (alive) setEntity(value);
        })
        .catch((e) => {
          if (alive) setError(String(e));
        });
    if (view?.kind === 'list')
      void request<MemoryEntity[]>('memoryList', { projectPath: path })
        .then((value) => {
          if (alive) setEntities(value);
        })
        .catch((e) => {
          if (alive) setError(String(e));
        });
    return () => {
      alive = false;
    };
  }, [view, path]);
  if (!view) return null;
  const locate = (p: { section: string; node: string | null; quote?: string }) => {
    memory.close();
    void workspace.locatePassage(p.section, p.node, p.quote ?? '');
  };
  async function readSource(
    id: string,
    page: number | null,
    fingerprint?: string,
    excerpt?: string,
  ) {
    try {
      const source = await request<Source>('memorySource', {
        id,
        fingerprint: fingerprint ?? null,
      });
      if (workspace.doc.ref.current?.path !== path) return;
      if (fingerprint && source.fingerprint !== fingerprint)
        throw new Error(t('Cette source a changé. Le rapprochement sera recalculé.'));
      memory.close();
      workspace.setReader({ ...source, page, ...(excerpt ? { selectedExcerpt: excerpt } : {}) });
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <aside
      ref={panel}
      className={'reader memory-reader motion-surface' + (floating ? ' shared-panel' : '')}
      data-phase={shown.exiting ? 'exit' : 'open'}
      inert={shown.exiting}
      aria-hidden={shown.exiting || undefined}
      aria-label={t('Mémoire du manuscrit')}
      data-view={view.kind}
      data-partitioned={view.kind === 'resume' && (projectMenuOpen || writingMenuOpen)}
    >
      {floating && (
        <div className="shared-panel-label" aria-hidden="true">
          {origin?.label}
        </div>
      )}
      <div className="panel-top">
        <span>{view.kind === 'resume' ? t('REPRENDRE LE FIL') : t('DEPUIS VOTRE TEXTE')}</span>
        <button className="icon-button" aria-label={t('Fermer la mémoire')} onClick={memory.close}>
          <X size={16} />
        </button>
      </div>
      {error && <p className="error-text">{localizeMessage(error)}</p>}
      {view.kind === 'list' && (
        <>
          <h2>{t('Au fil du manuscrit')}</h2>
          <p className="hint">
            {t('Les fiches se constituent à partir de vos passages, sans modifier vos sources.')}
          </p>
          {entities.map((e) => (
            <button
              className="search-result"
              key={e.id}
              onClick={() => memory.open({ kind: 'entity', id: e.id })}
            >
              <strong>{e.title}</strong>
              <small>{t('{0} passage(s)', { 0: e.passageCount })}</small>
            </button>
          ))}
          {!entities.length && (
            <p className="hint">
              {t('Les noms et les lieux reconnus apparaîtront ici après une pause d’écriture.')}
            </p>
          )}
          {memory.error && (
            <p className="hint">
              {t(
                'L’analyse locale est momentanément indisponible. Les informations déjà enregistrées restent accessibles.',
              )}
            </p>
          )}
        </>
      )}
      {view.kind === 'entity' && entity && (
        <>
          <h2>{entity.title}</h2>
          <p className="hint">
            {t('Informations dérivées du manuscrit · chaque passage reste la référence.')}
          </p>
          {!!entity.fields.length && (
            <dl className="enrichment-fields">
              {entity.fields.map((f, i) => (
                <div key={i}>
                  <dt>{t(f.name)}</dt>
                  <dd>
                    <button className="source-link" onClick={() => locate(f)}>
                      {f.value}
                    </button>
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {!!entity.timeline.length && (
            <AnimatedDetails open summary={<>{t('Repères dans le temps')}</>}>
              {entity.timeline.map((entry, i) => (
                <button className="memory-date" key={i} onClick={() => locate(entry)}>
                  <span>
                    {entry.approximate ? t('Vers ') : ''}
                    {entry.date}
                  </span>
                  <span>{entry.text}</span>
                </button>
              ))}
            </AnimatedDetails>
          )}
          <section className="enrichment">
            <h3>{t('Passages liés')}</h3>
            {entity.passages.map((p, i) => (
              <article className="enrichment-passage" key={i}>
                <blockquote>{p.quote}</blockquote>
                <button className="source-link" onClick={() => locate(p)}>
                  {t('Rejoindre le passage')}
                </button>
              </article>
            ))}
          </section>
        </>
      )}
      {view.kind === 'recall' && (
        <>
          <h2>{t('Dans votre manuscrit')}</h2>
          <blockquote>{view.passage.quote}</blockquote>
          <button onClick={() => locate(view.passage)}>{t('Rejoindre le passage')}</button>
          <button onClick={() => void memory.dismiss()}>{t('Masquer ce rapprochement')}</button>
        </>
      )}
      {view.kind === 'evidence' && (
        <>
          <h2>{view.evidence.title}</h2>
          <p className="hint">
            {t(
              'Passage à confronter à votre texte. Ce rapprochement ne constitue pas une confirmation.',
            )}
          </p>
          <blockquote>{view.evidence.quote}</blockquote>
          {view.evidence.page && <p className="hint">{t('Page {0}', { 0: view.evidence.page })}</p>}
          <button
            onClick={() =>
              void readSource(
                view.evidence.sourceId,
                view.evidence.page,
                view.evidence.fingerprint,
                view.evidence.quote,
              )
            }
          >
            {t('Lire dans la source')}
          </button>
          <button onClick={() => void memory.dismiss()}>{t('Masquer ce rapprochement')}</button>
        </>
      )}
      {view.kind === 'resume' && (
        <div className="resume-content">
          <h2 aria-hidden={projectMenuOpen || writingMenuOpen}>{t('Reprendre le fil')}</h2>
          {memory.resume?.section ? (
            <>
              <button className="search-result" onClick={() => locate(memory.resume!)}>
                <strong>{t('Dernier passage travaillé')}</strong>
                <small>
                  {workspace.p?.sections.find((s) => s.id === memory.resume?.section)?.title}
                </small>
              </button>
              {memory.resume.sourceId && (
                <button
                  className="search-result"
                  onClick={() =>
                    void readSource(memory.resume!.sourceId!, memory.resume!.sourcePage ?? null)
                  }
                >
                  <strong>{t('Dernière source consultée')}</strong>
                </button>
              )}
              {memory.resume.recent
                .filter(
                  (p) => p.section !== memory.resume?.section || p.node !== memory.resume?.node,
                )
                .slice(0, 1)
                .map((p) => (
                  <button
                    className="search-result"
                    key={p.section + p.node}
                    onClick={() => locate(p)}
                  >
                    <strong>
                      {workspace.p?.sections.find((s) => s.id === p.section)?.title ??
                        t('Passage précédent')}
                    </strong>
                  </button>
                ))}
            </>
          ) : (
            <p className="hint">
              {t('Le contexte de cette session sera conservé pendant votre travail.')}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
