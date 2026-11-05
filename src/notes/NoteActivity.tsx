import { t, useLocale, localeTag } from '../i18n';
import type { NoteActivityController } from './useNoteActivity';
import { noteActionLabels } from './useNoteActivity';
import type { NoteEvent } from '../contracts/noteActivity';
export function NoteActivity({
  activity,
  onOpen,
}: {
  activity: NoteActivityController;
  onOpen: (event: NoteEvent) => void;
}) {
  useLocale();
  return (
    <section className="note-activity" aria-label={t('Activité des notes')}>
      <h3>{t('Activité des notes')}</h3>
      {activity.error && (
        <>
          <p role="alert">{activity.error}</p>
          <button onClick={() => void activity.retry()}>{t('Réessayer')}</button>
        </>
      )}
      {!activity.items.length && !activity.loading && (
        <p>{t('Les détections, suggestions et actions sur les notes apparaîtront ici.')}</p>
      )}
      <ol>
        {activity.items.map((event) => (
          <li key={event.id}>
            <span className="note-activity-action">{t(noteActionLabels[event.kind])}</span>
            {event.sourceId || event.entityId ? (
              <button onClick={() => onOpen(event)}>{event.title}</button>
            ) : (
              <strong>{event.title}</strong>
            )}
            <time dateTime={event.created}>
              {new Date(event.created).toLocaleString(localeTag())}
            </time>
          </li>
        ))}
      </ol>
      {activity.loading && <p role="status">{t('Chargement…')}</p>}
      {activity.hasMore && (
        <button disabled={activity.loading} onClick={() => void activity.loadMore()}>
          {t('Afficher les événements précédents')}
        </button>
      )}
    </section>
  );
}
