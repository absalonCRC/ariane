import { Check, GitBranch } from 'lucide-react';
import { t } from '../i18n';
import type { HistoryState } from '../contracts/history';

export function BranchMenu(p: {
  state: HistoryState;
  busy: boolean;
  onSwitch: (id: string) => Promise<void>;
  onManage: () => void;
}) {
  return (
    <section className="path-branches" aria-label={t('Variantes du texte')}>
      <div className="path-branches-heading">
        <GitBranch size={13} aria-hidden="true" /> {t('Variantes')}
      </div>
      <div className="path-branches-list">
        {p.state.branches.map((branch) => (
          <button
            key={branch.id}
            className="path-branch-item"
            aria-current={branch.id === p.state.activeBranch ? 'true' : undefined}
            disabled={p.busy}
            onClick={() => void p.onSwitch(branch.id)}
          >
            <span>{branch.isMain ? t('Texte principal') : branch.name}</span>
            {branch.id === p.state.activeBranch && <Check size={13} aria-hidden="true" />}
          </button>
        ))}
      </div>
      <button className="path-branches-manage" disabled={p.busy} onClick={p.onManage}>
        {t('Gérer les variantes')}
      </button>
    </section>
  );
}
