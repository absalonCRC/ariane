import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { t } from '../i18n';

/** The same heading rhythm for project pages and the Versions workspace. */
export function WorkspacePageHeading({
  title,
  subtitle,
  onClose,
  actions,
  busy = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  actions?: ReactNode;
  busy?: boolean;
}) {
  return (
    <header className="workspace-page-heading">
      <button onClick={onClose} className="workspace-return" disabled={busy}>
        <ArrowLeft size={13} aria-hidden="true" />
        {t('Revenir au texte')}
      </button>
      <div className="workspace-page-title">
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="workspace-page-actions">{actions}</div>}
      </div>
    </header>
  );
}
