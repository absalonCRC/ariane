import { t, useLocale } from '../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { request } from '../platform/client';
import type { Version } from '../contracts/history';
import { comparePassages, reprisePassage, sectionChanges } from './comparison';
import { descendants } from '../project/tree';
import type { HistoryProps } from './types';
export function useHistory(p: HistoryProps) {
  const locale = useLocale();
  const [versions, setVersions] = useState<Version[]>([]);
  const [moreVersions, setMoreVersions] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('current');
  const [loaded, setLoaded] = useState<{ left: Version | null; right: Version | null }>({
    left: null,
    right: null,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [scope, setScope] = useState('project');
  const [scene, setScene] = useState(
    p.project.sections.find((s) => s.id === p.active && s.kind === 'scene')?.id ??
      p.project.sections.find((s) => s.kind === 'scene')?.id ??
      '',
  );
  useEffect(() => {
    if (!p.active) return;
    const activeScene = descendants(p.project.sections, p.active).find((s) => s.kind === 'scene');
    if (activeScene) setScene(activeScene.id);
  }, [p.active, p.project.sections]);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [view, setView] = useState<'source' | 'reading'>('source');
  const [confirm, setConfirm] = useState<Version | null>(null);
  const [changeIndex, setChangeIndex] = useState(-1);
  const diffRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    void p
      .flush()
      .then(() => request('versions'))
      .then((values) => {
        if (alive) {
          setVersions(values);
          setMoreVersions(values.length === 50);
          setLeftId(values[0]?.id ?? 'current');
        }
      })
      .catch((e) => {
        if (alive) {
          setError(String(e));
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [p.project.path]);
  useEffect(() => {
    if (!leftId) return;
    let alive = true;
    setLoading(true);
    setError('');
    Promise.all([
      leftId === 'current' ? null : request('version', { id: leftId }),
      rightId === 'current' ? null : request('version', { id: rightId }),
    ])
      .then(([left, right]) => {
        if (alive) setLoaded({ left, right });
      })
      .catch((e) => {
        if (alive) setError(String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [leftId, rightId, p.project.path]);
  const incompatible =
    loaded.left?.scope && loaded.right?.scope && loaded.left.scope !== loaded.right.scope;
  const entries = useMemo(() => {
    let left = (loaded.left?.sections ?? p.project.sections).filter((s) => !s.trashed);
    let right = (loaded.right?.sections ?? p.project.sections).filter((s) => !s.trashed);
    const selectedScope = loaded.left?.scope || loaded.right?.scope;
    if (selectedScope) {
      left = descendants(left, selectedScope);
      right = descendants(right, selectedScope);
    }
    const ids = [...new Set([...left, ...right].map((s) => s.id))];
    return ids.map((id) => {
      const a = left.find((s) => s.id === id),
        b = right.find((s) => s.id === id);
      return {
        id,
        left: a,
        right: b,
        title: b?.title || a?.title || t('Sans titre'),
        changed: !a || !b || a.text !== b.text || sectionChanges(a, b).length > 0,
      };
    });
  }, [loaded, p.project.sections, locale]);
  const visible = entries.filter((e) => !onlyChanged || e.changed);
  const selected = visible.find((e) => e.id === scene) ?? visible[0];
  const metadata = sectionChanges(selected?.left, selected?.right);
  const rows = useMemo(
    () => comparePassages(selected?.left?.text ?? '', selected?.right?.text ?? ''),
    [selected?.left?.text, selected?.right?.text],
  );
  const changes = rows.flatMap((r, i) => (r.changed ? [i] : []));
  const added = rows.reduce(
    (n, r) =>
      n +
      r.words
        .filter((w) => w.added)
        .reduce((sum, w) => sum + (w.value.match(/[\p{L}\p{N}]+/gu)?.length ?? 0), 0),
    0,
  );
  const removed = rows.reduce(
    (n, r) =>
      n +
      r.words
        .filter((w) => w.removed)
        .reduce((sum, w) => sum + (w.value.match(/[\p{L}\p{N}]+/gu)?.length ?? 0), 0),
    0,
  );
  useEffect(() => {
    setChangeIndex(-1);
    if (diffRef.current) diffRef.current.scrollTop = 0;
  }, [selected?.id, leftId, rightId]);
  async function capture() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await p.flush();
      const version = await request('capture', {
        name: name.trim(),
        scope: scope === 'project' ? null : p.active,
      });
      setVersions(await request('versions'));
      setLeftId(version.id);
      setRightId('current');
      setName('');
      setCreating(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!confirm || busy) return;
    setBusy(true);
    setError('');
    try {
      await p.flush();
      p.onRestore(await request('restore', { id: confirm.id }));
      p.onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function apply(index: number) {
    const live = p.project.sections.find((s) => s.id === selected?.id);
    if (!live || rightId !== 'current' || busy) return;
    setBusy(true);
    setError('');
    try {
      const revision = live.revision;
      await p.flush();
      await request('capture', { name: t('Avant reprise de passage'), scope: live.id });
      await p.onApply(live.id, reprisePassage(live.text, rows[index]), revision);
      setVersions(await request('versions'));
      setChangeIndex(-1);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function nextChange(direction: number) {
    if (!changes.length) return;
    const next =
      changeIndex < 0
        ? direction > 0
          ? 0
          : changes.length - 1
        : (changeIndex + direction + changes.length) % changes.length;
    setChangeIndex(next);
    diffRef.current
      ?.querySelector<HTMLElement>(`[data-change="${changes[next]}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
  return {
    versions,
    setVersions,
    moreVersions,
    setMoreVersions,
    loadingMore,
    setLoadingMore,
    leftId,
    setLeftId,
    rightId,
    setRightId,
    loaded,
    loading,
    busy,
    error,
    setError,
    name,
    setName,
    creating,
    setCreating,
    scope,
    setScope,
    setScene,
    onlyChanged,
    setOnlyChanged,
    view,
    setView,
    confirm,
    setConfirm,
    changeIndex,
    diffRef,
    incompatible,
    visible,
    selected,
    metadata,
    rows,
    changes,
    added,
    removed,
    capture,
    restore,
    apply,
    nextChange,
  };
}
export type HistoryController = ReturnType<typeof useHistory>;
