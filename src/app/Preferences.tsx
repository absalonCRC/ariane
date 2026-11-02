import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { t, useLocale } from '../i18n';
import { ReadingComfort } from '../components/ReadingComfort';
import { WritingModes } from '../components/WritingModes';
import { depthLevel } from '../components/depthLevels';
import { useState, type ReactNode } from 'react';
import type { Settings as Values, Project } from './types';
import { native } from './client';
import type { Theme } from './useTheme';
import { WorkspaceScreen } from '../components/WorkspaceScreen';
const pages = [
  ['appearance', 'Apparence'],
  ['writing', 'Écriture'],
  ['sources', 'Sources et références'],
  ['project', 'Projet et données'],
  ['shortcuts', 'Raccourcis'],
] as const;
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
}) {
  useLocale();
  const [page, setPage] = useState<(typeof pages)[number][0]>('appearance');
  return (
    <WorkspaceScreen
      title={t('Paramètres')}
      subtitle={project.name}
      onClose={onClose}
      className="preferences-screen"
    >
      <div className="settings-workspace">
        <nav aria-label={t('Catégories de paramètres')}>
          {pages.map(([id, label]) => (
            <button
              key={id}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => setPage(id)}
            >
              {t(label)}
            </button>
          ))}
        </nav>
        <div className="settings-page" key={page}>
          {page === 'appearance' && (
            <>
              <h2>{t('Apparence')}</h2>
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
                      <span className={'theme-sample theme-sample-' + choice} aria-hidden="true">
                        Aa
                      </span>
                      {{ light: t('Clair'), dark: t('Sombre'), system: t('Système') }[choice]}
                    </button>
                  ))}
                </div>
              </fieldset>
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
                {t('Ces réglages sont conservés avec le projet.')}
              </p>
              <WritingModes value={value} onChange={onChange} />
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
              <label>
                {t('Compteur')}
                <select
                  value={value.countMode}
                  onChange={(e) => onChange({ countMode: e.target.value as Values['countMode'] })}
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
            </>
          )}
          {page === 'sources' && (
            <>
              <h2>{t('Sources et références')}</h2>
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
              {enrichmentError && (
                <p role="status" className="error-text">
                  {t('Enrichissement suspendu : {0}', { 0: enrichmentError })}
                </p>
              )}
              <h3>{t('Vaults connectés')}</h3>
              {sources}
            </>
          )}
          {page === 'project' && (
            <>
              <h2>{t('Projet et données')}</h2>
              <dl className="project-information">
                <dt>{t('Projet')}</dt>
                <dd>{project.name}</dd>
                <dt>{t('Emplacement')}</dt>
                <dd>{native ? project.path : t('Aperçu local de ce navigateur')}</dd>
                <dt>{t('Textes')}</dt>
                <dd>
                  {t('{0} textes · {1} inclus dans le manuscrit', {
                    0: project.sections.filter((s) => s.kind === 'scene').length,
                    1: project.sections.filter((s) => s.kind === 'scene' && s.included !== false)
                      .length,
                  })}
                </dd>
              </dl>
              <h3>{t('Enregistrement')}</h3>
              <p>
                {t(
                  'Les modifications sont enregistrées automatiquement. Les versions permettent de conserver un état nommé et de revenir sur une révision.',
                )}
              </p>
              <div className="settings-actions">
                <button onClick={onHistory}>{t('Ouvrir les versions')}</button>
                <button onClick={onExport}>{t('Exporter le manuscrit')}</button>
              </div>
              <h3>{t('Confidentialité')}</h3>
              <p>
                {t(
                  'La recherche et l’analyse s’exécutent localement dans l’application macOS. Les vaults externes restent en lecture seule.',
                )}
              </p>
            </>
          )}
          {page === 'shortcuts' && (
            <>
              <h2>{t('Raccourcis')}</h2>
              <dl className="shortcut-list">
                {[
                  [t('Rechercher textes et sources'), '⌘ ⇧ F'],
                  [t('Rejoindre une section'), '⌘ P'],
                  [t('Commandes'), '⌘ K'],
                  [t('Ouvrir ou replier la sidebar'), '⌘ ⇧ B'],
                  [t('Enregistrer'), '⌘ S'],
                  [t('Exporter'), '⌘ ⇧ E'],
                  [t('Dicter'), '⌘ ⇧ M'],
                  [t('Parcourir la bibliothèque'), '↑ ↓'],
                  [t('Replier / déplier une branche'), '← →'],
                  [t('Renommer dans la bibliothèque'), 'F2'],
                  [t('Sélectionner plusieurs textes'), '⌘ clic / ⇧ clic'],
                  [t('Annuler un rangement, dans la bibliothèque'), '⌘ Z'],
                ].map(([label, key]) => (
                  <div key={t(label)}>
                    <dt>{t(label)}</dt>
                    <dd>
                      <kbd>{key}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
      </div>
    </WorkspaceScreen>
  );
}
