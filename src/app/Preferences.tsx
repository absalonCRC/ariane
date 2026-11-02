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
  const [page, setPage] = useState<(typeof pages)[number][0]>('appearance');
  return (
    <WorkspaceScreen
      title="Paramètres"
      subtitle={project.name}
      onClose={onClose}
      className="preferences-screen"
    >
      <div className="settings-workspace">
        <nav aria-label="Catégories de paramètres">
          {pages.map(([id, label]) => (
            <button
              key={id}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => setPage(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-page" key={page}>
          {page === 'appearance' && (
            <>
              <h2>Apparence</h2>
              <p className="settings-description">
                Une interface calme, adaptée à votre lumière. Le thème s’applique à toute
                l’application.
              </p>
              <fieldset>
                <legend>Thème</legend>
                <div className="theme-options">
                  {(['light', 'dark', 'system'] as const).map((t) => (
                    <button key={t} aria-pressed={theme === t} onClick={() => onTheme(t)}>
                      <span className={'theme-sample theme-sample-' + t} aria-hidden="true">
                        Aa
                      </span>
                      {{ light: 'Clair', dark: 'Sombre', system: 'Système' }[t]}
                    </button>
                  ))}
                </div>
              </fieldset>
              <h3>Texte de ce projet</h3>
              <label>
                Typographie
                <select
                  value={value.font}
                  onChange={(e) => onChange({ font: e.target.value as Values['font'] })}
                >
                  <option value="literary">Littéraire · EB Garamond</option>
                  <option value="mono">Chasse fixe</option>
                </select>
              </label>
              <label>
                Taille du texte · {value.fontSize} px
                <input
                  aria-label="Taille du texte"
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
                  fontFamily: value.font === 'mono' ? 'var(--mono)' : 'var(--literary)',
                  fontSize: value.fontSize,
                  lineHeight: value.lineHeight ?? 1.5,
                  maxWidth: value.columnWidth ?? 750,
                }}
              >
                La page s’ouvre. Une phrase trouve son rythme.
              </p>
            </>
          )}
          {page === 'writing' && (
            <>
              <h2>Écriture</h2>
              <p className="settings-description">Ces réglages sont conservés avec le projet.</p>
              <WritingModes value={value} onChange={onChange} />
              <label className="preference-toggle">
                <span>
                  Révision<small>Afficher les repères de révision dans l’éditeur.</small>
                </span>
                <input
                  type="checkbox"
                  checked={value.revision}
                  onChange={(e) => onChange({ revision: e.target.checked })}
                />
              </label>
              <label>
                Compteur
                <select
                  value={value.countMode}
                  onChange={(e) => onChange({ countMode: e.target.value as Values['countMode'] })}
                >
                  <option value="words">Mots</option>
                  <option value="characters">Caractères</option>
                  <option value="lines">Lignes</option>
                </select>
              </label>
              <label>
                Langue du document
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
              <h2>Sources et références</h2>
              <label>
                Profondeur · {depthLevel(value.depth).label}
                <input
                  aria-label="Profondeur des sources"
                  aria-valuetext={`Niveau ${depthLevel(value.depth).index} : ${depthLevel(value.depth).label}`}
                  type="range"
                  min="0"
                  max="5"
                  value={value.depth}
                  onChange={(e) => onChange({ depth: +e.target.value })}
                />
              </label>
              <label>
                Style des citations
                <select
                  value={value.citationStyle}
                  onChange={(e) =>
                    onChange({ citationStyle: e.target.value as Values['citationStyle'] })
                  }
                >
                  <option value="notes">Notes simples</option>
                  <option value="apa">Bibliographie · APA</option>
                  <option value="chicago">Bibliographie · Chicago</option>
                </select>
              </label>
              <label className="preference-toggle">
                <span>
                  Enrichir les fiches pendant l’écriture
                  <small>
                    {native
                      ? 'Analyse locale après une pause, conservée dans ce projet.'
                      : 'Disponible dans l’application macOS.'}
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
                  Enrichissement suspendu : {enrichmentError}
                </p>
              )}
              <h3>Vaults connectés</h3>
              {sources}
            </>
          )}
          {page === 'project' && (
            <>
              <h2>Projet et données</h2>
              <dl className="project-information">
                <dt>Projet</dt>
                <dd>{project.name}</dd>
                <dt>Emplacement</dt>
                <dd>{native ? project.path : 'Aperçu local de ce navigateur'}</dd>
                <dt>Textes</dt>
                <dd>
                  {project.sections.filter((s) => s.kind === 'scene').length} textes ·{' '}
                  {
                    project.sections.filter((s) => s.kind === 'scene' && s.included !== false)
                      .length
                  }{' '}
                  inclus dans le manuscrit
                </dd>
              </dl>
              <h3>Enregistrement</h3>
              <p>
                Les modifications sont enregistrées automatiquement. Les versions permettent de
                conserver un état nommé et de revenir sur une révision.
              </p>
              <div className="settings-actions">
                <button onClick={onHistory}>Ouvrir les versions</button>
                <button onClick={onExport}>Exporter le manuscrit</button>
              </div>
              <h3>Confidentialité</h3>
              <p>
                La recherche et l’analyse s’exécutent localement dans l’application macOS. Les
                vaults externes restent en lecture seule.
              </p>
            </>
          )}
          {page === 'shortcuts' && (
            <>
              <h2>Raccourcis</h2>
              <dl className="shortcut-list">
                {[
                  ['Rechercher textes et sources', '⌘ ⇧ F'],
                  ['Rejoindre une section', '⌘ P'],
                  ['Commandes', '⌘ K'],
                  ['Ouvrir ou replier la sidebar', '⌘ ⇧ B'],
                  ['Enregistrer', '⌘ S'],
                  ['Exporter', '⌘ ⇧ E'],
                  ['Dicter', '⌘ ⇧ M'],
                  ['Parcourir la bibliothèque', '↑ ↓'],
                  ['Replier / déplier une branche', '← →'],
                  ['Renommer dans la bibliothèque', 'F2'],
                  ['Sélectionner plusieurs textes', '⌘ clic / ⇧ clic'],
                  ['Annuler un rangement, dans la bibliothèque', '⌘ Z'],
                ].map(([label, key]) => (
                  <div key={label}>
                    <dt>{label}</dt>
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
