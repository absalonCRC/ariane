import './styles/fonts.css';
import { createRoot } from 'react-dom/client';

import { getLocale } from './i18n';
import { ContextMenuProvider } from './components/ContextMenu';
import { ControlHints } from './components/ControlHints';
import './styles/tokens.css';
import './styles/editor.css';
import './styles/surfaces.css';
import './styles/motion.css';
import './styles/workspace.css';
import './styles/theme.css';
import './styles/interaction-refinements.css';
import './styles/entities.css';
import './styles/capture.css';
import './styles/workspace-pages.css';
document.documentElement.lang = getLocale();
const surface = new URLSearchParams(location.search).has('capture')
  ? import('./capture/CaptureApp').then((m) => m.CaptureApp)
  : import('./app/App').then((m) => m.App);
void surface.then((Surface) => {
  createRoot(document.getElementById('root')!).render(
    <ContextMenuProvider>
      <ControlHints />
      <Surface />
    </ContextMenuProvider>,
  );
});
