import type { ComponentProps } from 'react';
import { PathMenu } from '../../project/PathMenu';
import { BranchMenu } from '../../history/BranchMenu';
import type { useWritingBranches } from '../../history/useWritingBranches';
import type { TitleView } from '../../components/ViewTitleCapsule';
import type { ManuscriptFilters } from '../writing/useManuscriptFilters';
import type { useWorkspacePages } from '../workspace/useWorkspacePages';
import { t } from '../../i18n';

type TitleProps = Pick<
  ComponentProps<typeof PathMenu>,
  | 'project'
  | 'selected'
  | 'continuous'
  | 'view'
  | 'onSelect'
  | 'onAdd'
  | 'notifications'
  | 'hasPending'
  | 'hasError'
  | 'noticeDetails'
> & {
  branches: ReturnType<typeof useWritingBranches>;
  busy: boolean;
  onManage: () => void;
};
export function WorkspaceTitle({
  view,
  project,
  continuous,
  branches,
  busy,
  onManage,
  ...menu
}: TitleProps) {
  const state = branches.state;
  const current = state?.branches.find((b) => b.id === state.activeBranch);
  const showBranch = !view || view.keepBranch;
  return (
    <PathMenu
      {...menu}
      view={view}
      project={view?.home ? undefined : project}
      continuous={!view?.home && continuous}
      hasVariants={state?.branches.some((b) => !b.isMain) ?? false}
      branchName={
        showBranch && current ? (current.isMain ? t('Texte principal') : current.name) : undefined
      }
      branchMenu={
        showBranch && state
          ? (close) => (
              <BranchMenu
                state={state}
                busy={busy || branches.busy}
                onSwitch={async (id) => {
                  await branches.switchBranch(id);
                  close();
                }}
                onManage={() => {
                  close();
                  onManage();
                }}
              />
            )
          : undefined
      }
    />
  );
}

export function workspaceTitleView(
  pages: Pick<
    ReturnType<typeof useWorkspacePages>,
    'pageActive' | 'inboxOpen' | 'pageSurface' | 'closePage'
  >,
  filters: Pick<
    ManuscriptFilters,
    'filteredTag' | 'structuredFilter' | 'queryLabelText' | 'closeTagFilter'
  >,
  historyMode: boolean,
  leaveHistory: () => void,
): TitleView | undefined {
  const { pageActive, inboxOpen, pageSurface, closePage } = pages;
  const { filteredTag, structuredFilter, queryLabelText, closeTagFilter } = filters;
  if (pageActive) {
    const pageTitle = inboxOpen
      ? t('Boîte de réception')
      : pageSurface &&
        {
          profile: t('Profil'),
          preferences: t('Paramètres'),
          tags: t('Smart-tags'),
          entities: t('Entités'),
        }[pageSurface];
    if (pageTitle) return { title: pageTitle, onBack: closePage };
  }
  if (filteredTag)
    return {
      title: structuredFilter ? t('Recherche structurée') : t('Vue filtrée par smart-tag'),
      trail: [structuredFilter ? queryLabelText : '#' + filteredTag.name],
      onBack: closeTagFilter,
    };
  if (historyMode) return { title: t('Versions'), keepBranch: true, onBack: leaveHistory };
}
