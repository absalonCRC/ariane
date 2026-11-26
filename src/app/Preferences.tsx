import { WritingGoals } from '../components/WritingGoals';
import { useRuntimeModels } from './runtimeModels';
import { RuntimeModuleSettings } from './RuntimeModuleSettings';
import { PredictionSettings } from '../prediction/PredictionSettings';
import { CapturePreferences } from '../capture/CapturePreferences';
import { ShortcutSettings } from './commands/ShortcutSettings';
import { consumeShortcutSettings } from './commands/shortcuts';
import { EntityColorToggle } from '../components/EntityColorToggle';
import { EntityPreferences } from '../enrichment/EntityPreferences';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { t, useLocale } from '../i18n';
import { ReadingComfort } from '../components/ReadingComfort';
import { WritingModes } from '../components/WritingModes';
import { depthLevel } from '../components/depthLevels';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { Settings as Values } from '../contracts/settings';
import type { Project } from '../contracts/project';
import { native, request } from '../platform/client';
import { choosePath } from './choosePath';
import type { Theme } from './useTheme';
import { WorkspaceScreen } from '../components/WorkspaceScreen';
const pages = [
  ['appearance', 'Apparence'],
  ['writing', 'Écriture'],
  ['sources', 'Sources et références'],
  ['project', 'Projet et données'],
  ['models', 'Modèles locaux'],
  ['shortcuts', 'Raccourcis'],
] as const;
type PreferencePage = (typeof pages)[number][0];
type PreferenceLocation = { page: PreferencePage; control?: string; inner: number; outer: number };
const locations = new Map<string, PreferenceLocation>();
const controls = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary';
function controlKey(el: HTMLElement) {
  return [el.closest<HTMLElement>('[data-command]')?.dataset.command, el.tagName, el.getAttribute('type'), el.getAttribute('aria-label') ?? el.closest('label')?.firstChild?.textContent?.trim() ?? el.textContent?.trim()].join('|');
}
export function Preferences({
  value,
  onChange,
  onClose,
  enrichmentError,
  theme,
  onTheme,
  project,
  sources,
  onExport,
  onHistory,
  onTags,
  onError,
  flush,
}: {
  value: Values;
  onChange: (value: Partial<Values>) => void;
  onClose: () => void;
  enrichmentError?: string;
  theme: Theme;
  onTheme: (value: Theme) => void;
  project: Project;
  sources: ReactNode;
  onExport: () => void;
  onHistory: () => void;
  onTags?: () => void;
  onError: (error: unknown) => void;
  flush?: () => Promise<void>;
}) {
  useLocale();
  const models = useRuntimeModels();
  const [expandedTool, setExpandedTool] = useState<string>();
  const [page, setPage] = useState<PreferencePage>(() => {
    const saved = locations.get(project.path)?.page;
    return consumeShortcutSettings() ? 'shortcuts' : saved === 'models' && !native ? 'appearance' : saved ?? 'appearance';
  });
  const detach = useRef<() => void>(undefined);
  const rememberPage = useCallback((inner: HTMLDivElement | null) => {
    detach.current?.();
    detach.current = undefined;
    if (!inner) return;
    const outer = inner.closest<HTMLElement>('.workspace-screen');
    const prior = locations.get(project.path);
    const location = prior?.page === page ? prior : { page, inner: 0, outer: 0 };
    locations.set(project.path, location);
    const frame = requestAnimationFrame(() => {
      if (location.control) {
        const target = Array.from(inner.querySelectorAll<HTMLElement>(controls)).find(el => controlKey(el) === location.control);
        (target ?? outer?.querySelector<HTMLElement>('nav [aria-current="page"]'))?.focus({ preventScroll: true });
      }
      inner.scrollTop = location.inner;
      if (outer) outer.scrollTop = location.outer;
    });
    const scroll = () => { location.inner = inner.scrollTop; location.outer = outer?.scrollTop ?? 0; };
    const focus = (e: FocusEvent) => {
      if (e.target instanceof HTMLElement && e.target.matches(controls)) location.control = controlKey(e.target);
    };
    inner.addEventListener('focusin', focus);
    outer?.addEventListener('scroll', scroll, true);
    detach.current = () => {
      cancelAnimationFrame(frame);
      inner.removeEventListener('focusin', focus);
      outer?.removeEventListener('scroll', scroll, true);
    };
  }, [project.path, page]);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupResult, setBackupResult] = useState('');
  const backup = async (restore: boolean) => {
    if (backupBusy) return;
    setBackupBusy(true);
    setBackupResult('');
    try {
      const path = restore
        ? await choosePath('project-backup-open', { title: t('Choisir une sauvegarde du projet') })
        : null;
      if (restore && !path) return;
      const destination = await choosePath(
        restore ? 'project-restore-destination' : 'project-backup-destination',
        { title: t('Choisir le dossier de destination') },
      );
      if (!destination) return;
      if (!path) await flush?.();
      const result = path
        ? await request('projectRestoreCopy', { path, destination })
        : await request('projectBackup', { projectPath: project.path, destination });
      setBackupResult(
        t(path ? 'Copie restaurée dans {0}' : 'Projet sauvegardé dans {0}', { 0: result }),
      );
    } catch (error) {
      onError(error);
    } finally {
      setBackupBusy(false);
    }
  };
  return (
    <WorkspaceScreen
      title={t('Paramètres')}
      subtitle={project.name}
      onClose={onClose}
      onError={onError}
      busy={backupBusy}
      className="preferences-screen"
      capsuleTrail={[t(pages.find(([id]) => id === page)![1])]}
    >
      <div className="settings-workspace">
        <nav aria-label={t('Catégories de paramètres')}>
          {pages.filter(([id]) => id !== 'models' || native).map(([id, label]) => (
            <button
              key={id}
              aria-current={page === id ? 'page' : undefined}
              disabled={backupBusy}
              onClick={() => setPage(id)}
            >
              {t(label)}
            </button>
          ))}
        </nav>
        <div className="settings-page" key={page} ref={rememberPage}>
          <small className="settings-scope">{t(page === 'models' || page === 'shortcuts' ? 'Application' : page === 'appearance' || page === 'writing' ? 'Application et projet' : 'Ce projet')}</small>
          {page === 'models' && <><h2>{t('Modèles locaux')}</h2><RuntimeModuleSettings documentLanguage={value.language} expandedTool={expandedTool} /></>}
          {page === 'appearance' && (
            <>
              <h2>{t('Apparence')}</h2>
              <div className="settings-columns">
                <section className="settings-group">
                  <h3>{t('Interface')}</h3>
                  <p className="settings-description">
                    {t(
                      'Une interface calme, adaptée à votre lumière. Le thème s’applique à toute l’application.',
                    )}
                  </p>
                  <LanguageSwitcher />
                  <fieldset>
                    <legend>{t('Thème')}</legend>
                    <div className="theme-options">
                      {(['light', 'dark', 'system'] as const).map((choice) => (
                        <button
                          key={choice}
                          aria-pressed={theme === choice}
                          onClick={() => onTheme(choice)}
                        >
                          <span
                            className={'theme-sample theme-sample-' + choice}
                            aria-hidden="true"
                          >
                            Aa
                          </span>
                          {{ light: t('Clair'), dark: t('Sombre'), system: t('Système') }[choice]}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </section>
                <section className="settings-group">
                  <h3>{t('Texte de ce projet')}</h3>
                  <label>
                    {t('Typographie')}
                    <select
                      value={value.font}
                      onChange={(e) => onChange({ font: e.target.value as Values['font'] })}
                    >
                      <option value="literary">{t('Littéraire · EB Garamond')}</option>
                      <option value="sans">{t('Sans empattement · Figtree')}</option>
                      <option value="mono">{t('Chasse fixe · Source Code Pro')}</option>
                    </select>
                  </label>
                  <label>
                    {t('Taille du texte · {0} px', { 0: value.fontSize })}
                    <input
                      aria-label={t('Taille du texte')}
                      type="range"
                      min="17"
                      max="30"
                      value={value.fontSize}
                      onChange={(e) => onChange({ fontSize: +e.target.value })}
                    />
                  </label>
                  <ReadingComfort value={value} onChange={onChange} />
                </section>
              </div>
              <p
                className="settings-type-preview"
                style={{
                  fontFamily: {
                    literary: 'var(--writing-serif)',
                    sans: 'var(--writing-sans)',
                    mono: 'var(--writing-mono)',
                  }[value.font],
                  fontSize: value.fontSize,
                  lineHeight: value.lineHeight ?? 1.5,
                  maxWidth: value.columnWidth ?? 750,
                }}
              >
                {t('La page s’ouvre. Une phrase trouve son rythme.')}
              </p>
            </>
          )}
          {page === 'writing' && (
            <>
              <h2>{t('Écriture')}</h2>
              <p className="settings-description">
                {t('Les réglages du manuscrit suivent ce projet. La capture rapide et les préférences de prédiction sont communes à l’application.')}
              </p>
              <div className="settings-columns">
                <section className="settings-group">
                  <h3>{t('Ce projet')}</h3>
                  <WritingModes value={value} onChange={onChange} />
                  <EntityColorToggle value={value} onChange={onChange} />
                  {value.typewriter && (
                    <label className="preference-toggle">
                      <span>
                        {t('Son de machine à écrire')}
                        <small>{t('Jouer un son pendant la frappe dans le manuscrit.')}</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={value.typewriterSound}
                        onChange={(e) => onChange({ typewriterSound: e.target.checked })}
                      />
                    </label>
                  )}
                  <label className="preference-toggle">
                    <span>
                      {t('Révision')}
                      <small>{t('Afficher les repères de révision dans l’éditeur.')}</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={value.revision}
                      onChange={(e) => onChange({ revision: e.target.checked })}
                    />
                  </label>
                </section>
                <section className="settings-group">
                  <h3>{t('Document')}</h3>
                  <WritingGoals value={value} onChange={onChange} />
                  <label>
                    {t('Compteur')}
                    <select
                      value={value.countMode}
                      onChange={(e) =>
                        onChange({ countMode: e.target.value as Values['countMode'] })
                      }
                    >
                      <option value="words">{t('Mots')}</option>
                      <option value="characters">{t('Caractères')}</option>
                      <option value="lines">{t('Lignes')}</option>
                    </select>
                  </label>
                  <label>
                    {t('Langue du document')}
                    <select
                      value={value.language}
                      onChange={(e) => onChange({ language: e.target.value })}
                    >
                      <option value="fr">Français</option>
                      <option value="en">English</option>
                      <option value="es">Español</option>
                      <option value="de">Deutsch</option>
                      <option value="it">Italiano</option>
                      {!['fr', 'en', 'es', 'de', 'it'].includes(value.language) && (
                        <option value={value.language}>{value.language}</option>
                      )}
                    </select>
                  </label>

                </section>
              </div>
            </>
          )}
          {page === 'writing' && native && <section className="settings-group">
            <h3>{t('Application')}</h3>
            <CapturePreferences onError={onError} />
            <PredictionSettings projectPath={project.path} onError={onError} />
          </section>}
          {page === 'sources' && (
            <>
              <h2>{t('Sources et références')}</h2>
              <div className="settings-columns">
                <section className="settings-group">
                  <label>
                    {t('Profondeur ·')}
                    {depthLevel(value.depth).label}
                    <input
                      aria-label={t('Profondeur des sources')}
                      aria-valuetext={t('Niveau {0} : {1}', {
                        0: depthLevel(value.depth).index,
                        1: depthLevel(value.depth).label,
                      })}
                      type="range"
                      min="0"
                      max="5"
                      value={value.depth}
                      onChange={(e) => onChange({ depth: +e.target.value })}
                    />
                  </label>
                  <label>
                    {t('Style des citations')}
                    <select
                      value={value.citationStyle}
                      onChange={(e) =>
                        onChange({ citationStyle: e.target.value as Values['citationStyle'] })
                      }
                    >
                      <option value="notes">{t('Notes simples')}</option>
                      <option value="apa">{t('Bibliographie · APA')}</option>
                      <option value="chicago">{t('Bibliographie · Chicago')}</option>
                    </select>
                  </label>
                  <label className="preference-toggle">
                    <span>
                      {t('Enrichir les fiches pendant l’écriture')}
                      <small>
                        {native
                          ? t('Analyse locale après une pause, conservée dans ce projet.')
                          : t('Disponible dans l’application macOS.')}
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      checked={value.enrichment}
                      disabled={!native}
                      onChange={(e) => onChange({ enrichment: e.target.checked })}
                    />
                  </label>
                  <EntityPreferences value={value} onChange={onChange} modelAvailable={!native || !!models?.status?.installed.includes('memory')}
                    onModels={native ? () => {setExpandedTool('entities');setPage('models');} : undefined} />
                  {enrichmentError && (
                    <p role="status" className="error-text">
                      {t('Enrichissement suspendu : {0}', { 0: enrichmentError })}
                    </p>
                  )}
                </section>
                <section className="settings-group">
                  <h3>{t('Vaults connectés')}</h3>
                  {sources}
                </section>
              </div>
            </>
          )}
          {page === 'project' && (
            <>
              <h2>{t('Projet et données')}</h2>
              <div className="settings-columns">
                <section className="settings-group">
                  <dl className="project-information">
                    <dt>{t('Projet')}</dt>
                    <dd>{project.name}</dd>
                    <dt>{t('Emplacement')}</dt>
                    <dd>{native ? project.path : t('Aperçu local de ce navigateur')}</dd>
                    <dt>{t('Textes')}</dt>
                    <dd>
                      {t('{0} textes · {1} inclus dans le manuscrit', {
                        0: project.sections.filter((s) => s.kind === 'scene').length,
                        1: project.sections.filter(
                          (s) => s.kind === 'scene' && s.included !== false,
                        ).length,
                      })}
                    </dd>
                  </dl>
                </section>
                <section className="settings-group">
                  <h3>{t('Enregistrement')}</h3>
                  <p>
                    {t(
                      'Les modifications sont enregistrées automatiquement. Les versions permettent de conserver un état nommé et de revenir sur une révision.',
                    )}
                  </p>
                  <div className="settings-actions">
                    <button onClick={onHistory}>{t('Ouvrir les versions')}</button>
                    {onTags && <button onClick={onTags}>{t('Gérer les smart-tags')}</button>}
                    <button onClick={onExport}>{t('Exporter le manuscrit')}</button>
                  </div>
                  {native && (
                    <>
                      <div className="settings-actions">
                        <button disabled={backupBusy} onClick={() => void backup(false)}>
                          {t('Sauvegarder le projet')}
                        </button>
                        <button disabled={backupBusy} onClick={() => void backup(true)}>
                          {t('Restaurer une copie du projet')}
                        </button>
                        <button
                          disabled={backupBusy}
                          onClick={() => window.dispatchEvent(new Event('ariane-inbox-open'))}
                        >
                          {t('Sauvegarder ou restaurer les captures')}
                        </button>
                      </div>
                      {backupResult && <p role="status">{backupResult}</p>}
                    </>
                  )}
                  <h3>{t('Confidentialité')}</h3>
                  <p>
                    {t(
                      'La recherche et l’analyse s’exécutent localement dans l’application macOS. Les vaults externes restent en lecture seule.',
                    )}
                  </p>
                </section>
              </div>
            </>
          )}
          {page === 'shortcuts' && <ShortcutSettings onError={onError} />}
        </div>
      </div>
    </WorkspaceScreen>
  );
}
