import './styles/fonts.css';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
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
document.documentElement.lang = getLocale();
createRoot(document.getElementById('root')!).render(
  <ContextMenuProvider>
    <ControlHints />
    <App />
  </ContextMenuProvider>,
);
