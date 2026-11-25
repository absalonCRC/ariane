import { Presence } from '../../components/Presence';
import type { Project } from '../../contracts/project';
import type { NoteActivityController } from '../../notes/useNoteActivity';
import type { ProjectController } from '../../project/useProject';
import { SourceCard } from '../../sources/SourceCard';
import { Reader } from '../../sources/Reader';
import type { useDocumentaryRail } from '../../sources/margin/useDocumentaryRail';
import { request } from '../../platform/client';
import { t } from '../../i18n';
import type { Workspace } from '../useWorkspace';

type Props = Pick<
  Workspace,
  | 'card'
  | 'setCard'
  | 'reader'
  | 'setReader'
  | 'read'
  | 'cite'
  | 'fail'
  | 'locateSourceMatch'
  | 'registerCitation'
  | 'locatePassage'
  | 'linkDocument'
  | 'beginReaderRequest'
  | 'active'
> & {
  project: Project;
  doc: Pick<ProjectController, 'ref' | 'settings' | 'status' | 'generation'>;
  branchId?: string;
  branchBusy: boolean;
  marginPinFor: ReturnType<typeof useDocumentaryRail>['marginPinFor'];
  record: NoteActivityController['record'];
  onAssociated: () => void;
  onSourceChanged: () => void;
  onRevealAnnotations: (clearTarget: boolean) => void;
};
export function WorkspaceSourcePanels({
  project: p,
  doc,
  branchId,
  branchBusy,
  active,
  card,
  setCard,
  reader,
  setReader,
  read,
  cite,
  fail,
  locateSourceMatch,
  registerCitation,
  locatePassage,
  linkDocument,
  beginReaderRequest,
  marginPinFor,
  record,
  onAssociated,
  onSourceChanged,
  onRevealAnnotations,
}: Props) {
  return (
    <>
      <Presence kind="anchored">
        {card && (
          <SourceCard
            key={card.source.id}
            origin={card.origin}
            source={card.source}
            marginPin={marginPinFor(card.source)}
            sections={p.sections}
            contentVersion={`${doc.status}:${doc.generation}`}
            onOccurrence={(hit) => void locateSourceMatch(hit, hit.matched)}
            citationStyle={doc.settings.citationStyle}
            colors={doc.settings.entityColors}
            onRegister={(s, t) => registerCitation(s, t).catch(fail)}
            top={card.top}
            onClose={() => setCard(null)}
            onRead={() => void read(card.source)}
            onAssociate={() =>
              void request('associate', {
                section: active!,
                id: card.source.id,
                payload: card.source,
              })
                .then(() => {
                  void record({
                    kind: 'associated',
                    title: card.source.title,
                    sourceId: card.source.id,
                    section: active,
                  });
                  setCard(null);
                  onAssociated();
                })
                .catch(fail)
            }
            onCite={(s, t) => void cite(s, t)}
          />
        )}
      </Presence>
      <Presence>
        {reader && (
          <Reader
            key={JSON.stringify([
              p.path,
              branchId,
              reader.id,
              reader.fingerprint,
              reader.reveal?.page ?? reader.page,
              reader.replacement?.id,
              reader.reveal?.rectangles,
            ])}
            source={reader}
            reveal={reader.reveal}
            replacing={!!reader.replacement}
            onDocumentSelect={async (anchor) => {
              const branch = branchId;
              if (!branch || branchBusy) throw new Error(t('La variante active a changé.'));
              if (!reader.replacement) {
                return linkDocument(anchor, branch);
              }
              const a = reader.replacement;
              const current = beginReaderRequest();
              await request('updateAnnotation', {
                projectPath: p.path,
                id: a.id,
                revision: a.revision,
                note: a.note,
                done: a.done,
                document: anchor,
                branch,
              });
              if (current()) {
                setReader(null);
                onRevealAnnotations(true);
              }
            }}
            marginPin={marginPinFor(reader)}
            sections={p.sections}
            contentVersion={`${doc.status}:${doc.generation}`}
            onOccurrence={(hit) => void locateSourceMatch(hit, hit.matched)}
            onCite={(quote) => cite(reader, quote)}
            onClose={() => {
              setReader(null);
              if (reader.reveal || reader.replacement) onRevealAnnotations(false);
            }}
            projectPath={p.path}
            onChange={(source) => {
              if (doc.ref.current?.path === p.path) {
                void record({
                  kind: 'updated',
                  title: source.title,
                  sourceId: source.id,
                  section: active,
                });
                setReader((current) =>
                  current?.id === source.id ? { ...current, ...source } : current,
                );
                onSourceChanged();
              }
            }}
            onRead={(id) => void read(id)}
            onLocate={(section, node, quote) => void locatePassage(section, node, quote)}
          />
        )}
      </Presence>
    </>
  );
}
