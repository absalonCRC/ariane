import { useEffect, useState } from 'react';
import type { RuntimeModule, RuntimeModules } from '../contracts/runtimeModules';
import { t } from '../i18n';
import { request } from '../platform/client';

const labels = {
  memory: 'Reconnaissance des entités',
  voice: 'Dictée locale',
  revision: 'Révision locale',
} as const;
const phases = {
  bootstrap: 'Préparation de l’installateur…',
  download: 'Téléchargement et installation du module…',
  verify: 'Vérification du module…',
} as const;

export function RuntimeModuleSettings({ onError }: { onError: (error: unknown) => void }) {
  const [status, setStatus] = useState<RuntimeModules>();
  const [starting, setStarting] = useState<RuntimeModule | null>(null);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const next = await request('runtimeModules');
        if (active) setStatus(next);
      } catch (error) {
        if (active && !status) onError(error);
      }
      if (active) timer = setTimeout(refresh, 750);
    };
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [onError, Boolean(status)]);
  const install = async (module: RuntimeModule) => {
    setStarting(module);
    try {
      await request('installRuntime', { module });
    } catch (error) {
      onError(error);
    } finally {
      try {
        setStatus(await request('runtimeModules'));
      } catch (error) {
        onError(error);
      } finally {
        setStarting(null);
      }
    }
  };

  return (
    <section className="settings-group">
      <h3>{t('Modules locaux')}</h3>
      <p className="settings-description">
        {t('Le téléchargement peut prendre plusieurs minutes. Vous pouvez continuer à écrire.')}
      </p>
      {status &&
        (Object.keys(labels) as RuntimeModule[]).map((module) => {
          const installed = status.installed.includes(module);
          const active = status.active?.module === module ? status.active : null;
          return (
            <div className="settings-actions" key={module}>
              <span>{t(labels[module])}</span>
              {installed ? (
                <span>{t('Installé')}</span>
              ) : active ? (
                <>
                  <span role="status">{t(phases[active.phase])}</span>
                  <button onClick={() => void request('cancelRuntimeInstall').catch(onError)}>
                    {t('Interrompre')}
                  </button>
                </>
              ) : (
                <button
                  aria-label={t('Installer {0}', { 0: t(labels[module]) })}
                  disabled={Boolean(starting || status.active)}
                  onClick={() => void install(module)}
                >
                  {t('Installer')}
                </button>
              )}
            </div>
          );
        })}
    </section>
  );
}
