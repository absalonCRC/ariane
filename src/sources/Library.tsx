import type { NoteEventInput } from '../contracts/noteActivity';
import { localizeMessage, t, useLocale } from '../i18n';
import { AnimatedDetails } from '../components/AnimatedDetails';
import { Presence } from '../components/Presence';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus, RefreshCw, FolderOpen, Pause, X } from 'lucide-react';
import { choosePath } from '../app/choosePath';
import { listen } from '@tauri-apps/api/event';
import { request, native } from '../platform/client';
import type { Vault } from '../contracts/sources';
import { Dialog, Empty } from '../components/Dialog';
export interface IndexProgress {
  done: number;
  total: number;
  file: string;
  semantic: boolean;
}
function LibraryFrame({
  embedded,
  onClose,
  children,
}: {
  embedded?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useLocale();
  return embedded ? (
    <div className="embedded-library">{children}</div>
  ) : (
    <Dialog title={t('Sources du projet')} onClose={onClose} wide>
      {children}
    </Dialog>
  );
}
export function Library({
  embedded,
  projectPath,
  onClose,
  onError,
  onRefresh,
  onIndexProgress,
  onBusy,
  onMemory,
  onNoteActivity,
  onNotice,
}: {
  embedded?: boolean;
  projectPath: string;
  onClose: () => void;
  onError: (e: unknown) => void;
  onRefresh: () => void;
  onIndexProgress: (v: IndexProgress | null) => void;
  onBusy: (v: boolean) => void;
  onMemory?: () => void;
  onNoteActivity?: (event: NoteEventInput) => unknown;
  onNotice?: (message: string, tone?: 'info' | 'success' | 'error') => void;
}) {
  useLocale();
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const selection = useRef(false);
  const active = useRef(false);
  const vaultRows = useRef(new Map<string, HTMLDivElement>());
  const [report, setReport] = useState<string[]>([]);
  const [available, setAvailable] = useState(false);
  const [scopes, setScopes] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [entityKind, setEntityKind] = useState('personne');
  const [entityName, setEntityName] = useState('');
  const [entityDescription, setEntityDescription] = useState('');
  const owned = vaults.find((v) => v.owned);
  useEffect(() => {
    active.current = true;
    void request('vaults')
      .then((v) => {
        if (active.current) setVaults(v);
      })
      .catch(onError);
    void request('engineStatus')
      .then((v) => {
        if (active.current) setAvailable(v.available);
      })
      .catch(onError);
    return () => {
      active.current = false;
    };
  }, [projectPath, onError]);
  async function index() {
    setBusy(true);
    onBusy(true);
    setReport([]);
    try {
      const result = await request('index');
      setReport(result.errors);
      onNotice?.(
        result.cancelled
          ? t('Indexation suspendue.')
          : result.errors.length
            ? t('Certaines sources n’ont pas pu être indexées.')
            : t('Les sources sont prêtes.'),
        result.cancelled ? 'info' : result.errors.length ? 'error' : 'success',
      );
      if (!result.errors.length)
        setReport([result.cancelled ? t('Indexation suspendue.') : t('Les sources sont prêtes.')]);
      setVaults(await request('vaults'));
      onRefresh();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
      onBusy(false);
      onIndexProgress(null);
    }
  }
  useEffect(() => {
    if (!native) return;
    const promise = listen<IndexProgress>('index-progress', (e) => onIndexProgress(e.payload));
    return () => {
      void promise.then((f) => f());
    };
  }, [onIndexProgress]);
  async function connect(vault?: Vault) {
    if (selection.current) return;
    selection.current = true;
    setChoosing(true);
    try {
      const path = await choosePath('vault', {
        title: vault
          ? t('Autoriser le dossier de sources {0}', { 0: vault.name })
          : t('Choisir un dossier de sources (vault Obsidian)'),
      });
      if (path === null || !active.current) return;
      const result = await request('connectVault', { path, projectPath, vaultId: vault?.id });
      if (!active.current) return;
      setVaults(result);
      if (vault) requestAnimationFrame(() => vaultRows.current.get(vault.id)?.focus());
      onRefresh();
      await index();
    } catch (e) {
      if (active.current) onError(e);
    } finally {
      selection.current = false;
      if (active.current) setChoosing(false);
    }
  }
  async function createVault() {
    try {
      setVaults(await request('createOwnedVault'));
      onRefresh();
    } catch (e) {
      onError(e);
    }
  }
  async function createEntity() {
    setBusy(true);
    try {
      await request('createVaultEntity', {
        kind: entityKind,
        name: entityName.trim(),
        description: entityDescription.trim(),
      });
      setEntityName('');
      setEntityDescription('');
      onNoteActivity?.({ kind: 'created', title: entityName.trim() });
      setAdding(false);
      if (native) void index();
      else {
        setVaults(await request('vaults'));
        onRefresh();
        setBusy(false);
      }
    } catch (e) {
      onError(e);
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!native) return;
    let alive = true;
    let dispose: (() => void) | undefined;
    import('@tauri-apps/api/webview')
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent((e) => {
          if (alive && e.payload.type === 'drop' && e.payload.paths.length) void connect();
        }),
      )
      .then((f) => {
        if (alive) dispose = f;
        else f();
      });
    return () => {
      alive = false;
      dispose?.();
    };
  }, [projectPath]);
  return (
    <LibraryFrame embedded={embedded} onClose={onClose}>
      {onMemory && native && (
        <button className="memory-library" onClick={onMemory}>
          {t('Fiches issues du manuscrit')}
        </button>
      )}
      <div className="library-toolbar">
        {native && (
          <button disabled={busy || choosing} onClick={() => void connect()}>
            <Plus size={14} />
            {t('Ajouter un dossier de sources')}
          </button>
        )}
        {!owned && (
          <button disabled={busy} onClick={() => void createVault()}>
            <Plus size={14} /> {t('Créer mon dossier de sources')}
          </button>
        )}
        {owned && (
          <button disabled={busy} onClick={() => setAdding((v) => !v)}>
            <Plus size={14} /> {t('Nouvelle fiche')}
          </button>
        )}
        {native && (
          <button
            disabled={busy || choosing || !vaults.some((vault) => vault.available)}
            onClick={() => void index()}
          >
            <RefreshCw size={13} />
            {t('Actualiser l’index')}
          </button>
        )}
        {native && busy && (
          <button onClick={() => void request('cancelIndex')}>
            <Pause size={13} />
            {t('Suspendre')}
          </button>
        )}
      </div>
      <Presence kind="content">
        {adding && owned && (
          <form
            className="new-vault-entity"
            onSubmit={(e) => {
              e.preventDefault();
              void createEntity();
            }}
          >
            <label>
              {t('Type')}
              <select value={entityKind} onChange={(e) => setEntityKind(e.target.value)}>
                <option value="personne">{t('Personne')}</option>
                <option value="lieu">{t('Lieu')}</option>
                <option value="organisation">{t('Organisation')}</option>
                <option value="evenement">{t('Événement')}</option>
                <option value="concept">{t('Concept')}</option>
                <option value="croyance">{t('Croyance ou tradition')}</option>
                <option value="oeuvre">{t('Œuvre')}</option>
                <option value="document">{t('Document ou source')}</option>
                <option value="objet">{t('Objet')}</option>
              </select>
            </label>
            <label>
              {t('Nom')}
              <input required value={entityName} onChange={(e) => setEntityName(e.target.value)} />
            </label>
            <label>
              {t('Description')}
              <textarea
                rows={2}
                value={entityDescription}
                onChange={(e) => setEntityDescription(e.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button type="button" onClick={() => setAdding(false)}>
                {t('Annuler')}
              </button>
              <button className="primary" disabled={busy || !entityName.trim()}>
                {t('Créer la fiche')}
              </button>
            </div>
          </form>
        )}
      </Presence>
      {vaults.length ? (
        vaults.map((v) => (
          <div
            className="vault"
            key={v.id}
            tabIndex={-1}
            ref={(row) => {
              if (row) vaultRows.current.set(v.id, row);
              else vaultRows.current.delete(v.id);
            }}
          >
            <div className="vault-name">
              <FolderOpen size={18} />
              <strong>{v.name}</strong>
              <small>
                {v.needsAuthorization
                  ? t('Autorisation requise')
                  : v.available
                    ? `${v.count} document${v.count === 1 ? '' : 's'} · ${v.owned ? t('Dossier ariane') : t('Lecture seule')}`
                    : t('Dossier introuvable')}
              </small>
              {!v.owned && (
                <button
                  className="icon-button"
                  aria-label={t('Déconnecter ') + v.name}
                  disabled={busy || choosing}
                  onClick={() =>
                    void request('removeVault', { id: v.id })
                      .then((next) => {
                        if (!active.current) return;
                        setVaults(next);
                        onRefresh();
                      })
                      .catch(onError)
                  }
                >
                  <X size={13} />
                </button>
              )}
            </div>
            {native && !v.owned && !v.available && (
              <button disabled={busy || choosing} onClick={() => void connect(v)}>
                {t('Autoriser {0}…', { 0: v.name })}
              </button>
            )}
            {native && (
              <>
                <AnimatedDetails
                  className="source-details"
                  summary={<>{t('Emplacement du dossier')}</>}
                >
                  <p className="source-path">{v.path}</p>
                </AnimatedDetails>
                <label>
                  {t('Dossiers inclus')}
                  <small>{t('— dossiers ou fichiers, un par ligne')}</small>
                  <textarea
                    rows={2}
                    value={scopes[v.id] ?? v.scope.join('\n')}
                    aria-label={t('Dossiers inclus dans ') + v.name}
                    placeholder={t('Tous les dossiers')}
                    onChange={(e) => setScopes({ ...scopes, [v.id]: e.target.value })}
                    onBlur={(e) => {
                      void request('vaultScope', {
                        id: v.id,
                        scope: e.target.value
                          .split('\n')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                        .then(onRefresh)
                        .catch(onError);
                    }}
                  />
                </label>
              </>
            )}
          </div>
        ))
      ) : (
        <Empty>
          {t(
            'Ajoutez un dossier de sources (vault) et autorisez-le dans le dialogue macOS. Le projet reste indépendant de ses sources.',
          )}
        </Empty>
      )}
      {native && (
        <p className="hint">
          {t(
            'Markdown et PDF textuels. Les images restent consultables sans reconnaissance du texte.',
          )}
        </p>
      )}
      <AnimatedDetails
        className="source-details"
        summary={<>{t('Détails de la recherche locale')}</>}
      >
        <p className="hint">
          {!native &&
            t(
              'Aperçu navigateur : les fiches sont enregistrées dans ce navigateur, sans créer de fichiers. ',
            )}
          {available
            ? t('EmbeddingGemma 300M · Q8 · Recherche locale multilingue')
            : t('Moteur sémantique non disponible dans cet environnement.')}
        </p>
      </AnimatedDetails>
      {report.length > 0 && (
        <div className="index-report">
          {report.slice(0, 12).map((r, i) => (
            <p key={i}>{localizeMessage(r)}</p>
          ))}
        </div>
      )}
    </LibraryFrame>
  );
}
