import { ChevronLeft, ChevronRight } from 'lucide-react';
import { t, useLocale } from '../../i18n';
import { trackSidebarPointer } from '../../project/sidebarPointer';

export function HistoryEdge({
  open,
  disabled,
  onToggle,
}: {
  open: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  useLocale();
  const Chevron = open ? ChevronRight : ChevronLeft;
  return (
    <button
      className="edge-trigger history-edge-trigger"
      aria-label={open ? t('Replier l’historique') : t('Déplier l’historique')}
      data-hint={t('Historique')}
      data-hint-placement="sidebar-edge"
      data-hint-while-expanded
      aria-controls="project-activity-history"
      aria-expanded={open}
      disabled={disabled}
      onClick={onToggle}
      onPointerMove={trackSidebarPointer}
    >
      <Chevron size={17} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}
