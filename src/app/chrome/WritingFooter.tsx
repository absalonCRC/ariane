import type { ComponentProps, ReactNode, RefObject } from 'react';
import { AlignLeft, Table2, GitCompareArrows } from 'lucide-react';
import { localeTag, t } from '../../i18n';
import type { EditorHandle } from '../../editor/types';
import { WritingCounter } from '../../components/WritingCounter';
import { DepthControl } from '../../components/DepthControl';
import type { ProjectController } from '../../project/useProject';
import { VoiceButton } from '../../voice/VoiceButton';
import { Settings } from '../Settings';
import type { Surface } from '../workspace/types';
import type { ManuscriptFilters } from '../writing/useManuscriptFilters';
import type { WritingControls } from './useWritingControls';

interface FooterProps {
  controls: WritingControls;
  filters: Pick<ManuscriptFilters, 'filteredTag' | 'tagViewMode' | 'setTagViewMode'>;
  doc: Pick<ProjectController, 'settings' | 'configure'>;
  editor: RefObject<EditorHandle | null>;
  projectPath: string;
  busy: boolean;
  historyMode: boolean;
  hasScenes: boolean;
  paletteOpen: boolean;
  focusActive: boolean;
  surface: Surface;
  setSurface: (next: Surface) => void;
  onToggleSettings: () => void;
  goal?: number;
  words: number;
  counts: Pick<
    ComponentProps<typeof WritingCounter>,
    'words' | 'lines' | 'characters' | 'notes' | 'notesStatus'
  >;
  voice: Pick<
    ComponentProps<typeof VoiceButton>,
    'ref' | 'beforeRecording' | 'needsInstall' | 'onInstall' | 'onActivity' | 'onOpen'
  >;
  children: ReactNode;
}
export function WritingFooter({
  controls,
  filters,
  doc,
  editor,
  projectPath,
  busy,
  historyMode,
  hasScenes,
  paletteOpen,
  focusActive,
  surface,
  setSurface,
  onToggleSettings,
  goal,
  words,
  counts,
  voice,
  children,
}: FooterProps) {
  const { filteredTag, tagViewMode, setTagViewMode } = filters;
  const {
    panelNode,
    setPanelNode,
    panelMode,
    lastPanel,
    morphPanel,
    voiceOpen,
    setVoiceOpen,
    settingsTrigger,
    setVersionToolsHost,
    setFocusPreview,
    setFontPreview,
    setScrollPreview,
  } = controls;
  return (
    <footer className="statusbar">
      <div className="chrome-blur chrome-blur-bottom" aria-hidden="true">
        <span />
        <span />
      </div>
      <div
        className="bottom-controls"
        inert={busy}
        data-panel={panelMode}
        data-anchor={panelMode === 'none' ? lastPanel.current : panelMode}
        data-morph={morphPanel}
      >
        <div className="bottom-connector" aria-hidden="true" />
        <VoiceButton
          {...voice}
          projectPath={projectPath}
          language={doc.settings.language}
          prepareInsertion={() => editor.current?.prepareInsertion() ?? (() => false)}
          panel={panelNode}
          retainContent={panelMode === 'none'}
          open={voiceOpen && !paletteOpen}
          onClose={() => setVoiceOpen(false)}
        />
        <WritingCounter
          {...counts}
          hideNotes={focusActive}
          mode={focusActive ? 'words' : doc.settings.countMode}
          onChange={(countMode) => {
            doc.configure({ countMode });
            if (!filteredTag) editor.current?.focus();
          }}
        />
        {children}
        <div
          ref={setPanelNode}
          id="bottom-writing-panel"
          className="bottom-panel"
          data-open={paletteOpen || voiceOpen}
          aria-hidden={!paletteOpen && !voiceOpen}
          inert={!paletteOpen && !voiceOpen}
        />
      </div>
      {!filteredTag && !!goal && (
        <div className="goal-status">
          <span className="goal-track">
            <i style={{ width: Math.min(100, (words / goal) * 100) + '%' }} />
          </span>
          <span>{goal.toLocaleString(localeTag())}</span>
        </div>
      )}
      <DepthControl
        disabled={!!filteredTag}
        value={doc.settings.depth}
        onChange={(depth) => doc.configure({ depth })}
      />
      <div className="settings-control" data-open={surface === 'settings'}>
        {filteredTag ? (
          <button
            className="settings-trigger tag-view-switch"
            aria-label={
              tagViewMode === 'text'
                ? t('Afficher les passages en tableau')
                : t('Afficher les passages en texte')
            }
            data-tooltip={tagViewMode === 'text' ? t('Vue tableau') : t('Vue texte')}
            aria-pressed={tagViewMode === 'table'}
            onClick={() => setTagViewMode((mode) => (mode === 'text' ? 'table' : 'text'))}
          >
            {tagViewMode === 'text' ? <Table2 size={16} /> : <AlignLeft size={16} />}
          </button>
        ) : (
          <>
            <button
              ref={settingsTrigger}
              className="settings-trigger"
              aria-label={historyMode ? t('Outils des versions') : t('Réglages d’écriture')}
              data-tooltip={historyMode ? t('Outils des versions') : t('Écriture et lecture')}
              aria-expanded={surface === 'settings'}
              aria-controls={historyMode ? 'version-settings' : 'writing-settings'}
              onClick={onToggleSettings}
            >
              {historyMode ? <GitCompareArrows size={16} aria-hidden="true" /> : 'Aa'}
            </button>
            {historyMode ? (
              <div ref={setVersionToolsHost} />
            ) : (
              <Settings
                open={surface === 'settings'}
                value={doc.settings}
                onChange={doc.configure}
                onFocusPreview={setFocusPreview}
                onFontPreview={setFontPreview}
                onScrollPreview={setScrollPreview}
                canFormat={hasScenes}
                onFormat={(format) => editor.current?.format(format)}
                onClose={() => {
                  setSurface('none');
                  settingsTrigger.current?.focus();
                }}
              />
            )}
          </>
        )}
      </div>
    </footer>
  );
}
