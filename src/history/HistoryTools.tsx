import type { Dispatch, SetStateAction } from 'react';
import type { HistoryProps } from './types';
import { t } from '../i18n';
import type { Version } from '../contracts/history';
import { Plus, X } from 'lucide-react';

interface Props {
  p: HistoryProps;
  busy: boolean;
  setCreating: Dispatch<SetStateAction<boolean>>;
  onlyChanged: boolean;
  setOnlyChanged: Dispatch<SetStateAction<boolean>>;
  loading: boolean;
  loaded: { left: Version | null; right: Version | null };
  setConfirm: Dispatch<SetStateAction<Version | null>>;
}
export function HistoryTools({
  p,
  busy,
  setCreating,
  onlyChanged,
  setOnlyChanged,
  loading,
  loaded,
  setConfirm,
}: Props) {
  return (
    <section
      id="version-settings"
      className="settings floating version-settings"
      aria-label={t('Outils des versions')}
      aria-hidden={!p.toolsOpen}
      inert={!p.toolsOpen}
    >
      <div className="panel-top">
        <h2>{t('Versions')}</h2>
        <button
          className="icon-button"
          aria-label={t('Fermer les outils des versions')}
          onClick={p.onCloseTools}
        >
          <X size={15} />
        </button>
      </div>
      <button
        className="version-tool-action"
        disabled={busy}
        onClick={() => {
          setCreating(true);
          p.onCloseTools?.();
        }}
      >
        <Plus size={14} /> {t('Conserver une version')}
      </button>
      <label className="settings-row version-filter">
        <span className="settings-label">{t('Textes modifiés uniquement')}</span>
        <input
          type="checkbox"
          checked={onlyChanged}
          onChange={(e) => setOnlyChanged(e.target.checked)}
        />
      </label>
      <button
        className="version-tool-action"
        disabled={busy || loading || !loaded.left}
        onClick={() => {
          setConfirm(loaded.left);
          p.onCloseTools?.();
        }}
      >
        {t('Restaurer cette version…')}
      </button>
      <p className="version-tools-hint">
        {t('Une sauvegarde est conservée avant chaque reprise ou restauration.')}
      </p>
    </section>
  );
}
