import type { PathNotification } from '../project/PathMenu';
import type { RuntimeModule } from '../contracts/runtimeModules';
import { t, type Locale } from '../i18n';
import type { useRuntimeModels } from './runtimeModels';
import { choices, voices, languageOf, type OptionalTool, type VoiceLanguage } from './modelCatalog';

type Catalog = NonNullable<ReturnType<typeof useRuntimeModels>>;
const languages = Object.keys(voices) as VoiceLanguage[];
const optional = Object.keys(choices) as OptionalTool[];

export function modelNotifications(catalog: Catalog, locale: Locale): PathNotification[] {
  return catalog.notices.map((notice) => {
    const { id, key } = notice;
    const lang = languageOf(id);
    const voice = lang && voices[lang];
    const installed = catalog.status?.installed.includes(id);
    const active = catalog.active === id;
    const tool = optional.find((tool) => tool === id);
    const title = voice ? 'Lecture à voix haute' : tool ? choices[tool][0] : 'Modèles locaux';
    const firstVoice =
      voice && !languages.some((code) => catalog.status?.installed.includes(voices[code].id));
    const mb = voice ? voice.mb + (firstVoice ? 32 : 0) : tool ? choices[tool][2] : 0;
    const bytesLabel = t('{0} Mo', { 0: mb.toLocaleString(locale) });
    const choose = (next: RuntimeModule) =>
      catalog.select({ key, id: next, preference: languageOf(next) });
    const downloadLabel = notice.error ? t('Réessayer') : t('Télécharger · {0}', { 0: bytesLabel });
    const label = key === 'catalog' ? 'Modèles locaux' : title;
    return {
      id: 'model-' + key,
      message: notice.error
        ? t('Installation interrompue · {0}', { 0: voice ? voice.name : t(title) })
        : active
          ? t('Installation · {0}', { 0: voice ? voice.name : t(title) })
          : t(label),
      tone: notice.error ? 'error' : 'info',
      controls: (
        <span className="model-notice-controls" data-model-request={key}>
          {(key === 'reading' || key === 'catalog') && (
            <select
              aria-label={t(key === 'reading' ? 'Langue de lecture' : 'Modèle à installer')}
              value={id}
              disabled={active}
              onChange={(e) => choose(e.target.value as RuntimeModule)}
            >
              {languages.map((code) => (
                <option key={code} value={voices[code].id}>
                  {voices[code].language} · {voices[code].name}
                </option>
              ))}
              {key === 'catalog' &&
                optional.map((tool) => (
                  <option key={tool} value={tool}>
                    {t(choices[tool][0])}
                  </option>
                ))}
            </select>
          )}
          {active ? (
            <button type="button" onClick={() => void catalog.cancel()}>
              {t('Interrompre')}
            </button>
          ) : installed ? (
            <button
              type="button"
              onClick={() => {
                if (lang) catalog.choose(notice.preference ?? lang);
                catalog.dismiss(key);
              }}
            >
              {t(lang ? 'Utiliser cette voix' : 'Installé')}
            </button>
          ) : id === 'cleanup' && catalog.status && !catalog.status.installed.includes('voice') ? (
            <button type="button" onClick={() => choose('voice')}>
              {t('Installer la dictée d’abord')}
            </button>
          ) : !catalog.status && catalog.error ? (
            <button type="button" onClick={catalog.retry}>
              {t('Actualiser')}
            </button>
          ) : (
            <button
              type="button"
              disabled={!catalog.status || !!catalog.active}
              title={
                notice.error ||
                (firstVoice
                  ? t('La première voix inclut 32 Mo partagés pour le suivi des mots.')
                  : ['voice', 'memory'].includes(id)
                    ? bytesLabel + ' ' + t('+ dépendances')
                    : undefined)
              }
              onClick={() => void catalog.install(id, notice.preference ?? lang, key)}
            >
              {downloadLabel}
            </button>
          )}
        </span>
      ),
      onDismiss: () => catalog.dismiss(key),
    };
  });
}
