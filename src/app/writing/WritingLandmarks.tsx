import { useLayoutEffect, useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import type { WritingPoint } from '../../contracts/writingSession';
import type { useWritingBranches } from '../../history/useWritingBranches';
import { t } from '../../i18n';
import type { Workspace } from '../useWorkspace';

export function WritingLandmarks({
  workspace,
  branches,
  visible,
  clearViews,
}: {
  workspace: Workspace;
  branches: ReturnType<typeof useWritingBranches>;
  visible: boolean;
  clearViews: () => void;
}) {
  const { doc, editor, landmarkActions, locatePassage, fail } = workspace;
  const [draft, setDraft] = useState<{ point: WritingPoint; text: string } | null>(null);
  const saved = doc.settings.tomorrow;
  const branch = doc.project?.activeBranch ?? branches.state?.activeBranch ?? 'main';
  const scene = saved && doc.project?.sections.find((s) => s.id === saved.point.section);
  const node = saved?.point.node && scene?.outline?.nodes.find((n) => n.id === saved.point.node);
  const available = scene && (!saved?.point.node || node);
  const top =
    visible && saved && available && (!saved.point.branch || saved.point.branch === branch)
      ? editor.current?.passageTop(
          saved.point.section,
          node ? node.start + saved.point.offset : saved.point.position,
        )
      : null;
  function open() {
    const note = doc.settingsRef.current.tomorrow;
    const point = note?.point ?? editor.current?.writingPoint?.();
    if (!point) return fail(t('Placez le curseur dans le manuscrit.'));
    setDraft({ point, text: note?.text ?? '' });
  }
  async function go(point?: WritingPoint | null) {
    if (!point) return fail(t('Aucune frappe enregistrée dans ce projet.'));
    const path = doc.ref.current?.path;
    if (point.branch && point.branch !== branch) {
      if (!branches.state?.branches.some((b) => b.id === point.branch))
        return fail(t('La variante de ce passage est indisponible.'));
      let reached = false;
      await branches.switchBranch(point.branch, () => {
        reached = true;
      });
      if (!reached) return;
    }
    if (doc.ref.current?.path !== path) return;
    if (!doc.ref.current?.sections.some((s) => s.id === point.section))
      return fail(t('Ce passage a été supprimé.'));
    clearViews();
    await locatePassage(point.section, point.node, '', {
      offset: point.offset,
      cursor: point.position,
    });
  }
  useLayoutEffect(() => {
    landmarkActions.current = {
      lastEdit: () => void go(doc.settingsRef.current.lastEdit),
      tomorrow: open,
    };
    return () => {
      landmarkActions.current = null;
    };
  });
  return (
    <>
      {top != null && saved && (
        <button
          type="button"
          className="tomorrow-margin"
          style={{ top }}
          aria-label={t('Mot pour demain') + ' · ' + saved.text}
          title={saved.text}
          onClick={open}
        >
          <NotebookPen size={15} aria-hidden="true" />
          <span>{saved.text}</span>
        </button>
      )}
      {draft && (
        <Dialog modal title={t('Mot pour demain')} onClose={() => setDraft(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!draft.text.trim()) return;
              doc.configure({ tomorrow: { point: draft.point, text: draft.text.trim() } });
              setDraft(null);
            }}
          >
            <label className="writing-aid-field">
              {t('À reprendre à ce passage')}
              <textarea
                value={draft.text}
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              />
            </label>
            {saved && !available && <p>{t('Ce passage est indisponible.')}</p>}
            <div className="dialog-actions">
              {saved && (
                <button
                  className="soft"
                  type="button"
                  onClick={() => {
                    doc.configure({ tomorrow: null });
                    setDraft(null);
                  }}
                >
                  {t('Effacer le mot')}
                </button>
              )}
              {saved && (
                <button
                  className="soft"
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    void go(saved.point);
                  }}
                >
                  {t('Rejoindre le passage')}
                </button>
              )}
              {saved && !available && (
                <button
                  type="button"
                  onClick={() => {
                    const point = editor.current?.writingPoint?.();
                    if (point) setDraft({ ...draft, point });
                  }}
                >
                  {t('Rattacher au curseur')}
                </button>
              )}
              <button className="primary" disabled={!draft.text.trim()}>
                {t('Enregistrer')}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
