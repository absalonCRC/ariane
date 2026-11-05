import type { Project } from '../contracts/project';
export interface HistoryProps {
  project: Project;
  active: string | null;
  onClose: () => void;
  flush: () => Promise<void>;
  checkpoint?: () => Promise<void>;
  versionRevision?: number;
  onBusyChange?: (busy: boolean) => void;
  initialTab?: 'changes' | 'history' | 'variants';
  onRestore: (p: Project) => void;
  onApply: (id: string, text: string, revision: number) => Promise<void>;
  onError: (e: unknown) => void;
  onSelectText?: (id: string) => void;
  toolsHost?: HTMLElement | null;
  toolsOpen?: boolean;
  onCloseTools?: () => void;
}
