import { useState, useEffect } from 'react';
import { t } from '../i18n';
import {
  activeCaptureShortcut,
  captureShortcutError,
  updateCapturePreferences,
  useCapturePreferences,
} from './preferences';
export function CapturePreferences({ onError }: { onError: (e: unknown) => void }) {
  const value = useCapturePreferences(),
    [busy, setBusy] = useState(false);
  const update = (patch: Parameters<typeof updateCapturePreferences>[0]) => {
    setBusy(true);
    void updateCapturePreferences(patch)
      .catch(onError)
      .finally(() => setBusy(false));
  };
  const error = captureShortcutError();
  useEffect(() => {
    if (error) onError(error);
  }, [error]);
  return (
    <section className="capture-preferences">
      <h3>{t('Capture rapide')}</h3>
      <p className="inbox-caption">
        {t('Raccourci global : {0}', { 0: value.shortcut ?? t('Non attribué') })}
      </p>
      {activeCaptureShortcut() !== value.shortcut && (
        <p className="inbox-caption">
          {t('Raccourci actif : {0}', { 0: activeCaptureShortcut() ?? t('Non attribué') })}
        </p>
      )}
      <label>
        {t('Volume de la machine à écrire')}
        <input
          aria-label={t('Volume de la machine à écrire')}
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={value.volume}
          disabled={busy}
          onChange={(e) => update({ volume: Number(e.target.value) })}
        />
        <output>{Math.round(value.volume * 100)} %</output>
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.sound}
          disabled={busy}
          onChange={(e) => update({ sound: e.target.checked })}
        />
        {t('Son dans la capture rapide')}
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.typewriter}
          disabled={busy}
          onChange={(e) => update({ typewriter: e.target.checked })}
        />
        {t('Défilement machine à écrire dans la capture')}
      </label>
      <p className="inbox-caption">
        {t('Le volume est partagé. Le son du manuscrit reste réglable par projet.')}
      </p>
    </section>
  );
}
