import '../styles/history-refinements.css';
import { useEffect, useState } from 'react';
import { GitBranch } from 'lucide-react';
import { request } from '../app/client';
import type { HistoryState } from '../app/types';
import { t } from '../i18n';

export function BranchBadge(p: {
  path: string;
  generation: number;
  onOpen: () => void;
  onError: (e: unknown) => void;
}) {
  const [state, setState] = useState<HistoryState | null>(null);
  useEffect(() => {
    let alive = true;
    void request<HistoryState>('historyState', { projectPath: p.path })
      .then((value) => {
        if (alive) setState(value?.branches ? value : null);
      })
      .catch((e) => {
        if (alive) p.onError(e);
      });
    return () => {
      alive = false;
    };
  }, [p.path, p.generation, p.onError]);
  const branch = state?.branches.find((b) => b.id === state.activeBranch);
  return (
    <button
      className="writing-branch-badge"
      onClick={p.onOpen}
      aria-label={t('Variantes et versions : {0}', {
        0: branch && !branch.isMain ? branch.name : t('Texte principal'),
      })}
    >
      <GitBranch size={13} aria-hidden="true" />
      <span>{branch && !branch.isMain ? branch.name : t('Texte principal')}</span>
    </button>
  );
}
