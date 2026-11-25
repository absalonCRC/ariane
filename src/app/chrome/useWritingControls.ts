import { useEffect, useRef, useState } from 'react';
import type { Settings as WritingSettings } from '../../contracts/settings';
import type { Surface } from '../workspace/types';
import { useBottomPanel } from './useBottomPanel';
export function useWritingControls(
  surface: Surface,
  palette: string | null,
  setSurface: (next: Surface) => void,
) {
  const [focusPreview, setFocusPreview] = useState<WritingSettings['focus'] | null>(null);
  const [fontPreview, setFontPreview] = useState<WritingSettings['font'] | null>(null);
  const [scrollPreview, setScrollPreview] = useState<boolean | null>(null);
  useEffect(() => {
    if (surface !== 'settings') {
      setFocusPreview(null);
      setFontPreview(null);
      setScrollPreview(null);
    }
  }, [surface]);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [panelNode, setPanelNode] = useState<HTMLDivElement | null>(null);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const [versionToolsHost, setVersionToolsHost] = useState<HTMLDivElement | null>(null);
  const panelMode: 'search' | 'voice' | 'none' = palette ? 'search' : voiceOpen ? 'voice' : 'none';
  const { lastPanel, morphPanel } = useBottomPanel(panelNode, panelMode);
  useEffect(() => {
    if (palette) {
      setVoiceOpen(false);
      if (surface === 'settings') setSurface('none');
    }
  }, [palette]);
  return {
    focusPreview,
    setFocusPreview,
    fontPreview,
    setFontPreview,
    scrollPreview,
    setScrollPreview,
    voiceOpen,
    setVoiceOpen,
    panelNode,
    setPanelNode,
    settingsTrigger,
    versionToolsHost,
    setVersionToolsHost,
    panelMode,
    lastPanel,
    morphPanel,
  };
}
export type WritingControls = ReturnType<typeof useWritingControls>;
