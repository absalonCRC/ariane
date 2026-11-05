import type { Project } from '../contracts/project';
export interface HistoryProps {
  project: Project;
  active: string | null;
  onClose: () => void;
  flush: () => Promise<void>;
  onRestore: (p: Project) => void;
  onApply: (id: string, text: string, revision: number) => Promise<void>;
  onError: (e: unknown) => void;
  onSelectText?: (id: string) => void;
  toolsHost?: HTMLElement | null;
  toolsOpen?: boolean;
  onCloseTools?: () => void;
}
