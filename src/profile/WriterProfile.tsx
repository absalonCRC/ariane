import { ActivityCalendar } from './ActivityCalendar';
import type { WritingActivityStore } from './writingActivity';
import { useState } from 'react';
import {
  ArrowUpRight,
  Feather,
  GitCompareArrows,
  LibraryBig,
  Settings2,
  UserRound,
} from 'lucide-react';
import { WorkspaceScreen } from '../components/WorkspaceScreen';
import type { Project, Section } from '../contracts/project';
import { localeTag, t, useLocale } from '../i18n';
import { identityKey, manuscriptSummary, readIdentity } from './model';
import './profile.css';

export function WriterProfile({
  project,
  activity,
  selected,
  onClose,
  onResume,
  onError,
  onNavigate,
}: {
  project: Project;
  activity?: WritingActivityStore;
  selected?: Section;
  onClose: () => void;
  onResume: () => void;
  onError: (error: unknown) => void;
  onNavigate: (surface: 'preferences' | 'history' | 'projects') => void;
}) {
  useLocale();
  const [identity, setIdentity] = useState(readIdentity);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(identity);
  const summary = manuscriptSummary(project.sections);
  const number = (value: number) => value.toLocaleString(localeTag());
  const percent = summary.goal ? Math.round((summary.goalWords / summary.goal) * 100) : 0;
  const initials = identity.name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join('');
  return (
    <WorkspaceScreen
      title={t('Profil')}
      onClose={onClose}
      onReturnToText={onResume}
      onError={onError}
      className="profile-screen"
    >
      <div className="profile-scroll">
        <div className="writer-dashboard">
          <section className="writer-identity" aria-label={t('Votre profil')}>
            <div className="writer-avatar" aria-hidden="true">
              {initials || <UserRound size={30} strokeWidth={1.2} />}
            </div>
            <div className="writer-introduction">
              <h2>{identity.name || t('Votre espace d’écriture')}</h2>
              {identity.intention && <p>{identity.intention}</p>}
              <span className="writer-local">{t('Profil local · sur cet appareil')}</span>
            </div>
            <button
              className="profile-edit"
              aria-expanded={editing}
              onClick={() => {
                setDraft(identity);
                setEditing(!editing);
              }}
            >
              {t('Modifier le profil')}
            </button>
          </section>
          {editing && (
            <form
              className="writer-form"
              onSubmit={(event) => {
                event.preventDefault();
                const next = { name: draft.name.trim(), intention: draft.intention.trim() };
                try {
                  localStorage.setItem(identityKey, JSON.stringify(next));
                  setIdentity(next);
                  setEditing(false);
                } catch (error) {
                  onError(error);
                }
              }}
            >
              <label>
                {t('Nom ou nom de plume')}
                <input
                  autoFocus
                  maxLength={80}
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </label>
              <label>
                {t('Quelques mots sur votre écriture')}
                <textarea
                  maxLength={240}
                  rows={2}
                  value={draft.intention}
                  onChange={(event) => setDraft({ ...draft, intention: event.target.value })}
                />
              </label>
              <div>
                <button type="submit">{t('Enregistrer')}</button>
                <button type="button" onClick={() => setEditing(false)}>
                  {t('Annuler')}
                </button>
              </div>
            </form>
          )}
          <div className="profile-columns">
            <div className="profile-manuscript">
              <section aria-labelledby="profile-manuscript-title">
                <div className="profile-section-title">
                  <h2 id="profile-manuscript-title">{t('En cours d’écriture')}</h2>
                  <Feather size={18} aria-hidden="true" />
                </div>
                <h3 className="profile-project-name">{project.name}</h3>
                <section className="profile-resume">
                  <span>{t('Reprendre le fil')}</span>
                  <h3>{selected?.title || project.name}</h3>
                  <button onClick={onResume}>
                    {t('Revenir au texte')}
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </button>
                </section>
                <dl className="profile-statistics">
                  <div>
                    <dt>{t('Mots du manuscrit')}</dt>
                    <dd>{number(summary.words)}</dd>
                  </div>
                  <div>
                    <dt>{t('Scènes incluses')}</dt>
                    <dd>{number(summary.scenes)}</dd>
                  </div>
                  <div>
                    <dt>{t('Chapitres')}</dt>
                    <dd>{number(summary.chapters)}</dd>
                  </div>
                </dl>
                <div className="profile-goal">
                  <div>
                    <h3>{t('Objectifs du manuscrit')}</h3>
                    <span>{summary.goal ? `${percent} %` : t('À votre rythme')}</span>
                  </div>
                  {summary.goal ? (
                    <>
                      <progress
                        max={summary.goal}
                        value={summary.goalWords}
                        aria-label={t('Objectifs du manuscrit')}
                      />
                      <p>
                        {t('{0} / {1} mots · {2} scènes avec un objectif', {
                          0: number(summary.goalWords),
                          1: number(summary.goal),
                          2: number(summary.goals),
                        })}
                      </p>
                      <small>{t('Chaque scène contribue dans la limite de son objectif.')}</small>
                    </>
                  ) : (
                    <p>
                      {t(
                        'Vous pouvez définir un objectif de mots dans la préparation de chaque scène.',
                      )}
                    </p>
                  )}
                </div>
              </section>
            </div>
            <aside className="profile-shortcuts" aria-label={t('Votre atelier')}>
              <h2>{t('Votre atelier')}</h2>
              {(
                [
                  ['history', GitCompareArrows, 'Versions', 'Retrouver les étapes de votre texte.'],
                  ['projects', LibraryBig, 'Vos projets', 'Passer d’un univers à l’autre.'],
                  ['preferences', Settings2, 'Paramètres', 'Faire place à votre façon d’écrire.'],
                ] as const
              ).map(([surface, Icon, title, description]) => (
                <button key={surface} onClick={() => onNavigate(surface)}>
                  <Icon size={18} strokeWidth={1.4} aria-hidden="true" />
                  <span>
                    <strong>{t(title)}</strong>
                    <small>{t(description)}</small>
                  </span>
                  <ArrowUpRight size={14} aria-hidden="true" />
                </button>
              ))}
              <p>
                {t(
                  'Les compteurs concernent les textes inclus dans le manuscrit. Les textes hors manuscrit et la corbeille sont exclus.',
                )}
              </p>
            </aside>
          </div>
          {activity && <ActivityCalendar activity={activity} />}
        </div>
      </div>
    </WorkspaceScreen>
  );
}
