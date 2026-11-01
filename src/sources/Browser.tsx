import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { request } from '../app/client';
import type { Source, SourcePage, Vault } from '../app/types';
const empty: SourcePage = { items: [], total: 0, kinds: [], folders: [], types: [] };
export function SourceBrowser({
  onRead,
  onManage,
  version = 0,
}: {
  onRead: (s: Source) => unknown;
  onManage: () => void;
  version?: number;
}) {
  const [vault, setVault] = useState('');
  const [kind, setKind] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [page, setPage] = useState<SourcePage>(empty);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void request<Vault[]>('vaults')
      .then((values) => {
        if (alive) setVaults(values);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [version]);
  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError('');
    void request<SourcePage>('browseSources', {
      query: '',
      vault: vault || null,
      kind,
      folder: null,
      offset,
    })
      .then((value) => {
        if (alive) setPage(value);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [vault, kind, offset, version]);
  return (
    <div className="source-browser">
      <select
        aria-label="Vault"
        value={vault}
        onChange={(e) => {
          setVault(e.target.value);
          setKind(null);
          setOffset(0);
          setPage(empty);
        }}
      >
        <option value="">Tous les vaults</option>
        {vaults.map((v) => (
          <option key={v.id} value={v.id}>
            {v.owned ? 'Vault Ariane' : v.name + ' · Lecture seule'}
          </option>
        ))}
      </select>
      {error && <p role="alert">{error}</p>}
      {busy && (
        <p className="hint" role="status">
          Ouverture…
        </p>
      )}
      {!busy && !error && !page.kinds.length && (
        <p className="hint">Aucune entité indexée. Ajoutez des sources ou actualisez le vault.</p>
      )}
      {(page.types ?? page.kinds.map((k) => ({ kind: k, count: 0 }))).map((type) => (
        <section className="entity-type" key={type.kind}>
          <button
            className="entity-type-heading"
            aria-expanded={kind === type.kind}
            onClick={() => {
              setKind(kind === type.kind ? null : type.kind);
              setOffset(0);
            }}
          >
            <ChevronRight size={13} />
            <span>{type.kind || 'Sans type'}</span>
            <small>{type.count || ''}</small>
          </button>
          {kind === type.kind && !busy && !error && (
            <div className="entity-type-items">
              {page.items.map((s) => (
                <button
                  className="entity-source"
                  key={s.id}
                  onClick={() => onRead(s)}
                  title={s.path}
                >
                  <span>{s.title}</span>
                  {!vault && (
                    <small>
                      {vaults.find((v) => v.id === s.vaultId)?.owned
                        ? 'Vault Ariane'
                        : vaults.find((v) => v.id === s.vaultId)?.name}
                    </small>
                  )}
                </button>
              ))}
              {page.total > 50 && (
                <div className="library-pagination">
                  <button disabled={!offset} onClick={() => setOffset((v) => Math.max(0, v - 50))}>
                    Précédent
                  </button>
                  <span>
                    {Math.floor(offset / 50) + 1} / {Math.ceil(page.total / 50)}
                  </span>
                  <button
                    disabled={offset + 50 >= page.total}
                    onClick={() => setOffset((v) => v + 50)}
                  >
                    Suivant
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      ))}
      <button className="library-manage" onClick={onManage}>
        Gérer les vaults…
      </button>
    </div>
  );
}
