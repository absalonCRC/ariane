import { useLayoutEffect, useRef, useState } from 'react';

/** Owns the shared search/voice capsule geometry and transition cleanup. */
export function useBottomPanel(
  panelNode: HTMLDivElement | null,
  panelMode: 'search' | 'voice' | 'none',
) {
  const previousPanel = useRef<typeof panelMode>('none');
  const lastPanel = useRef<'search' | 'voice'>('search');
  const [morphPanel, setMorphPanel] = useState(false);
  useLayoutEffect(() => {
    const controls = panelNode?.parentElement;
    if (!panelNode || !controls) return;
    const searchButton = controls.querySelector<HTMLElement>('.header-search');
    const voiceButton = controls.querySelector<HTMLElement>('.voice-control');
    if (!searchButton || !voiceButton) return;
    const measure = () => {
      const width = panelNode.offsetWidth;
      if (!width) return;
      const left = panelNode.offsetLeft - width / 2;
      const scale = Math.min(1, 32 / width);
      controls.dataset.voiceEdge = String(voiceButton.offsetLeft - left < 14);
      controls.dataset.searchEdge = String(
        left + width - (searchButton.offsetLeft + searchButton.offsetWidth) < 14,
      );
      const origin = (button: HTMLElement) => {
        const center = button.offsetLeft + button.offsetWidth / 2 - left;
        return scale < 1 ? (center - (width * scale) / 2) / (1 - scale) : width / 2;
      };
      panelNode.style.setProperty('--search-origin', `${origin(searchButton)}px`);
      panelNode.style.setProperty('--voice-origin', `${origin(voiceButton)}px`);
      panelNode.style.setProperty('--collapsed-scale', String(scale));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(controls);
    observer?.observe(panelNode);
    return () => observer?.disconnect();
  }, [panelNode]);
  useLayoutEffect(() => {
    if (previousPanel.current !== panelMode) {
      const switching = previousPanel.current !== 'none' && panelMode !== 'none';
      setMorphPanel(switching);
      if (panelMode !== 'none') lastPanel.current = panelMode;
      previousPanel.current = panelMode;
      if (switching) {
        const timer = window.setTimeout(() => setMorphPanel(false), 340);
        return () => window.clearTimeout(timer);
      }
    }
  }, [panelMode]);
  return { lastPanel, morphPanel };
}
