import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { t, useLocale } from '../i18n';
import { ProjectCatalog } from '../project/ProjectCatalog';
import { Presence } from '../components/Presence';
import { useState, useEffect, useRef } from 'react';
import { Dialog } from '../components/Dialog';
import { choosePath } from './choosePath';
import { native, request } from './client';
import type { Project } from './types';
import { ArianeWordmark } from '../components/ArianeWordmark';

export function Welcome({
  onOpen,
  onError,
}: {
  onOpen: (p: Project) => void;
  onError: (e: unknown) => void;
}) {
  useLocale();
  const [screen, setScreen] = useState<'none' | 'create' | 'open'>('none');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const menuAction = useRef<(id: string) => void>(() => {});
  menuAction.current = (id) => {
    if (id === 'open-project') setScreen('open');
  };
  useEffect(() => {
    if (!native) return;
    let disposed = false,
      stop: (() => void) | undefined;
    void import('@tauri-apps/api/event')
      .then(({ listen }) => listen<string>('app-command', (e) => menuAction.current(e.payload)))
      .then((unlisten) => {
        if (disposed) unlisten();
        else stop = unlisten;
      })
      .catch(onError);
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
  async function create() {
    setBusy(true);
    try {
      let path = 'browser:' + crypto.randomUUID();
      if (native) {
        const folder = await choosePath('create', { title: t('Enregistrer le projet dans…') });
        if (typeof folder !== 'string') return;
        path = folder + '/' + name.trim().replace(/[/:\\]/g, '-');
      }
      const project = await request<Project>('create', {
        path,
        name: name.trim(),
        initialTitle: t('Sans titre'),
        vaultPath: null,
      });
      onOpen(project);
      setScreen('none');
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  async function openProject(path: string) {
    setBusy(true);
    try {
      onOpen(await request<Project>('open', { path }));
      setScreen('none');
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  async function chooseFolder() {
    try {
      const path = await choosePath('open', { title: t('Ouvrir un projet ariane') });
      if (typeof path === 'string') await openProject(path);
    } catch (e) {
      onError(e);
    }
  }
  return (
    <div className="welcome">
      <ArianeWordmark compact />
      <LanguageSwitcher />
      <div className="window-title" data-tauri-drag-region aria-hidden="true" />
      <h1>{t('Un espace pour écrire.')}</h1>
      <div>
        <button onClick={() => setScreen('create')}>{t('Créer un projet')}</button>
        <button onClick={() => setScreen('open')}>{t('Ouvrir un projet')}</button>
      </div>
      <p>{t('Tout reste sur ce Mac.')}</p>
      <Presence>
        {screen === 'create' && (
          <Dialog
            title={t('Nouveau projet')}
            onClose={() => {
              if (!busy) setScreen('none');
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <label>
                {t('Nom du projet')}
                <input
                  autoFocus
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('Le titre de votre projet')}
                />
              </label>
              <div className="dialog-actions">
                <button type="button" disabled={busy} onClick={() => setScreen('none')}>
                  {t('Annuler')}
                </button>
                <button className="primary" disabled={!name.trim() || busy}>
                  {t('Créer le projet')}
                </button>
              </div>
            </form>
          </Dialog>
        )}
        {screen === 'open' && (
          <Dialog
            title={t('Ouvrir un projet')}
            onClose={() => {
              if (!busy) setScreen('none');
            }}
          >
            {native && (
              <button disabled={busy} onClick={() => void chooseFolder()}>
                {t('Choisir un dossier…')}
              </button>
            )}
            <ProjectCatalog
              onOpen={(path) => {
                if (!busy) void openProject(path);
              }}
              onError={onError}
            />
          </Dialog>
        )}
      </Presence>
    </div>
  );
}
