import { localizeMessage, t, localeTag } from '../i18n';
import { createPortal } from 'react-dom';
import { request } from '../platform/client';
import type { Version } from '../contracts/history';
import type { HistoryProps } from './types';
import { useHistory } from './useHistory';
import { HistoryTools } from './HistoryTools';
import { Plus, ArrowDown, ArrowUp, ArrowRight, ArrowLeft } from 'lucide-react';
import { VersionTimeline } from './VersionTimeline';
import { Variants } from './Variants';
import { ReadingDiff } from './ReadingDiff';
import '../styles/history-refinements.css';

function versionLabel(version: Version) {
  const created = new Date(version.created);
  const date = Number.isNaN(created.getTime())
    ? version.created
    : new Intl.DateTimeFormat(localeTag(), {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(created);
  return `${version.name === 'Sauvegarde automatique' ? t('Sauvegarde automatique') : version.name} · ${date}`;
}
export function History(p: HistoryProps) {
  const {
    tab,
    setTab,
    history,
    promoting,
    setPromoting,
    origin,
    setOrigin,
    versions,
    setVersions,
    moreVersions,
    setMoreVersions,
    loadingMore,
    setLoadingMore,
    leftId,
    setLeftId,
    rightId,
    setRightId,
    loaded,
    loading,
    busy,
    setBusy,
    error,
    setError,
    name,
    setName,
    creating,
    setCreating,
    scope,
    setScope,
    setScene,
    onlyChanged,
    setOnlyChanged,
    view,
    setView,
    confirm,
    setConfirm,
    changeIndex,
    diffRef,
    comparisonVersions,
    incompatible,
    entries,
    visible,
    selected,
    metadata,
    rows,
    changes,
    added,
    removed,
    capture,
    restore,
    apply,
    changed,
    switchBranch,
    nextChange,
  } = useHistory(p);
  return (
    <section className="history-editor" aria-label={t('Versions du texte')} data-view={view}>
      {p.toolsHost &&
        createPortal(
          <HistoryTools
            p={p}
            busy={busy}
            setCreating={setCreating}
            onlyChanged={onlyChanged}
            setOnlyChanged={setOnlyChanged}
            loading={loading}
            loaded={loaded}
            setConfirm={setConfirm}
          />,
          p.toolsHost,
        )}
      <header className="history-modebar">
        <button onClick={p.onClose}>
          <ArrowLeft size={13} /> {t('Revenir au texte')}
        </button>
        <span>{t('Versions du texte')}</span>
        <button
          className="history-create-toggle"
          disabled={busy}
          onClick={() => {
            setPromoting(null);
            setCreating(true);
          }}
        >
          <Plus size={13} />
          {t('Nommer une version')}
        </button>
      </header>
      <nav className="history-tabs" aria-label={t('Parcourir les versions')}>
        {(['changes', 'history', 'variants'] as const).map((value) => (
          <button
            key={value}
            aria-current={tab === value ? 'page' : undefined}
            disabled={busy}
            onClick={() => setTab(value)}
          >
            {value === 'changes'
              ? t('Modifications')
              : value === 'history'
                ? t('Historique')
                : t('Variantes')}
          </button>
        ))}
      </nav>
      {error && (
        <p className="workspace-error" role="alert">
          {localizeMessage(error)}
        </p>
      )}
      <div className="history-capture">
        {' '}
        {creating && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void capture();
            }}
          >
            <label>
              {t('Nom')}
              <input
                required
                autoFocus
                placeholder={t('Avant révision, autre début…')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            {!promoting && (
              <label>
                {t('Portée')}
                <select value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option value="project">{t('Tout le projet')}</option>
                  {p.active && (
                    <option value="section">{t('Section actuelle et ses scènes')}</option>
                  )}
                </select>
              </label>
            )}
            <button className="history-save" disabled={busy || !name.trim()}>
              <Plus size={14} />
              {t('Conserver')}
            </button>
            <button
              type="button"
              className="history-create-cancel"
              onClick={() => {
                setCreating(false);
                setPromoting(null);
              }}
            >
              {t('Annuler')}
            </button>
          </form>
        )}
      </div>
      {tab === 'history' && (
        <VersionTimeline
          versions={versions}
          busy={busy}
          onCompare={(v) => {
            setLeftId(v.id);
            setRightId('current');
            setTab('changes');
          }}
          onName={(v) => {
            setPromoting(v);
            setName('');
            setCreating(true);
          }}
          onFork={(v) => {
            setOrigin(v);
            setTab('variants');
          }}
        />
      )}
      {tab === 'history' && moreVersions && versions.length >= 50 && (
        <button
          disabled={loadingMore}
          onClick={async () => {
            setLoadingMore(true);
            try {
              const page = await request('versions', { offset: versions.length });
              setVersions((old) => [
                ...old,
                ...page.filter((v) => !old.some((a) => a.id === v.id)),
              ]);
              setMoreVersions(page.length === 50);
            } catch (e) {
              setError(String(e));
            } finally {
              setLoadingMore(false);
            }
          }}
        >
          {t('Charger les versions précédentes')}
        </button>
      )}
      {tab === 'variants' && (
        <Variants
          project={p.project}
          state={history}
          busy={busy}
          flush={p.checkpoint ?? p.flush}
          onSwitch={(id) => switchBranch(id, true)}
          onWrite={p.onClose}
          onBusyChange={setBusy}
          onChanged={changed}
          fromVersion={origin}
          onClearOrigin={() => setOrigin(null)}
        />
      )}
      <div className="history-workspace" hidden={tab !== 'changes'}>
        {(versions.length > 0 || loaded.left) && (
          <nav className="history-text-list" aria-label={t('Textes de la comparaison')}>
            {entries
              .filter((e) => !onlyChanged || e.changed)
              .map((entry) => (
                <button
                  key={entry.id}
                  aria-current={entry.id === selected?.id ? 'page' : undefined}
                  onClick={() => {
                    setScene(entry.id);
                    if (p.project.sections.some((s) => s.id === entry.id))
                      p.onSelectText?.(entry.id);
                  }}
                >
                  <span>{entry.title}</span>
                  {entry.changed && (
                    <small>
                      {!entry.left ? t('Ajouté') : !entry.right ? t('Retiré') : t('Modifié')}
                    </small>
                  )}
                </button>
              ))}
          </nav>
        )}
        <section className="history-comparison" aria-label={t('Comparaison des versions')}>
          {!loading && !versions.length && !loaded.left && !error ? (
            <div className="history-first-version">
              <h2>{t('Aucune version enregistrée')}</h2>
              <p>
                {t(
                  'Les versions automatiques apparaîtront au fil de l’écriture. Vous pouvez aussi nommer une première étape.',
                )}
              </p>
              <button onClick={() => setCreating(true)}>
                <Plus size={14} /> {t('Conserver la première version')}
              </button>
            </div>
          ) : (
            <>
              <div className="history-controls">
                <label>
                  {t('Version de référence')}
                  <select
                    aria-label={t('Version de référence')}
                    value={leftId}
                    disabled={busy || !leftId}
                    onChange={(e) => setLeftId(e.target.value)}
                  >
                    <option value="current">{t('Texte actuel')}</option>
                    {comparisonVersions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {versionLabel(v)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('Comparer avec')}
                  <select
                    aria-label={t('Version comparée')}
                    value={rightId}
                    disabled={busy}
                    onChange={(e) => setRightId(e.target.value)}
                  >
                    <option value="current">{t('Texte actuel')}</option>
                    {comparisonVersions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {versionLabel(v)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {moreVersions && versions.length >= 50 && (
                <button
                  disabled={loadingMore}
                  onClick={async () => {
                    setLoadingMore(true);
                    try {
                      const page = await request('versions', {
                        offset: versions.length,
                      });
                      setVersions((old) => [
                        ...old,
                        ...page.filter((v) => !old.some((item) => item.id === v.id)),
                      ]);
                      setMoreVersions(page.length === 50);
                    } catch (e) {
                      setError(String(e));
                    } finally {
                      setLoadingMore(false);
                    }
                  }}
                >
                  {t('Charger les versions précédentes')}
                </button>
              )}
              <div className="history-diff-summary">
                <div className="history-diff-identity">
                  <select
                    className="history-scene-title"
                    aria-label={t('Texte comparé')}
                    value={selected?.id ?? ''}
                    onChange={(e) => {
                      setScene(e.target.value);
                      if (p.project.sections.some((s) => s.id === e.target.value))
                        p.onSelectText?.(e.target.value);
                    }}
                  >
                    {!visible.length && <option value="">{t('Aucun texte')}</option>}
                    {visible.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title}
                        {!e.left ? t(' · Ajouté') : !e.right ? t(' · Retiré') : ''}
                      </option>
                    ))}
                  </select>
                  <span className="diff-stat-add">{t('+{0} mots', { 0: added })}</span>
                  <span className="diff-stat-remove">{t('−{0} mots', { 0: removed })}</span>
                </div>
                <div className="history-diff-tools">
                  <div
                    className="history-view-switch"
                    role="group"
                    aria-label={t('Affichage de la comparaison')}
                  >
                    <button
                      type="button"
                      aria-pressed={view === 'source'}
                      onClick={() => setView('source')}
                    >
                      {t('Source')}
                    </button>
                    <button
                      type="button"
                      aria-pressed={view === 'reading'}
                      onClick={() => setView('reading')}
                    >
                      {t('Lecture')}
                    </button>
                  </div>
                  <div
                    className="history-inline-navigation"
                    role="group"
                    aria-label={t('Parcourir les modifications')}
                  >
                    <span className="history-change-count" aria-live="polite">
                      {loading
                        ? t('Chargement…')
                        : changeIndex < 0
                          ? t('{0} passage{1} modifié{2}', {
                              0: changes.length,
                              1: changes.length > 1 ? 's' : '',
                              2: changes.length > 1 ? 's' : '',
                            })
                          : `${changeIndex + 1} / ${changes.length}`}
                    </span>
                    <button
                      type="button"
                      disabled={loading || !!error || !!incompatible || !changes.length}
                      aria-label={t('Modification précédente')}
                      onClick={() => nextChange(-1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={loading || !!error || !!incompatible || !changes.length}
                      aria-label={t('Modification suivante')}
                      onClick={() => nextChange(1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                </div>
              </div>
              {confirm && (
                <div className="history-confirm" role="alert">
                  <p>
                    {t('Restaurer « {0} » {1} ? L’état actuel sera conservé avant restauration.', {
                      0: confirm.name,
                      1: confirm.scope ? t('pour sa section') : t('pour tout le projet'),
                    })}
                  </p>
                  <button disabled={busy} onClick={() => setConfirm(null)}>
                    {t('Annuler')}
                  </button>
                  <button disabled={busy} onClick={() => void restore()}>
                    {t('Confirmer la restauration')}
                  </button>
                </div>
              )}
              {loading ? (
                <p className="history-empty" role="status">
                  {t('Chargement des versions…')}
                </p>
              ) : incompatible ? (
                <p className="history-empty">
                  {t(
                    'Ces versions concernent des sections différentes. Comparez chacune avec le texte actuel.',
                  )}
                </p>
              ) : error ? null : (
                <>
                  {selected && metadata.length > 0 && (
                    <p className="history-metadata">{metadata.join(' · ')}</p>
                  )}
                  <div
                    className="history-diff-scroll"
                    ref={diffRef}
                    tabIndex={0}
                    aria-label={t('Passages comparés')}
                  >
                    {!rows.length && (
                      <p className="history-empty">
                        {selected
                          ? metadata.length
                            ? t(
                                'Le texte est identique ; les changements de structure figurent ci-dessus.',
                              )
                            : t('Ce texte est vide dans les deux versions.')
                          : t('Aucun texte dans cette sélection.')}
                      </p>
                    )}
                    {rows.map((row, index) => (
                      <div
                        key={index}
                        data-change={index}
                        className={
                          'history-diff-row' +
                          (row.changed ? ' is-changed' : '') +
                          (changes[changeIndex] === index ? ' is-current-change' : '')
                        }
                      >
                        <div
                          className={
                            'history-diff-cell ' +
                            (row.changed && row.left.length ? 'diff-removed' : '')
                          }
                        >
                          <span
                            className="diff-gutter"
                            aria-label={row.changed ? t('Retrait') : undefined}
                          >
                            {row.changed && row.left.length ? '−' : ''}
                            <small>{row.left.length ? row.leftStart + 1 : ''}</small>
                          </span>
                          <div className={'diff-prose' + (view === 'reading' ? ' is-reading' : '')}>
                            {view === 'reading' ? (
                              <ReadingDiff words={row.words} side="left" />
                            ) : (
                              row.words
                                .filter((w) => !w.added)
                                .map((w, i) =>
                                  w.removed ? (
                                    <del key={i}>{w.value}</del>
                                  ) : (
                                    <span key={i}>{w.value}</span>
                                  ),
                                )
                            )}
                          </div>
                        </div>
                        <div
                          className={
                            'history-diff-cell ' +
                            (row.changed && row.right.length ? 'diff-added' : '')
                          }
                        >
                          <span
                            className="diff-gutter"
                            aria-label={row.changed ? t('Ajout') : undefined}
                          >
                            {row.changed && row.right.length ? '+' : ''}
                            <small>{row.right.length ? row.rightStart + 1 : ''}</small>
                          </span>
                          <div className={'diff-prose' + (view === 'reading' ? ' is-reading' : '')}>
                            {view === 'reading' ? (
                              <ReadingDiff words={row.words} side="right" />
                            ) : (
                              row.words
                                .filter((w) => !w.removed)
                                .map((w, i) =>
                                  w.added ? (
                                    <ins key={i}>{w.value}</ins>
                                  ) : (
                                    <span key={i}>{w.value}</span>
                                  ),
                                )
                            )}
                          </div>
                        </div>
                        {row.changed && rightId === 'current' && selected?.right && (
                          <div className="history-passage-action">
                            <button disabled={busy} onClick={() => void apply(index)}>
                              <ArrowRight size={12} />
                              {t('Reprendre le passage de référence')}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <footer className="history-legend">
                    {rightId === 'current'
                      ? t(
                          'Les reprises de passages modifient le texte actuel. Une version est conservée avant chaque reprise.',
                        )
                      : t(
                          'Comparaison de deux instantanés. Choisissez « Texte actuel » à droite pour reprendre un passage.',
                        )}
                  </footer>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
}
