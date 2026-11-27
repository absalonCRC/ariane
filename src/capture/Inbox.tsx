import { useEffect, useRef, useState } from 'react';
import { WorkspaceScreen } from '../components/WorkspaceScreen';
import { t, useLocale, localeTag } from '../i18n';
import { native, request } from '../platform/client';
import { choosePath } from '../app/choosePath';
import type { InboxCapture, CaptureTransfer, InboxChange } from '../contracts/inbox';
import type { HistoryState } from '../contracts/history';
import type { Project, ProjectEntry } from '../contracts/project';
import { ShortcutSettings } from '../app/commands/ShortcutSettings';
import { CapturePreferences } from './CapturePreferences';
import { loadCapturePreferences } from './preferences';
export function Inbox({
  project,
  branchName,
  branches,
  onBranch,
  selectedId,
  onSelection,
  onClose,
  onOpenProject,
  onCreate,
  onBeforeTransfer,
  onImported,
  onTransferred,
  onError,
  onNotice,
}: {
  project: Project | null;
  branchName?: string;
  branches: HistoryState | null;
  onBranch: (id: string) => Promise<void>;
  selectedId: string | null;
  onSelection: (id: string) => void;
  onClose: () => void;
  onOpenProject: (path: string) => Promise<void>;
  onCreate: () => void;
  onBeforeTransfer: () => Promise<void>;
  onImported: (section: string) => Promise<void>;
  onTransferred: () => Promise<void>;
  onError: (e: unknown) => void;
  onNotice: (message: string) => void;
}) {
  useLocale();
  const [items, setItems] = useState<InboxCapture[]>([]),
    [more, setMore] = useState(false),
    [query, setQuery] = useState(''),
    [filed, setFiled] = useState(false),
    [busy, setBusy] = useState(false),
    [projects, setProjects] = useState<ProjectEntry[]>([]),
    [title, setTitle] = useState('');
  const restoreCleanup = useRef<(() => void) | null>(null);
  const generation = useRef(0),
    alive = useRef(true),
    pending = useRef<CaptureTransfer | null>(null),
    latestProject = useRef(project);
  latestProject.current = project;
  const fail = (e: unknown) => {
    onError(e);
  };
  const load = async (append = false) => {
    const token = ++generation.current;
    const page = await request('inboxList', { query, filed, offset: append ? items.length : 0 });
    if (alive.current && token === generation.current) {
      setItems((old) => (append ? [...old, ...page.items] : page.items));
      setMore(page.more);
    }
  };
  const latestLoad = useRef(load);
  latestLoad.current = load;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
      restoreCleanup.current?.();
    };
  }, []);
  useEffect(() => {
    if (!native) return;
    void load().catch(fail);
  }, [query, filed]);
  useEffect(() => {
    if (!native) return;
    let active = true,
      dispose: (() => void) | undefined;
    void request('projects')
      .then((list) => {
        if (active) setProjects(list);
      })
      .catch(fail);
    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<InboxChange>('inbox-changed', (e) => {
          if (e.payload.kind !== 'draft' && e.payload.kind !== 'preferences')
            void latestLoad.current().catch(fail);
        }),
      )
      .then((fn) => {
        if (active) dispose = fn;
        else fn();
      })
      .catch(fail);
    return () => {
      active = false;
      dispose?.();
    };
  }, []);
  const selected = items.find((item) => item.id === selectedId);
  useEffect(() => {
    setTitle(
      selected?.pendingDestination?.title ??
        selected?.text
          .split('\n')
          .find((line) => line.trim())
          ?.slice(0, 120) ??
        '',
    );
    pending.current = null;
  }, [selected?.id]);
  const transfer = async () => {
    if (!selected || !project) return;
    const destination = project;
    setBusy(true);
    try {
      await onBeforeTransfer();
      if (latestProject.current?.path !== destination.path)
        throw Error('Le projet actif a changé.');
      if (!pending.current || pending.current.captureId !== selected.id) {
        const target = await request('inboxTarget', { projectPath: destination.path });
        const previous = selected.pendingDestination;
        if (
          previous &&
          (previous.projectPath !== destination.path ||
            previous.projectId !== target.projectId ||
            previous.branchId !== target.branchId)
        )
          throw Error('Ouvrez la destination et la variante du rangement en attente.');
        pending.current = {
          operationId: previous?.operationId ?? crypto.randomUUID(),
          captureId: selected.id,
          captureRevision: selected.revision,
          projectPath: destination.path,
          ...target,
          title: previous?.title ?? (title.trim() || t('Sans titre')),
        };
      }
      const result = await request('inboxTransfer', { operation: pending.current });
      pending.current = null;
      setFiled(true);
      onNotice(
        t(result.mirrorPending ? 'Capture rangée. Copie Markdown à reprendre.' : 'Capture rangée.'),
      );
      await onTransferred();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const backup = async (restore: boolean) => {
    setBusy(true);
    try {
      const purpose = restore ? 'inbox-restore' : 'inbox-backup';
      const path = await choosePath(purpose, {
        title: t(restore ? 'Restaurer les captures' : 'Sauvegarder les captures'),
      });
      if (!path) return;
      if (restore) {
        const { listen } = await import('@tauri-apps/api/event');
        await new Promise<void>((resolve, reject) => {
          let ended = false;
          let stopSuccess = () => {},
            stopError = () => {};
          const timeout = setTimeout(() => {
            cleanup();
            reject(Error('La restauration n’a pas été confirmée.'));
          }, 20000);
          const cleanup = () => {
            ended = true;
            restoreCleanup.current = null;
            clearTimeout(timeout);
            stopSuccess();
            stopError();
          };
          restoreCleanup.current = () => {
            cleanup();
            reject(Error('Restauration annulée.'));
          };
          void (async () => {
            const success = await listen<number>('inbox-restored', (e) => {
              cleanup();
              onNotice(t('{0} captures restaurées.', { 0: e.payload }));
              resolve();
            });
            if (ended) {
              success();
              return;
            }
            stopSuccess = success;
            const failure = await listen<string>('app-lifecycle-error', (e) => {
              cleanup();
              reject(Error(e.payload));
            });
            if (ended) {
              failure();
              return;
            }
            stopError = failure;
            await request('inboxRestore', { path });
          })().catch((e) => {
            cleanup();
            reject(e);
          });
        });
        await loadCapturePreferences();
        await load();
      } else {
        await request('inboxBackup', { path });
        onNotice(t('Captures sauvegardées.'));
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <WorkspaceScreen
      busy={busy}
      title={t('Boîte de réception')}
      subtitle={t('Des idées à retrouver et à ranger dans vos projets.')}
      onClose={() => {
        if (!busy) onClose();
      }}
      onError={onError}
      className="inbox-screen"
    >
      <div className="inbox-body">
        {native && (
          <div className="inbox-toolbar">
            <input
              aria-label={t('Rechercher une capture')}
              placeholder={t('Rechercher une capture')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button aria-pressed={!filed} onClick={() => setFiled(false)}>
              {t('À ranger')}
            </button>
            <button aria-pressed={filed} onClick={() => setFiled(true)}>
              {t('Rangées')}
            </button>
            <button
              disabled={busy}
              onClick={() => void request('captureWindow', { action: 'toggle' }).catch(fail)}
            >
              {t('Nouvelle capture')}
            </button>
          </div>
        )}
        {!native ? (
          <p>{t('La capture globale est disponible dans l’application macOS.')}</p>
        ) : (
          <div className="inbox-columns">
            <nav className="inbox-list" aria-label={t('Captures')}>
              {!items.length && (
                <p className="inbox-caption">{t('Aucune capture ici pour le moment.')}</p>
              )}
              {items.map((item) => (
                <button
                  key={item.id}
                  aria-current={item.id === selectedId}
                  onClick={() => onSelection(item.id)}
                >
                  {item.text.slice(0, 90)}
                  <small>{new Date(item.updatedAt).toLocaleString(localeTag())}</small>
                </button>
              ))}
              {more && (
                <button onClick={() => void load(true).catch(fail)}>
                  {t('Afficher davantage')}
                </button>
              )}
            </nav>
            <section>
              {selected ? (
                <>
                  <pre className="inbox-preview">{selected.text}</pre>
                  {selected.destination ? (
                    <>
                      <p className="inbox-caption">
                        {t('Rangée dans : {0}', { 0: selected.destination.projectPath })}
                      </p>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void onOpenProject(selected.destination!.projectPath)
                            .then(() => onImported(selected.destination!.sectionId))
                            .catch(fail)
                        }
                      >
                        {t('Rejoindre le texte')}
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="inbox-caption">
                        {project
                          ? t('Destination : {0} · {1}', {
                              0: project.name,
                              1: branchName || t('Texte principal'),
                            })
                          : t('Ouvrez ou créez un projet pour ranger cette capture.')}
                      </p>
                      {selected.pendingDestination && (
                        <p className="inbox-caption">
                          {t('Rangement à reprendre : {0} · {1}', {
                            0: selected.pendingDestination.projectPath,
                            1: selected.pendingDestination.branchId,
                          })}{' '}
                          <button
                            disabled={busy}
                            onClick={() =>
                              void onOpenProject(selected.pendingDestination!.projectPath).catch(
                                fail,
                              )
                            }
                          >
                            {t('Ouvrir la destination')}
                          </button>
                        </p>
                      )}
                      <label className="inbox-title">
                        {t('Titre')}
                        <input
                          aria-label={t('Titre de la capture')}
                          value={title}
                          disabled={busy || !!selected.pendingDestination}
                          onChange={(e) => setTitle(e.target.value)}
                        />
                      </label>
                      {branches && (
                        <label>
                          {t('Variante de destination')}{' '}
                          <select
                            aria-label={t('Variante de destination')}
                            value={branches.activeBranch}
                            disabled={busy}
                            onChange={(e) => {
                              setBusy(true);
                              void onBranch(e.target.value)
                                .catch(fail)
                                .finally(() => setBusy(false));
                            }}
                          >
                            {branches.branches.map((branch) => (
                              <option key={branch.id} value={branch.id}>
                                {branch.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <div className="inbox-actions">
                        <button disabled={!project || busy} onClick={() => void transfer()}>
                          {t(
                            selected.pendingDestination
                              ? 'Reprendre le rangement'
                              : 'Ranger dans ce projet',
                          )}
                        </button>
                        <select
                          style={{ width: 200 }}
                          aria-label={t('Choisir un projet')}
                          value=""
                          disabled={busy}
                          onChange={(e) => {
                            const path = e.target.value;
                            if (path) void onOpenProject(path).catch(fail);
                          }}
                        >
                          <option value="">{t('Choisir un projet')}</option>
                          {projects
                            .filter((p) => p.available)
                            .map((p) => (
                              <option key={p.path} value={p.path}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void choosePath('open', { title: t('Ouvrir un projet') })
                              .then((path) => (path ? onOpenProject(path) : undefined))
                              .catch(fail)
                          }
                        >
                          {t('Parcourir…')}
                        </button>
                        <button disabled={busy} onClick={onCreate}>
                          {t('Créer un projet')}
                        </button>
                      </div>
                      <p className="inbox-caption">
                        {t(
                          'Le texte sera ajouté hors du manuscrit. La capture originale est conservée.',
                        )}
                      </p>
                    </>
                  )}
                </>
              ) : (
                <p className="inbox-caption">{t('Sélectionnez une capture.')}</p>
              )}
            </section>
          </div>
        )}
        {native && (
          <>
            <hr />
            <CapturePreferences onError={fail} />
            <ShortcutSettings onError={fail} scope="global" />
            <div className="inbox-actions">
              <button disabled={busy} onClick={() => void backup(false)}>
                {t('Sauvegarder les captures')}
              </button>
              <button disabled={busy} onClick={() => void backup(true)}>
                {t('Restaurer les captures')}
              </button>
            </div>
            <p className="inbox-caption">
              {t(
                'La sauvegarde comprend les captures et leurs réglages. Sauvegardez vos projets séparément.',
              )}
            </p>
          </>
        )}
      </div>
    </WorkspaceScreen>
  );
}
