import { useEffect, useState } from 'react';
import { request } from '../platform/client';
import type { Source } from '../contracts/sources';
import { t, localizeMessage } from '../i18n';

export function SourceAliases({
  source,
  projectPath,
  onChange,
}: {
  source: Source;
  projectPath: string;
  onChange: (source: Source) => void;
}) {
  const [editable, setEditable] = useState(false);
  const [value, setValue] = useState(source.aliases.join('\n'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setEditable(false);
    setValue(source.aliases.join('\n'));
    setError('');
    void request('vaults')
      .then((vaults) => {
        if (alive)
          setEditable(
            source.path.toLowerCase().endsWith('.md') &&
              vaults.some((v) => v.id === source.vaultId && v.owned && v.available),
          );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [source.id, source.fingerprint, projectPath]);
  async function save() {
    setBusy(true);
    setError('');
    try {
      onChange(
        await request('updateSourceAliases', {
          projectPath,
          source: source.id,
          fingerprint: source.fingerprint,
          aliases: value
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="source-aliases">
      <h3>{t('Alias')}</h3>
      {editable ? (
        <>
          <label>
            {t('Autres noms de cette entité · un par ligne')}
            <textarea
              value={value}
              disabled={busy}
              onChange={(e) => setValue(e.target.value)}
              rows={4}
            />
          </label>
          <p className="hint">{t('Ces noms renvoient à cette fiche, sans créer de doublons.')}</p>
          <button
            disabled={busy || value === source.aliases.join('\n')}
            onClick={() => void save()}
          >
            {t('Enregistrer les alias')}
          </button>
        </>
      ) : (
        <p>{source.aliases.join(', ') || t('Aucun alias')}</p>
      )}
      {error && (
        <p role="status" className="error-text">
          {localizeMessage(error)}
        </p>
      )}
    </section>
  );
}
