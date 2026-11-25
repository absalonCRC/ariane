import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, FileText, FolderOpen, Languages } from 'lucide-react';
import { t, useLocale } from '../i18n';
import { native } from '../platform/client';
import { choosePath } from './choosePath';
import { RuntimeModuleSettings } from './RuntimeModuleSettings';

export interface NewProjectFields {
  name: string;
  initialTitle: string;
  language: string;
  folder: string | null;
}

export function ProjectSetup({
  firstProject,
  busy,
  onBack,
  onCreate,
  onError,
}: {
  firstProject: boolean | null;
  busy: boolean;
  onBack: () => void;
  onCreate: (fields: NewProjectFields) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const locale = useLocale();
  const [language, setLanguage] = useState<string>(locale);
  const [name, setName] = useState('');
  const [initialTitle, setInitialTitle] = useState('');
  const [folder, setFolder] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const locked = busy || choosing;
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameInput.current?.focus({ preventScroll: true });
  }, []);
  async function chooseFolder() {
    setChoosing(true);
    try {
      const picked = await choosePath('create', { title: t('Enregistrer le projet dans…') });
      if (picked) setFolder(picked);
    } catch (error) {
      onError(error);
    } finally {
      setChoosing(false);
    }
  }
  return (
    <main
      className="workspace-screen workspace-page project-setup"
      data-first-project={firstProject || undefined}
      aria-labelledby="setup-title"
      onKeyDown={(e) => {
        if (
          e.key === 'Escape' &&
          !e.defaultPrevented &&
          !locked &&
          !(e.target instanceof HTMLSelectElement)
        )
          onBack();
      }}
    >
      <header className="workspace-page-heading">
        <button type="button" className="workspace-return" disabled={locked} onClick={onBack}>
          <ArrowLeft size={13} aria-hidden="true" /> {t('Accueil')}
        </button>
        <h1 className="sr-only" id="setup-title">
          {t('Nouveau projet')}
        </h1>
      </header>
      <form
        id="new-project-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && !locked) void onCreate({ name, initialTitle, language, folder });
        }}
      >
        <fieldset disabled={locked}>
          <label className="setup-name">
            {t('Nom du projet')}
            <input
              className="document-title"
              required
              ref={nameInput}
              value={name}
              placeholder={t('Le titre de votre projet')}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="setup-row">
            <span>
              <FileText aria-hidden="true" size={16} />
              {t('Titre de la première scène')}
            </span>
            <input
              value={initialTitle}
              placeholder={t('Sans titre')}
              onChange={(e) => setInitialTitle(e.target.value)}
            />
          </label>
          <label className="setup-row">
            <span>
              <Languages aria-hidden="true" size={16} />
              {t('Langue du document')}
            </span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="fr">Français</option>
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="de">Deutsch</option>
              <option value="it">Italiano</option>
            </select>
          </label>
          {native && (
            <div className="setup-row setup-folder">
              <span id="setup-location">
                <FolderOpen aria-hidden="true" size={16} />
                {t('Emplacement')}
              </span>
              <button
                type="button"
                aria-describedby="setup-location"
                onClick={() => void chooseFolder()}
                title={folder ?? undefined}
              >
                <span>{folder ?? t('Choisir un dossier…')}</span>
              </button>
            </div>
          )}
        </fieldset>
      </form>
      {native && firstProject !== null && (
        <details className="setup-models" open={firstProject}>
          <summary>
            <span>{t('Modèles locaux')}</span>
            <small>{t('Outils facultatifs pour lire, dicter et réviser.')}</small>
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <RuntimeModuleSettings documentLanguage={language} firstProject={firstProject} />
        </details>
      )}
      <div className="setup-actions">
        <button
          className="primary"
          type="submit"
          form="new-project-form"
          disabled={locked || !name.trim()}
        >
          {t('Créer le projet')} <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>
    </main>
  );
}
