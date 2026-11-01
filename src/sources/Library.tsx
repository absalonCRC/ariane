import { AnimatedDetails } from '../components/AnimatedDetails';
import { Presence } from '../components/Presence';
import { useEffect, useState } from 'react';
import { Plus, RefreshCw, FolderOpen, Pause, X } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { request, native } from '../app/client';
import type { Vault } from '../app/types';
import { Dialog, Empty } from '../components/Dialog';
export interface IndexProgress {
  done: number;
  total: number;
  file: string;
  semantic: boolean;
}
export function Library({
  onClose,
  onError,
  onRefresh,
  onIndexProgress,
  onBusy,
  onMemory,
}: {
  onClose: () => void;
  onError: (e: unknown) => void;
  onRefresh: () => void;
  onIndexProgress: (v: IndexProgress | null) => void;
  onBusy: (v: boolean) => void;
  onMemory?: () => void;
}) {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string[]>([]);
  const [available, setAvailable] = useState(false);
  const [scopes, setScopes] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [entityKind, setEntityKind] = useState('personne');
  const [entityName, setEntityName] = useState('');
  const [entityDescription, setEntityDescription] = useState('');
  const owned = vaults.find((v) => v.owned);
  useEffect(() => {
    void request<Vault[]>('vaults').then(setVaults).catch(onError);
    void request<{ available: boolean }>('engineStatus').then((v) => setAvailable(v.available));
  }, [onError]);
  async function index() {
    setBusy(true);
    onBusy(true);
    setReport([]);
    try {
      const result = await request<{ errors: string[]; cancelled?: boolean; semantic: boolean }>(
        'index',
      );
      setReport(result.errors);
      if (!result.errors.length)
        setReport([result.cancelled ? 'Indexation suspendue.' : 'Les sources sont prêtes.']);
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
  async function connect() {
    try {
      if (!native) throw new Error('Connectez vos dossiers de sources depuis l’application macOS.');
      const path = await open({
        directory: true,
        title: 'Choisir un dossier de sources (vault Obsidian)',
      });
      if (typeof path === 'string') {
        setVaults(await request('connectVault', { path }));
        void index();
      }
    } catch (e) {
      onError(e);
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
      setAdding(false);
      void index();
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
          if (e.payload.type === 'drop') {
            const paths = e.payload.paths;
            void (async () => {
              for (const path of paths) {
                await request('connectVault', { path });
              }
              if (alive) {
                setVaults(await request('vaults'));
                void index();
              }
            })().catch(onError);
          }
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
  }, []);
  return (
    <Dialog title="Sources du projet" onClose={onClose} wide>
      {onMemory && native && (
        <button className="memory-library" onClick={onMemory}>
          Fiches issues du manuscrit
        </button>
      )}
      <div className="library-toolbar">
        <button onClick={connect}>
          <Plus size={14} />
          Ajouter un dossier de sources
        </button>
        {!owned && (
          <button disabled={busy} onClick={() => void createVault()}>
            <Plus size={14} /> Créer mon dossier de sources
          </button>
        )}
        {owned && (
          <button disabled={busy} onClick={() => setAdding((v) => !v)}>
            <Plus size={14} /> Nouvelle fiche
          </button>
        )}
        <button disabled={busy || !vaults.length} onClick={() => void index()}>
          <RefreshCw size={13} />
          Actualiser l’index
        </button>
        {busy && (
          <button onClick={() => void request('cancelIndex')}>
            <Pause size={13} />
            Suspendre
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
              Type
              <select value={entityKind} onChange={(e) => setEntityKind(e.target.value)}>
                <option value="personne">Personne</option>
                <option value="lieu">Lieu</option>
                <option value="organisation">Organisation</option>
                <option value="evenement">Événement</option>
                <option value="concept">Concept</option>
                <option value="croyance">Croyance ou tradition</option>
                <option value="oeuvre">Œuvre</option>
                <option value="document">Document ou source</option>
                <option value="objet">Objet</option>
              </select>
            </label>
            <label>
              Nom
              <input required value={entityName} onChange={(e) => setEntityName(e.target.value)} />
            </label>
            <label>
              Description
              <textarea
                rows={2}
                value={entityDescription}
                onChange={(e) => setEntityDescription(e.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button type="button" onClick={() => setAdding(false)}>
                Annuler
              </button>
              <button className="primary" disabled={busy || !entityName.trim()}>
                Créer la fiche
              </button>
            </div>
          </form>
        )}
      </Presence>
      {vaults.length ? (
        vaults.map((v) => (
          <div className="vault" key={v.id}>
            <div className="vault-name">
              <FolderOpen size={18} />
              <strong>{v.name}</strong>
              <small>
                {v.available
                  ? `${v.count} document${v.count === 1 ? '' : 's'} · ${v.owned ? 'Dossier Ariane' : 'Lecture seule'}`
                  : 'Dossier introuvable'}
              </small>
              {!v.owned && (
                <button
                  className="icon-button"
                  aria-label={'Déconnecter ' + v.name}
                  disabled={busy}
                  onClick={() =>
                    void request<Vault[]>('removeVault', { id: v.id })
                      .then(setVaults)
                      .catch(onError)
                  }
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <AnimatedDetails className="source-details" summary={<>Emplacement du dossier</>}>
              <p className="source-path">{v.path}</p>
            </AnimatedDetails>
            <label>
              Dossiers inclus <small>— dossiers ou fichiers, un par ligne</small>
              <textarea
                rows={2}
                value={scopes[v.id] ?? v.scope.join('\n')}
                aria-label={'Dossiers inclus dans ' + v.name}
                placeholder="Tous les dossiers"
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
          </div>
        ))
      ) : (
        <Empty>
          Ajoutez un dossier de sources (vault), ou glissez-le depuis le Finder. Le projet reste
          indépendant de ses sources.
        </Empty>
      )}
      <p className="hint">
        Markdown et PDF textuels. Les images restent consultables sans reconnaissance du texte.
      </p>
      <AnimatedDetails className="source-details" summary={<>Détails de la recherche locale</>}>
        <p className="hint">
          {!native &&
            'Aperçu navigateur : les fiches sont enregistrées dans ce navigateur, sans créer de fichiers. '}
          {available
            ? 'EmbeddingGemma 300M · Q8 · Recherche locale multilingue'
            : 'Moteur sémantique non disponible dans cet environnement.'}
        </p>
      </AnimatedDetails>
      {report.length > 0 && (
        <div className="index-report">
          {report.slice(0, 12).map((r, i) => (
            <p key={i}>{r}</p>
          ))}
        </div>
      )}
    </Dialog>
  );
}
