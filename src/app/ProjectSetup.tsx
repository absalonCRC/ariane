import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, FolderOpen } from 'lucide-react';
import { t, useLocale } from '../i18n';
import { native } from '../platform/client';
import { RuntimeModuleSettings } from './RuntimeModuleSettings';

export interface NewProjectFields {
  name: string;
  initialTitle: string;
  language: string;
  folder: string | null;
}

const documentLanguages = [
  ['fr', 'Français'],
  ['en', 'English'],
  ['es', 'Español'],
  ['de', 'Deutsch'],
  ['it', 'Italiano'],
] as const;

export function ProjectSetup({
  firstProject,
  draft,
  onChange,
  busy,
  onBack,
  onCreate,
  onChooseFolder,
}: {
  firstProject: boolean | null;
  draft: NewProjectFields;
  onChange: (fields: Partial<NewProjectFields>) => void;
  busy: boolean;
  onBack: () => void;
  onCreate: (fields: NewProjectFields) => Promise<void>;
  onChooseFolder: () => Promise<void>;
}) {
  useLocale();
  const { name, initialTitle, language, folder } = draft;
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameInput.current?.focus({ preventScroll: true });
  }, []);
  const languageName = documentLanguages.find(([code]) => code === language)?.[1];
  const location = folder?.split('/').filter(Boolean).at(-1) || folder;
  const details = [
    initialTitle.trim(),
    languageName,
    native && (location || t('Dossier à choisir à la création')),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <main
      className="workspace-screen workspace-page project-setup"
      aria-labelledby="setup-title"
      onKeyDown={(event) => {
        if (
          event.key !== 'Escape' ||
          event.defaultPrevented ||
          busy ||
          event.target instanceof HTMLSelectElement
        )
          return;
        const disclosure =
          event.target instanceof HTMLElement
            ? event.target.closest<HTMLDetailsElement>('details[open]')
            : null;
        if (disclosure) {
          disclosure.open = false;
          disclosure.querySelector('summary')?.focus();
        } else {
          onBack();
        }
        event.preventDefault();
      }}
    >
      <header className="workspace-page-heading">
        <button type="button" className="workspace-return" disabled={busy} onClick={onBack}>
          <ArrowLeft size={13} aria-hidden="true" /> {t('Accueil')}
        </button>
        <h1 className="sr-only" id="setup-title">
          {t('Nouveau projet')}
        </h1>
      </header>
      <form
        id="new-project-form"
        className="setup-masthead"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() && !busy) void onCreate(draft);
        }}
      >
        <label className="setup-name">
          {t('Nom du projet')}
          <input
            className="document-title"
            required
            ref={nameInput}
            value={name}
            disabled={busy}
            placeholder={t('Le titre de votre projet')}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </label>
        <button className="primary" type="submit" disabled={busy || !name.trim()}>
          {t('Créer le projet')} <ArrowRight size={15} aria-hidden="true" />
        </button>
      </form>
      <details className="setup-options">
        <summary>
          <ChevronDown size={14} aria-hidden="true" />
          <span>{t('Détails du projet')}</span>
          <small>{details}</small>
        </summary>
        <fieldset disabled={busy}>
          <label>
            {t('Titre de la première scène')}
            <input
              form="new-project-form"
              value={initialTitle}
              placeholder={t('Sans titre')}
              onChange={(event) => onChange({ initialTitle: event.target.value })}
            />
          </label>
          <label>
            {t('Langue du document')}
            <select
              form="new-project-form"
              value={language}
              onChange={(event) => onChange({ language: event.target.value })}
            >
              {documentLanguages.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {native && (
            <div className="setup-folder">
              <span id="setup-location">{t('Emplacement')}</span>
              <button
                type="button"
                aria-describedby="setup-location"
                onClick={() => void onChooseFolder()}
                title={folder ?? undefined}
              >
                <FolderOpen size={15} aria-hidden="true" />
                <span>{folder ?? t('Choisir un dossier…')}</span>
              </button>
            </div>
          )}
        </fieldset>
      </details>
      {native && firstProject !== null && (
        <details className="setup-models" open={firstProject}>
          <summary>
            <span>{t('Modèles locaux')}</span>
            <ChevronDown size={16} aria-hidden="true" />
            <small>
              {t('Ces outils sont facultatifs. Vous pouvez aussi les ajouter dans les paramètres.')}
            </small>
          </summary>
          <RuntimeModuleSettings documentLanguage={language} firstProject={firstProject} />
        </details>
      )}
    </main>
  );
}
