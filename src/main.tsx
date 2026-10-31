import { createRoot } from 'react-dom/client';
import '@fontsource/eb-garamond/latin-400.css';
import '@fontsource/eb-garamond/latin-400-italic.css';
import '@fontsource/eb-garamond/latin-500.css';
import { App } from './app/App';
import './styles/tokens.css';
import './styles/editor.css';
import './styles/surfaces.css';
createRoot(document.getElementById('root')!).render(<App />);
