import { useState } from 'react';
import { t } from '../i18n';
import { request } from '../platform/client';
import type { PredictionPreferences } from '../contracts/prediction';
import { usePredictionPreferences } from './usePredictionPreferences';

export function PredictionSettings({
  projectPath,
  onError,
}: {
  projectPath: string;
  onError: (error: unknown) => void;
}) {
  const { enabled, distinct, forgotten } = usePredictionPreferences(projectPath);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };
  const configure = (value: PredictionPreferences) =>
    run(() => request('predictionPreferences', { projectPath, value }));
  return (
    <section className="prediction-preferences">
      <h3>{t('Prédiction du prochain mot')}</h3>
      <label className="preference-toggle">
        <span>
          {t('Proposer le prochain mot')}
          <small>
            {t(
              'Apprend localement des textes enregistrés dans le manuscrit. Ce réglage est partagé avec la capture rapide.',
            )}
          </small>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(event) => void configure({ enabled: event.target.checked, distinct })}
        />
      </label>
      {enabled && (
        <label>
          {t('Visibilité de la proposition')}
          <select
            value={distinct ? 'distinct' : 'subtle'}
            disabled={busy}
            onChange={(event) =>
              void configure({ enabled, distinct: event.target.value === 'distinct' })
            }
          >
            <option value="subtle">{t('Discrète')}</option>
            <option value="distinct">{t('Plus visible')}</option>
          </select>
        </label>
      )}
      <div className="settings-actions">
        <button disabled={busy} onClick={() => void run(() => request('resetPrediction'))}>
          {t('Réinitialiser l’apprentissage')}
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void run(() => request('forgetPredictionProject', { projectPath, forget: !forgotten }))
          }
        >
          {t(forgotten ? 'Réapprendre ce projet' : 'Oublier ce projet')}
        </button>
      </div>
    </section>
  );
}
