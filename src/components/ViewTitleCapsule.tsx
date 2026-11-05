import { createContext, useContext, type ReactNode } from 'react';
export interface TitleView {
  title: string;
  trail?: string[];
  home?: boolean;
  keepBranch?: boolean;
  onBack?: () => void;
  backLabel?: string;
}
const CapsuleContext = createContext<((view: TitleView) => ReactNode) | null>(null);
export const ViewTitleCapsuleProvider = CapsuleContext.Provider;
/** Only a presentation slot; notification state stays owned by the workspace. */
export function ViewTitleCapsule({ view }: { view: TitleView }) {
  const render = useContext(CapsuleContext);
  return render ? <div className="window-title view-title-capsule">{render(view)}</div> : null;
}
