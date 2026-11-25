import type { ComponentProps } from 'react';
import type { Project } from '../../contracts/project';
import { Inbox } from '../../capture/Inbox';
import { request } from '../../platform/client';
import type { ProjectController } from '../../project/useProject';

type Props = Pick<
  ComponentProps<typeof Inbox>,
  | 'project'
  | 'branches'
  | 'onBranch'
  | 'selectedId'
  | 'onSelection'
  | 'onClose'
  | 'onOpenProject'
  | 'onNotice'
  | 'onError'
  | 'onCreate'
> & {
  doc: Pick<ProjectController, 'checkpoint' | 'flush' | 'ref' | 'replaceSections'>;
  flushActivity: () => Promise<void>;
  activate: (project: Project) => void;
};
export function WorkspaceInbox({
  doc,
  branches,
  flushActivity,
  activate,
  onCreate,
  onClose,
  onError,
  ...props
}: Props) {
  return (
    <Inbox
      {...props}
      branches={branches}
      branchName={branches?.branches.find((b) => b.id === branches.activeBranch)?.name}
      onClose={onClose}
      onError={onError}
      onBeforeTransfer={async () => {
        await doc.checkpoint();
        await flushActivity();
      }}
      onCreate={() => void doc.checkpoint().then(onCreate).catch(onError)}
      onTransferred={async () => {
        if (!doc.ref.current) return;
        const path = doc.ref.current.path;
        await doc.flush();
        const fresh = await request('open', { path });
        if (doc.ref.current?.path !== path) throw Error('Le projet actif a changé.');
        doc.replaceSections(fresh.sections, false, fresh.canUndoStructure);
      }}
      onImported={async (section) => {
        if (!doc.ref.current) return;
        await doc.flush();
        const fresh = await request('open', { path: doc.ref.current.path });
        if (!fresh.sections.some((s) => s.id === section))
          throw Error(
            'Le texte rangé est absent de cette variante ou a été retiré. La capture est conservée.',
          );
        fresh.settings = {
          ...fresh.settings,
          active: section,
          continuous: false,
          libraryView: 'texts',
        };
        activate(fresh);
        onClose();
      }}
    />
  );
}
