import { Presence } from '../components/Presence';
import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import { open } from '@tauri-apps/plugin-dialog';
import { native, request, browserProjects } from './client';
import type { Project } from './types';
import { ArianeWordmark } from '../components/ArianeWordmark';
export function Welcome({
  onOpen,
  onError,
}: {
  onOpen: (p: Project) => void;
  onError: (e: unknown) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [vaultMode, setVaultMode] = useState<'own' | 'existing'>('own');
  const [vaultPath, setVaultPath] = useState('');
  async function chooseVault() {
    if (!native) return;
    try {
      const chosen = await open({ directory: true, title: 'Choisir un vault Obsidian' });
      if (typeof chosen === 'string') setVaultPath(chosen);
    } catch (e) {
      onError(e);
    }
  }
  async function create() {
    setBusy(true);
    try {
      let path = 'browser:' + crypto.randomUUID();
      if (native) {
        const folder = await open({
          directory: true,
          title: 'Choisir le dossier parent du projet',
        });
        if (typeof folder !== 'string') return;
        path = folder + '/' + name.trim().replace(/[/:\\]/g, '-');
      }
      const project = await request<Project>('create', {
        path,
        name: name.trim(),
        vaultPath: vaultMode === 'existing' ? vaultPath : null,
      });
      onOpen(project);
      if (native && vaultMode === 'existing') void request('index').catch(onError);
      setCreating(false);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  async function existing() {
    try {
      if (!native) {
        const p = browserProjects()[0];
        if (!p) throw new Error('Aucun projet enregistré dans ce navigateur.');
        onOpen(await request('open', { path: p.path }));
        return;
      }
      const path = await open({ directory: true, title: 'Ouvrir un projet Ariane' });
      if (typeof path === 'string') onOpen(await request('open', { path }));
    } catch (e) {
      onError(e);
    }
  }
  return (
    <div className="welcome">
      <ArianeWordmark />
      <div className="window-title" data-tauri-drag-region aria-hidden="true" />
      <h1>Un espace pour écrire.</h1>
      <div>
        <button onClick={() => setCreating(true)}>Créer un projet</button>
        <button onClick={() => void existing()}>Ouvrir un projet</button>
      </div>
      <p>Tout reste sur ce Mac.</p>
      <Presence>
        {creating && (
          <Dialog title="Nouveau projet" onClose={() => setCreating(false)}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <label>
                Nom du projet
                <input
                  autoFocus
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Le titre de votre projet"
                />
              </label>
              <p className="hint">
                Un dossier indépendant contiendra votre manuscrit et ses versions.
              </p>
              <fieldset className="vault-choice">
                <legend>Sources</legend>
                <label>
                  <input
                    type="radio"
                    name="vault"
                    checked={vaultMode === 'own'}
                    onChange={() => setVaultMode('own')}
                  />{' '}
                  Créer un vault Ariane
                </label>
                <label>
                  <input
                    type="radio"
                    name="vault"
                    checked={vaultMode === 'existing'}
                    disabled={!native}
                    onChange={() => setVaultMode('existing')}
                  />{' '}
                  Utiliser un vault Obsidian existant
                </label>
                {vaultMode === 'existing' && (
                  <div>
                    <button type="button" onClick={() => void chooseVault()}>
                      Choisir le vault
                    </button>
                    <p className="hint">
                      {vaultPath || 'Lecture seule : les notes existantes restent inchangées.'}
                    </p>
                  </div>
                )}
                {!native && (
                  <p className="hint">
                    Dans cet aperçu, le vault est simulé dans le navigateur. Les dossiers et la
                    connexion à Obsidian sont disponibles dans l’application Mac.
                  </p>
                )}
              </fieldset>
              <div className="dialog-actions">
                <button type="button" onClick={() => setCreating(false)}>
                  Annuler
                </button>
                <button
                  className="primary"
                  disabled={!name.trim() || busy || (vaultMode === 'existing' && !vaultPath)}
                >
                  Créer le projet
                </button>
              </div>
            </form>
          </Dialog>
        )}
      </Presence>
    </div>
  );
}
