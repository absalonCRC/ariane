import type { ReactNode, UIEventHandler, RefObject } from 'react';
import { Editor } from '../../editor/Editor';
import type { EditorHandle, EditorProps } from '../../editor/types';
import { DocumentTitle } from '../../components/DocumentTitle';
import { t } from '../../i18n';
interface WritingSurfaceProps {
  historyMode: boolean;
  projectName: string;
  selected?: { id: string; title: string; included?: boolean };
  editorRef: RefObject<EditorHandle | null>;
  editorProps: EditorProps;
  onScroll: UIEventHandler<HTMLDivElement>;
  onScrollEnd: UIEventHandler<HTMLDivElement>;
  onTitle: (title: string) => void;
  onChooseTexts: () => void;
  onAdd: () => void;
  children: ReactNode;
}
/** Title and editor retain one scroll container and their original mount conditions. */
export function WritingSurface({
  historyMode,
  projectName,
  selected,
  editorRef,
  editorProps,
  onScroll,
  onScrollEnd,
  onTitle,
  onChooseTexts,
  onAdd,
  children,
}: WritingSurfaceProps) {
  const { settings, projectPath, sections } = editorProps;
  return (
    <div
      className="manuscript-column"
      onScroll={onScroll}
      onScrollEnd={onScrollEnd}
      hidden={historyMode}
      inert={historyMode}
      style={
        {
          '--typewriter-line-half': `${(settings.fontSize * (settings.lineHeight ?? 1.5)) / 2}px`,
        } as React.CSSProperties
      }
    >
      <DocumentTitle
        key={settings.continuous ? projectPath : selected?.id}
        title={settings.continuous ? projectName : selected?.title || ''}
        readOnly={settings.continuous}
        onEnter={() => editorRef.current?.focus()}
        onCommit={onTitle}
      />
      {!settings.continuous && selected?.included === false && (
        <p className="working-text-label">{t('Texte de travail · Hors manuscrit')}</p>
      )}
      <Editor ref={editorRef} {...editorProps} />
      {children}
      {!sections.length &&
        (settings.continuous ? (
          <div className="empty-manuscript">
            <p>{t('Aucun texte inclus dans le manuscrit.')}</p>
            <button onClick={onChooseTexts}>{t('Choisir les textes dans la bibliothèque')}</button>
          </div>
        ) : (
          <button className="add-first-scene" onClick={onAdd}>
            {t('Ajouter une scène à cette section')}
          </button>
        ))}
    </div>
  );
}
