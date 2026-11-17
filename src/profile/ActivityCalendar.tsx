import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { localeTag, t, useLocale } from '../i18n';
import { calendarDays, localDay, type WritingActivityStore } from './writingActivity';

export function ActivityCalendar({ activity }: { activity: WritingActivityStore }) {
  useLocale();
  const data = useSyncExternalStore(activity.subscribe, activity.snapshot, activity.snapshot);
  const today = localDay(new Date()),
    currentYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [selected, setSelected] = useState(today);
  const grid = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = viewport.current;
    const reveal = () => {
      const cell = grid.current?.querySelector<HTMLButtonElement>(`[data-day="${selected}"]`);
      if (!element || !cell || element.scrollWidth <= element.clientWidth) return;
      const bounds = element.getBoundingClientRect(),
        target = cell.getBoundingClientRect();
      if (target.left < bounds.left || target.right > bounds.right)
        element.scrollLeft += target.left - bounds.left - (element.clientWidth - target.width) / 2;
    };
    reveal();
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(reveal);
    observer.observe(element);
    return () => observer.disconnect();
  }, [selected, year]);
  const days = calendarDays(year),
    weeks = days.length / 7;
  const firstYear = Math.min(Number(data.startedOn.slice(0, 4)), currentYear);
  const years = Array.from(
    { length: currentYear - firstYear + 1 },
    (_, index) => currentYear - index,
  );
  const entries = Object.entries(data.days).filter(
    ([day]) => day.startsWith(`${year}-`) && day <= today,
  );
  const words = entries.reduce((sum, [, entry]) => sum + Math.max(0, entry.netWords), 0);
  const number = (value: number) => value.toLocaleString(localeTag());
  const dateLabel = (day: string) =>
    new Date(`${day}T12:00:00`).toLocaleDateString(localeTag(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  const description = (day: string) =>
    day < data.startedOn
      ? t('Avant le début du suivi')
      : day > today
        ? t('À venir')
        : t('{0} mots ajoutés nets', { 0: number(Math.max(0, data.days[day]?.netWords ?? 0)) });
  const intensity = (day: string) => {
    const entry = data.days[day];
    if (!entry) return 0;
    return entry.netWords >= 500 ? 4 : entry.netWords >= 200 ? 3 : entry.netWords >= 50 ? 2 : 1;
  };
  return (
    <section className="writing-calendar" aria-labelledby="writing-calendar-title">
      <header>
        <div>
          <h2 id="writing-calendar-title">{t('Au fil des jours')}</h2>
          <p>
            {t('Jours d’écriture : {0} · Mots ajoutés nets : {1}', {
              0: number(entries.length),
              1: number(words),
            })}
          </p>
        </div>
        <label>
          <span className="calendar-year-label">{t('Année')}</span>
          <select
            value={year}
            onChange={(event) => {
              const next = Number(event.target.value);
              setYear(next);
              setSelected(next === currentYear ? today : `${next}-12-31`);
            }}
          >
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="calendar-overflow" ref={viewport}>
        <div
          className="calendar-chart"
          style={{ '--calendar-weeks': weeks } as React.CSSProperties}
        >
          <div className="calendar-months" aria-hidden="true">
            {Array.from({ length: weeks }, (_, week) => {
              const day = days
                .slice(week * 7, week * 7 + 7)
                .find((value) => value.startsWith(`${year}-`));
              if (!day) return <span key={week} />;
              const date = new Date(`${day}T12:00:00`);
              const previousDay = days
                .slice(Math.max(0, (week - 1) * 7), week * 7)
                .find((value) => value.startsWith(`${year}-`));
              const show = !previousDay || previousDay.slice(5, 7) !== day.slice(5, 7);
              return (
                <span key={week}>
                  {show ? date.toLocaleDateString(localeTag(), { month: 'short' }) : ''}
                </span>
              );
            })}
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {[t('Lun'), '', t('Mer'), '', t('Ven'), '', ''].map((label, index) => (
              <span key={index}>{label}</span>
            ))}
          </div>
          <div
            className="calendar-cells"
            ref={grid}
            role="group"
            aria-label={t('Calendrier d’activité d’écriture')}
          >
            {days.map((day, index) =>
              !day.startsWith(`${year}-`) ? (
                <span key={day} />
              ) : (
                <button
                  key={day}
                  data-day={day}
                  data-level={intensity(day)}
                  data-untracked={day < data.startedOn || day > today || undefined}
                  title={`${dateLabel(day)} · ${description(day)}`}
                  aria-label={`${dateLabel(day)} · ${description(day)}`}
                  aria-pressed={day === selected}
                  tabIndex={day === selected ? 0 : -1}
                  onFocus={() => setSelected(day)}
                  onClick={() => setSelected(day)}
                  onKeyDown={(event) => {
                    const offset = {
                      ArrowUp: -1,
                      ArrowDown: 1,
                      ArrowLeft: -7,
                      ArrowRight: 7,
                      Home: -(index % 7),
                      End: 6 - (index % 7),
                    }[event.key];
                    if (offset === undefined) return;
                    event.preventDefault();
                    const target = days[index + offset];
                    if (target?.startsWith(`${year}-`))
                      grid.current
                        ?.querySelector<HTMLButtonElement>(`[data-day="${target}"]`)
                        ?.focus();
                  }}
                />
              ),
            )}
          </div>
        </div>
      </div>
      <div className="calendar-caption">
        <p aria-live="polite">
          <strong>{dateLabel(selected)}</strong>
          <span>{description(selected)}</span>
        </p>
        <div className="calendar-legend" aria-label={t('Intensité de l’écriture')}>
          <span>{t('Moins')}</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <i key={level} data-level={level} aria-hidden="true" />
          ))}
          <span>{t('Plus')}</span>
        </div>
      </div>
      <p className="calendar-explanation">
        {t(
          'Suivi local depuis le {0}, dans tous vos projets sur cet appareil. Les suppressions et annulations corrigent le total du jour ; les jours de réécriture restent actifs.',
          { 0: dateLabel(data.startedOn) },
        )}
      </p>
      <p className="calendar-explanation">
        {t(
          'Les jours antérieurs ne sont pas mesurés. Les imports, restaurations et captures rapides ne sont pas comptés.',
        )}
      </p>
    </section>
  );
}
