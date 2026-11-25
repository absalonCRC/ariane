import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { t, useLocale } from '../i18n';
import { ProjectSetup, type NewProjectFields } from './ProjectSetup';
import { ProjectCatalog } from '../project/ProjectCatalog';
import { Presence } from '../components/Presence';
import { useState, useEffect, useRef } from 'react';
import { Dialog } from '../components/Dialog';
import { choosePath } from './choosePath';
import { native, request } from '../platform/client';
import type { Project } from '../contracts/project';
import { ArianeSymbol } from '../components/ArianeWordmark';
import { ViewTitleCapsule } from '../components/ViewTitleCapsule';

export function Welcome({
  onOpen,
  onError,
  beforeOpen,
}: {
  beforeOpen?: () => Promise<void>;
  onOpen: (p: Project) => void;
  onError: (e: unknown) => void;
}) {
  useLocale();
  const [screen, setScreen] = useState<'none' | 'create' | 'open'>('none');
  const createTrigger = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [firstProject, setFirstProject] = useState<boolean | null>(null);
  useEffect(() => {
    if (!native) return;
    let live = true;
    void request('projects').then(
      (entries) => {
        if (live) setFirstProject(entries.length === 0);
      },
      () => {
        if (live) setFirstProject(false);
      },
    );
    return () => {
      live = false;
    };
  }, []);
  const menuAction = useRef<(id: string) => void>(() => {});
  menuAction.current = (id) => {
    if (!busy && id === 'open-project') setScreen('open');
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
  async function create({ name, folder, language, initialTitle }: NewProjectFields) {
    setBusy(true);
    try {
      let path = 'browser:' + crypto.randomUUID();
      if (native) {
        folder ??= await choosePath('create', { title: t('Enregistrer le projet dans…') });
        if (typeof folder !== 'string') return;
        path = folder + '/' + name.trim().replace(/[/:\\]/g, '-');
      }
      await beforeOpen?.();
      const project = await request('create', {
        path,
        name: name.trim(),
        initialTitle: initialTitle.trim() || t('Sans titre'),
        language,
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
      await beforeOpen?.();
      onOpen(await request('open', { path }));
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
      <LanguageSwitcher compact />
      <ViewTitleCapsule
        view={{
          title:
            screen === 'create'
              ? t('Nouveau projet')
              : screen === 'open'
                ? t('Ouvrir un projet')
                : t('Accueil'),
          home: true,
        }}
      />
      {screen === 'create' ? (
        <ProjectSetup
          firstProject={firstProject}
          busy={busy}
          onCreate={create}
          onError={onError}
          onBack={() => {
            setScreen('none');
            requestAnimationFrame(() => createTrigger.current?.focus());
          }}
        />
      ) : (
        <>
          <ArianeSymbol draw />
          <h1>{t('Un espace pour écrire.')}</h1>
          <div className="welcome-actions">
            <button ref={createTrigger} onClick={() => setScreen('create')}>
              {t('Créer un projet')}
            </button>
            <button onClick={() => setScreen('open')}>{t('Ouvrir un projet')}</button>
          </div>
          <p className="welcome-local">{t('Tout reste sur ce Mac.')}</p>
        </>
      )}
      <Presence>
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
