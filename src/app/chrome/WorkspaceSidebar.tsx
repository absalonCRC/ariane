import { Presence } from '../../components/Presence';
import { SidebarDock } from '../../components/SidebarDock';
import type { ProjectController } from '../../project/useProject';
import { Binder } from '../../project/Binder';
import { BinderActions } from '../../project/BinderActions';
import type { BinderProps } from '../../project/binder/types';
import type { useWorkspacePages } from '../workspace/useWorkspacePages';
import type { Workspace } from '../useWorkspace';

type Props = Pick<
  BinderProps,
  | 'project'
  | 'active'
  | 'historyMode'
  | 'busy'
  | 'onOperation'
  | 'onOpenProject'
  | 'sourceVersion'
  | 'reveal'
  | 'onRevealed'
  | 'onAdd'
  | 'creation'
  | 'creationTitle'
  | 'onCreationTitle'
  | 'onConfirmCreation'
  | 'onCancelCreation'
  | 'onMove'
> &
  Pick<
    Workspace,
    'binder' | 'setBinder' | 'appearance' | 'setSurface' | 'fail' | 'read' | 'select' | 'update'
  > & {
    pages: Pick<
      ReturnType<typeof useWorkspacePages>,
      'inboxOpen' | 'setInboxOpen' | 'pageSurface' | 'closePage' | 'selectFromChrome'
    >;
    doc: Pick<ProjectController, 'ref' | 'settings' | 'configure' | 'settingsRef' | 'flush'>;
  };
export function WorkspaceSidebar({
  binder,
  setBinder,
  appearance,
  pages,
  setSurface,
  doc,
  read,
  fail,
  select,
  update,
  ...tree
}: Props) {
  const { closePage, setInboxOpen } = pages;
  return (
    <>
      <SidebarDock
        expanded={binder}
        dark={appearance.dark}
        busy={tree.busy}
        onToggleTheme={() => appearance.change(appearance.dark ? 'light' : 'dark')}
      >
        <BinderActions
          currentSurface={pages.inboxOpen ? 'inbox' : pages.pageSurface}
          historyMode={tree.historyMode}
          trash={doc.settings.libraryView === 'trash'}
          onSurface={(surface) => {
            setInboxOpen(false);
            setSurface(surface);
          }}
          onTrash={() => {
            closePage();
            doc.configure({ libraryView: 'trash' });
            setBinder(true);
          }}
        />
      </SidebarDock>
      <Presence kind="sidebar">
        {binder && (
          <Binder
            key={tree.project.path}
            {...tree}
            footerTarget={null}
            onConfigure={doc.configure}
            onError={fail}
            onReadSource={(source) => {
              closePage();
              void read(source);
            }}
            onSelect={pages.selectFromChrome}
            onSurface={(s) => {
              setInboxOpen(false);
              setSurface(s);
              if (!['history', 'preferences', 'profile', 'tags', 'entities'].includes(s))
                setBinder(false);
            }}
            onClose={() => {
              const edge = document.activeElement;
              setBinder(false);
              if (edge instanceof HTMLElement && edge.matches('.binder-edge-trigger')) {
                edge.blur();
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLButtonElement>(
                      '.edge-trigger[aria-controls="project-sidebar"]',
                    )
                    ?.focus({ preventScroll: true }),
                );
              }
            }}
            onRename={async (id, title) => {
              try {
                await doc.flush();
                const section = doc.ref.current?.sections.find((section) => section.id === id);
                if (section) await update({ ...section, title });
              } catch (error) {
                fail(error);
              }
            }}
            onPrepare={async (id) => {
              await select(id);
              if (doc.settingsRef.current.active === id) {
                setSurface('prepare');
                setBinder(false);
              }
            }}
            onContinuous={() => {
              closePage();
              void select(tree.active || '', true);
            }}
          />
        )}
      </Presence>
    </>
  );
}
