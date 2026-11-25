import type { ComponentProps } from 'react';
import { useContextMenu } from '../../components/ContextMenu';
import { Presence } from '../../components/Presence';
import type { Settings } from '../../contracts/settings';
import type { Source } from '../../contracts/sources';
import { MemorySuggestion } from '../../enrichment/MemorySuggestion';
import { DocumentaryMargin } from '../../sources/margin/DocumentaryMargin';
import type { useDocumentaryRail } from '../../sources/margin/useDocumentaryRail';

type Props = Pick<
  ComponentProps<typeof DocumentaryMargin>,
  'read' | 'cite' | 'setSurface' | 'card' | 'setCard'
> &
  Pick<ComponentProps<typeof MemorySuggestion>, 'editor' | 'memory' | 'fail'> & {
    rail: ReturnType<typeof useDocumentaryRail>;
    settings: Settings;
    hidden: boolean;
    annotationsOpen: boolean;
    reader: Source | null;
    words: number;
  };
export function WorkspaceMargin({
  rail,
  settings,
  hidden,
  annotationsOpen,
  reader,
  words,
  memory,
  editor,
  fail,
  read,
  cite,
  card,
  setCard,
  setSurface,
}: Props) {
  const openMenu = useContextMenu();
  const { railLeft, railWidth, contextTop, suggestionExcerpt } = rail.layout;
  return (
    <>
      {!annotationsOpen &&
        !hidden &&
        (words > 0 || rail.marginPins.sources.length > 0) &&
        rail.railVisible &&
        !(reader || (memory.view && !memory.origin)) && (
          <DocumentaryMargin
            {...rail.layout}
            colors={settings.entityColors}
            openMenu={openMenu}
            read={read}
            cite={cite}
            card={card}
            setSurface={setSurface}
            setCard={setCard}
            hasSuggestion={!!memory.suggestion}
          />
        )}
      <Presence kind="anchored">
        {!hidden &&
          memory.suggestion &&
          contextTop !== null &&
          rail.contextVisible &&
          settings.focus === 'none' &&
          !memory.view &&
          !reader && (
            <MemorySuggestion
              contextTop={contextTop}
              railLeft={railLeft}
              railWidth={railWidth}
              memory={memory}
              openMenu={openMenu}
              setSurface={setSurface}
              suggestionExcerpt={suggestionExcerpt}
              colors={settings.entityColors}
              suggestionTitle={rail.suggestionTitle}
              fail={fail}
              editor={editor}
            />
          )}
      </Presence>
    </>
  );
}
