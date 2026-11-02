import { createRoot } from 'react-dom/client';
import '@fontsource/eb-garamond/latin-400.css';
import '@fontsource/eb-garamond/latin-400-italic.css';
import '@fontsource/eb-garamond/latin-500.css';
import '@fontsource/eb-garamond/latin-700.css';
import '@fontsource/eb-garamond/latin-700-italic.css';
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
document.documentElement.lang = getLocale();
createRoot(document.getElementById('root')!).render(
  <ContextMenuProvider>
    <ControlHints />
    <App />
  </ContextMenuProvider>,
);
