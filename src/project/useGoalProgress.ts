import { useEffect, useState } from 'react';
import { localeTag, t } from '../i18n';
import { manuscriptSections } from './tree';
import type { ProjectController } from './useProject';

export function useGoalProgress({ project, settings, subscribeEdits }: ProjectController) {
  const [total, setTotal] = useState(0);
  const enabled = !!settings.projectGoal && settings.showGoals !== false;
  useEffect(() => {
    if (!enabled || !project) return;
    const scenes = new Map(
      manuscriptSections(project.sections)
        .filter((s) => s.kind === 'scene')
        .map((s) => [s.id, s]),
    );
    const counts = new Map<string, number>();
    const pending = new Set(scenes.keys());
    let sum = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      timer = undefined;
      for (const id of pending) {
        const count = scenes.get(id)!.text.match(/\S+/gu)?.length ?? 0;
        sum += count - (counts.get(id) ?? 0);
        counts.set(id, count);
      }
      pending.clear();
      setTotal(sum);
    };
    update();
    const stop = subscribeEdits((ids) => {
      for (const id of ids) if (scenes.has(id)) pending.add(id);
      if (pending.size && timer === undefined) timer = setTimeout(update, 250);
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [project, enabled, subscribeEdits]);
  if (settings.showGoals === false) return '';
  const format = (n: number) => n.toLocaleString(localeTag());
  return [
    settings.projectGoal &&
      t('Projet {0} / {1}', { 0: format(total), 1: format(settings.projectGoal) }),
    settings.sessionGoal &&
      t('Séance {0} / {1}', {
        0: format(settings.sessionWords ?? 0),
        1: format(settings.sessionGoal),
      }),
  ]
    .filter(Boolean)
    .join(' · ');
}
