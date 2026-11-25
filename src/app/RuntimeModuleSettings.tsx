import { useState } from 'react';
import {
  AudioLines,
  BookOpen,
  Check,
  ChevronDown,
  Download,
  FilePenLine,
  Mic,
  ScanText,
  Search,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { t, useLocale } from '../i18n';
import type { RuntimeModule } from '../contracts/runtimeModules';
import { ModelPreview } from './ModelPreview';
import { useRuntimeModels } from './runtimeModels';
import {
  choices,
  voices,
  voiceLanguage,
  type OptionalTool,
  type ReadingPreference,
} from './modelCatalog';
const size = (mb: number, locale: string) => t('{0} Mo', { 0: mb.toLocaleString(locale) });

function InstallButton({ id, label }: { id: RuntimeModule; label: string }) {
  const catalog = useRuntimeModels()!;
  const installed = catalog.status?.installed.includes(id);
  if (installed)
    return (
      <span className="model-ready">
        <Check size={14} />
        {t('Installé')}
      </span>
    );
  if (catalog.active === id)
    return (
      <button type="button" className="model-action" onClick={() => void catalog.cancel()}>
        {t('Interrompre')}
      </button>
    );
  return (
    <button
      type="button"
      className="model-action"
      disabled={
        !catalog.status ||
        !!catalog.active ||
        (id === 'cleanup' && !catalog.status.installed.includes('voice'))
      }
      aria-label={t('Télécharger · {0}', { 0: t(label) })}
      onClick={() => void catalog.install(id)}
    >
      <Download size={14} />
      {t('Télécharger')}
    </button>
  );
}
function Tool({ id }: { id: OptionalTool }) {
  const [title, model, mb] = choices[id];
  const locale = useLocale();
  const catalog = useRuntimeModels()!;
  const needsVoice = id === 'cleanup' && !catalog.status?.installed.includes('voice');
  return (
    <div className="model-line">
      <div>
        <strong>{t(title)}</strong>
        <small>
          {model} · ≈ {size(mb, locale)}
          {(id === 'voice' || id === 'memory') && ' ' + t('+ dépendances')}
          {needsVoice && ' · ' + t('Nécessite la dictée')}
        </small>
      </div>
      <InstallButton id={id} label={title} />
      <ModelPreview id={id} />
    </div>
  );
}
function ReadingVoicePicker({ documentLanguage }: { documentLanguage: string }) {
  const locale = useLocale();
  const catalog = useRuntimeModels()!;
  const [choice, setChoice] = useState<ReadingPreference>(catalog.preferred);
  const doc = voiceLanguage(documentLanguage);
  const language = choice === 'auto' ? (doc ?? 'fr') : choice;
  const voice = voices[language];
  const installed = catalog.status?.installed.includes(voice.id);
  const hasVoice = Object.values(voices).some((v) => catalog.status?.installed.includes(v.id));
  const select = (value: ReadingPreference) => {
    setChoice(value);
    const target = value === 'auto' ? doc : value;
    if (target && catalog.status?.installed.includes(voices[target].id)) catalog.choose(value);
  };
  const activeChoice = choice === 'auto' && !doc ? language : choice;
  return (
    <div className="voice-picker">
      <label>
        <span>{t('Langue de lecture')}</span>
        <select
          disabled={!!catalog.active}
          value={activeChoice}
          onChange={(e) => select(e.target.value as ReadingPreference)}
        >
          {doc && (
            <option value="auto">
              {t('Langue du document · {0}', { 0: voices[doc].language })}
            </option>
          )}
          {Object.entries(voices).map(([code, v]) => (
            <option key={code} value={code}>
              {v.language}
            </option>
          ))}
        </select>
      </label>
      <div className="voice-preview">
        <AudioLines size={20} strokeWidth={1.5} />
        <span>
          <strong>{voice.name}</strong>
          <small>{voices[language].language} · Pocket TTS</small>
        </span>
        {installed && (
          <span className="model-ready">
            <Check size={14} />
            {t('Installé')}
          </span>
        )}
        <ModelPreview id={voice.id} />
      </div>
      {!installed && !hasVoice && (
        <p className="model-note">
          {t('La première voix inclut 32 Mo partagés pour le suivi des mots.')}
        </p>
      )}
      {catalog.active === voice.id ? (
        <button type="button" className="model-action" onClick={() => void catalog.cancel()}>
          {t('Interrompre')}
        </button>
      ) : !installed ? (
        <button
          type="button"
          className="model-action"
          disabled={!catalog.status || !!catalog.active}
          onClick={() => void catalog.install(voice.id, activeChoice)}
        >
          <Download size={14} />
          {t('Télécharger la voix · {0}', { 0: size(voice.mb + (hasVoice ? 0 : 32), locale) })}
        </button>
      ) : null}
    </div>
  );
}
const groups: {
  id: string;
  title: string;
  hint: string;
  icon: LucideIcon;
  tools: OptionalTool[];
}[] = [
  {
    id: 'reading',
    title: 'Lecture à voix haute',
    hint: 'Écouter un passage du manuscrit.',
    icon: BookOpen,
    tools: [],
  },
  {
    id: 'dictation',
    title: 'Dictée',
    hint: 'Écrire à la voix ou dicter une annotation.',
    icon: Mic,
    tools: ['voice', 'cleanup'],
  },
  {
    id: 'entities',
    title: 'Entités du manuscrit',
    hint: 'Repérer les personnes, les lieux et les organisations.',
    icon: ScanText,
    tools: ['memory'],
  },
  {
    id: 'revision',
    title: 'Révision',
    hint: 'Vérifier la grammaire ou retravailler le style.',
    icon: FilePenLine,
    tools: ['revision', 'salamandra'],
  },
];
const firstProjectGroups = [
  ...groups.filter((group) => group.id === 'dictation'),
  ...groups.filter((group) => group.id !== 'dictation'),
];
export function RuntimeModuleSettings({
  documentLanguage = 'fr',
  expandedTool,
  firstProject = false,
}: {
  documentLanguage?: string;
  expandedTool?: string;
  firstProject?: boolean;
}) {
  useLocale();
  const catalog = useRuntimeModels();
  if (!catalog) return null;
  const included = (
    <div className="model-included">
      <Search size={19} strokeWidth={1.5} />
      <div>
        <strong>{t('Recherche sémantique')}</strong>
        <small>{t('Retrouver un passage par son sens.')}</small>
      </div>
      <span className="model-ready">
        <Check size={14} />
        {t('Inclus')}
      </span>
      <ModelPreview id="semantic" />
    </div>
  );
  return (
    <section className="model-library" aria-label={t('Modèles locaux')}>
      {!firstProject && included}
      <h3>{t('Outils à la demande')}</h3>
      {(firstProject ? firstProjectGroups : groups).map(
        ({ id, title, hint, icon: Icon, tools }) => (
          <details
            key={id}
            open={firstProject || id === expandedTool || undefined}
            className="model-group"
          >
            <summary>
              <Icon size={19} strokeWidth={1.5} />
              <span>
                <strong>{t(title)}</strong>
                <small>{t(hint)}</small>
              </span>
              {id === 'reading' && (
                <span className="model-languages">
                  {Object.values(voices)
                    .filter((v) => catalog.status?.installed.includes(v.id))
                    .map((v) => v.language)
                    .join(' · ')}
                </span>
              )}
              <ChevronDown size={16} />
            </summary>
            <div className="model-group-body">
              {id === 'reading' ? (
                <ReadingVoicePicker documentLanguage={documentLanguage} />
              ) : (
                tools.map((id) => <Tool key={id} id={id} />)
              )}
            </div>
          </details>
        ),
      )}
      {firstProject && included}
      {catalog.error && (
        <div className="model-error" role="alert">
          {catalog.error}{' '}
          <button type="button" onClick={catalog.retry}>
            {t('Actualiser')}
          </button>
        </div>
      )}
    </section>
  );
}
