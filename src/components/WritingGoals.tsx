import type { Settings } from '../contracts/settings';
import { t } from '../i18n';

export function WritingGoals({
  value,
  onChange,
}: {
  value: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  return (
    <fieldset className="writing-goals">
      <legend>{t('Objectifs d’écriture')}</legend>
      {(['projectGoal', 'sessionGoal'] as const).map((key) => (
        <label key={key}>
          {t(key === 'projectGoal' ? 'Objectif du projet (mots)' : 'Objectif de la séance (mots)')}
          <input
            type="number"
            min="1"
            step="1"
            value={value[key] ?? ''}
            onChange={({ currentTarget }) => {
              const target = currentTarget.valueAsNumber;
              if (!currentTarget.value || (Number.isSafeInteger(target) && target > 0))
                onChange({ [key]: currentTarget.value ? target : undefined });
            }}
          />
        </label>
      ))}
      <label>
        <input
          type="checkbox"
          checked={value.showGoals !== false}
          onChange={(e) => onChange({ showGoals: e.target.checked })}
        />{' '}
        {t('Afficher les objectifs dans le compteur')}
      </label>
      <p>{t('Séance · {0} mots nets', { 0: value.sessionWords ?? 0 })}</p>
      <button type="button" onClick={() => onChange({ sessionWords: 0, sessionClosed: false })}>
        {t('Nouvelle séance')}
      </button>
      {!value.sessionClosed && (
        <button type="button" onClick={() => onChange({ sessionClosed: true })}>
          {t('Terminer la séance')}
        </button>
      )}
    </fieldset>
  );
}
