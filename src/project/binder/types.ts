import type { ManuscriptOperation } from '../../contracts/library';
import type { LibraryOperation, DocumentRole } from '../../contracts/library';
import type { Project, Section } from '../../contracts/project';
import type { Surface } from '../../app/workspace/types';
import type { Source } from '../../contracts/sources';
import type { Settings as ProjectSettings } from '../../contracts/settings';
export interface BinderProps {
  dark?: boolean;
  historyMode?: boolean;
  onToggleTheme?: () => void;
  footerTarget?: HTMLDivElement | null;
  project: Project;
  active: string | null;
  onSelect: (id: string) => void;
  onSurface: (s: Surface) => void;
  onClose: () => void;
  onAdd: (
    parent: string | null,
    kind: Section['kind'],
    role?: DocumentRole,
    after?: string,
  ) => void;
  creation?: { parent: string | null; kind: Section['kind']; after?: string } | null;
  reveal?: number;
  onRevealed?: () => void;
  creationTitle?: string;
  onCreationTitle?: (title: string) => void;
  onConfirmCreation?: () => Promise<void>;
  onCancelCreation?: () => void;
  onMove: (id: string, target: string, inside: boolean) => void;
  onContinuous: () => void;
  onRename?: (id: string, title: string) => Promise<void>;
  onOperation?: (operation: LibraryOperation) => Promise<void>;
  onConfigure?: (patch: Partial<ProjectSettings>) => void;
  onReadSource?: (source: Source) => unknown;
  onOpenProject?: (path: string, section?: string) => unknown;
  onError?: (e: unknown) => void;
  sourceVersion?: number;
  busy?: boolean;
  onPrepare?: (id: string) => unknown;
  onManuscriptOperation?: (operation: ManuscriptOperation) => Promise<void>;
}
