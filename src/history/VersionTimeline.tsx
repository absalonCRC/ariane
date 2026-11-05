import type { Version } from '../app/types';
import { t, localeTag } from '../i18n';

export function versionDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(localeTag(), {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}
export function historySessions(versions: Version[]) {
  const groups = new Map<string, Version[]>();
  for (const version of versions) {
    // Legacy captures have no session identity: keep their day accessible without inventing ancestry.
    const key = version.automatic
      ? `auto:${version.sessionId ?? version.created.slice(0, 10)}`
      : version.id;
    const values = groups.get(key) ?? [];
    values.push(version);
    groups.set(key, values);
  }
  return [...groups.values()];
}
export function VersionTimeline(p: {
  versions: Version[];
  busy: boolean;
  onCompare: (v: Version) => void;
  onName: (v: Version) => void;
  onFork: (v: Version) => void;
}) {
  return (
    <section className="version-timeline" aria-label={t('Historique des versions')}>
      <p className="history-help">
        {t(
          'Les versions automatiques sont regroupées par séance. Nommez un état pour le conserver durablement.',
        )}
      </p>
      {!p.versions.length && <p className="history-empty">{t('Aucune version enregistrée')}</p>}
      {historySessions(p.versions).map((values) => {
        const version = values[0];
        const row = (v: Version) => (
          <div className="version-timeline-entry" key={v.id}>
            <button
              disabled={p.busy}
              onClick={() => p.onCompare(v)}
              className="version-timeline-title"
            >
              <span>{v.automatic ? t('Sauvegarde automatique') : v.name}</span>
              <time dateTime={v.created}>{versionDate(v.created)}</time>
            </button>
            <span className="version-timeline-scope">
              {v.scope ? t('Section et ses scènes') : t('Tout le projet')}
            </span>
            {v.automatic && (
              <button disabled={p.busy} onClick={() => p.onName(v)}>
                {t('Nommer cette version')}
              </button>
            )}
            {!v.scope && (
              <button disabled={p.busy} onClick={() => p.onFork(v)}>
                {t('Créer une variante depuis cet état')}
              </button>
            )}
          </div>
        );
        if (!version.automatic) return row(version);
        const scopes = new Set(values.map((v) => v.scope));
        return (
          <details className="version-session" key={version.sessionId ?? version.id}>
            <summary>
              <span>{t('Séance d’écriture')}</span>
              <time dateTime={version.created}>{versionDate(version.created)}</time>
              <small>
                {t('{0} état{1} · {2} texte{3}', {
                  0: values.length,
                  1: values.length > 1 ? 's' : '',
                  2: scopes.size,
                  3: scopes.size > 1 ? 's' : '',
                })}
              </small>
            </summary>
            {values.map(row)}
          </details>
        );
      })}
    </section>
  );
}
