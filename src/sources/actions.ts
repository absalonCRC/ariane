import type { RefObject, Dispatch, SetStateAction } from 'react';
import { t } from '../i18n';
import type { PanelOrigin } from '../components/useSharedPanel';
import { request } from '../platform/client';
import type { Source } from '../contracts/sources';
import type { EditorHandle } from '../editor/Editor';
import { composeCitation, sourceRef } from './citations';
import type { ProjectController } from '../project/useProject';
interface OperationContext {
  editor: RefObject<EditorHandle | null>;
  doc: ProjectController;
  setCard: Dispatch<SetStateAction<{ source: Source; top: number; origin?: PanelOrigin } | null>>;
  fail: (e: unknown) => void;
  setReader: Dispatch<SetStateAction<Source | null>>;
}
export function createSourceActions({ editor, doc, setCard, fail, setReader }: OperationContext) {
  async function registerCitation(s: Source, text: string) {
    await request('cite', {
      id: sourceRef(s),
      payload: { ...s, quote: text, citedAt: new Date().toISOString() },
    });
  }
  async function cite(s: Source, text: string) {
    try {
      const insert = editor.current?.prepareCitation();
      const citation = composeCitation(s, text, doc.settings.citationStyle);
      await registerCitation(s, text);
      if (!insert?.(citation))
        throw new Error(t('Le texte a changé. Replacez le curseur puis réessayez.'));
      setCard(null);
    } catch (e) {
      fail(e);
    }
  }
  async function read(s: Source) {
    try {
      const full = await request('source', { id: s.id });
      full.page = s.page;
      setReader(full);
      setCard(null);
    } catch (e) {
      fail(e);
    }
  }
  return { registerCitation, cite, read };
}
