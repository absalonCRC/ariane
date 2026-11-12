import { useState, useEffect } from 'react';
import { t, localizeMessage, useLocale } from '../../i18n';
import { commandRegistry } from './registry';
import {
  useShortcuts,
  effectiveBindings,
  shortcutFromEvent,
  setShortcut,
  resetShortcuts,
  beginShortcutRecording,
  endShortcutRecording,
} from './shortcuts';
export function ShortcutSettings({ onError }: { onError: (e: unknown) => void }) {
  useEffect(
    () => () => {
      void endShortcutRecording().catch(onError);
    },
    [],
  );
  useLocale();
  const overrides = useShortcuts(),
    bindings = effectiveBindings(overrides),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(localizeMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="shortcut-settings">
      <h2>{t('Raccourcis')}</h2>
      <p>{t('Sélectionnez un raccourci puis appuyez sur la combinaison souhaitée.')}</p>
      {error && <p role="alert">{error}</p>}
      {commandRegistry.map((c) => (
        <div key={c.id}>
          <label>
            {t(c.label)}
            <input
              readOnly
              aria-label={t('Raccourci : {0}', { 0: t(c.label) })}
              value={bindings[c.id] ?? t('Non attribué')}
              onFocus={() =>
                void beginShortcutRecording().catch((e) => setError(localizeMessage(e)))
              }
              onBlur={() => void endShortcutRecording().catch(onError)}
              onKeyDown={(e) => {
                if (busy) return;
                if (e.key === 'Tab' || e.key === 'Escape') return;
                if (e.nativeEvent.isComposing) return;
                e.preventDefault();
                e.stopPropagation();
                const value = shortcutFromEvent(e);
                if (value) void run(() => setShortcut(c.id, value));
              }}
            />
          </label>
          <button disabled={busy} onClick={() => void run(() => setShortcut(c.id, null))}>
            {t('Retirer')}
          </button>
        </div>
      ))}
      <button disabled={busy} onClick={() => void run(resetShortcuts)}>
        {t('Rétablir les raccourcis par défaut')}
      </button>
    </section>
  );
}
